"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAudioJob, listAudioJobs, updateAudioJob, nextAudioJob } = require("./job-queue");

function memoryStorage() {
  const values = new Map();
  return {
    async get(key) { return values.has(key) ? Buffer.from(values.get(key)) : null; },
    async put(key, value) { values.set(key, Buffer.isBuffer(value) ? value : Buffer.from(value)); }
  };
}

test("audio queue deduplicates active jobs and tracks progress", async () => {
  const storage = memoryStorage();
  const first = await createAudioJob({ bookId: "book-1", bookTitle: "Truyện Một", totalChapters: 12 }, storage);
  const duplicate = await createAudioJob({ bookId: "book-1", bookTitle: "Truyện Một", totalChapters: 12 }, storage);
  assert.equal(duplicate.id, first.id);
  await updateAudioJob(first.id, { status: "running", completedChapters: 3, progress: 25 }, storage);
  const jobs = await listAudioJobs(storage);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].completedChapters, 3);
});

test("audio queue respects retryAt", async () => {
  const storage = memoryStorage();
  const job = await createAudioJob({ bookId: "book-2", totalChapters: 2 }, storage);
  await updateAudioJob(job.id, { status: "retrying", retryAt: new Date(Date.now() + 60000).toISOString() }, storage);
  assert.equal(await nextAudioJob(storage), null);
  await updateAudioJob(job.id, { retryAt: new Date(Date.now() - 1000).toISOString() }, storage);
  assert.equal((await nextAudioJob(storage)).id, job.id);
});

test("getAudioBookStatus and missing_only deduplication", async () => {
  const { getAudioBookStatus } = require("./job-queue");
  const storage = memoryStorage();
  
  // Set up book with 5 chapters
  await storage.put("books/book-demo/index.json", JSON.stringify({
    title: "Demo Book",
    revision: 1,
    chapterCount: 5
  }));

  // Chapters 1 and 2 already have audio in storage
  await storage.put("books/book-demo/r1/ch/1.json", JSON.stringify({
    title: "Chương 1",
    content: "Nội dung chương 1",
    audio: { status: "ready", url: "https://drive.google.com/test1" }
  }));
  await storage.put("books/book-demo/r1/ch/2.json", JSON.stringify({
    title: "Chương 2",
    content: "Nội dung chương 2",
    audio: { status: "ready", url: "https://drive.google.com/test2" }
  }));
  await storage.put("books/book-demo/r1/ch/3.json", JSON.stringify({
    title: "Chương 3",
    content: "Nội dung chương 3"
  }));
  await storage.put("books/book-demo/r1/ch/4.json", JSON.stringify({
    title: "Chương 4",
    content: "Nội dung chương 4"
  }));
  await storage.put("books/book-demo/r1/ch/5.json", JSON.stringify({
    title: "Chương 5",
    content: "Nội dung chương 5"
  }));

  // 1. Check status
  const status = await getAudioBookStatus("book-demo", storage);
  assert.equal(status.totalChapters, 5);
  assert.equal(status.audioChaptersCount, 2);
  assert.deepEqual(status.audioChapters, [1, 2]);
  assert.equal(status.missingChaptersCount, 3);
  assert.equal(status.firstMissingChapter, 3);
  assert.equal(status.isFullyCreated, false);
  assert.equal(status.percent, 40);

  // 2. Create job in missing_only mode -> should resume from chapter 3
  const job = await createAudioJob({ bookId: "book-demo", bookTitle: "Demo Book", totalChapters: 5 }, storage);
  assert.equal(job.completedChapters, 2);
  assert.equal(job.startChapter, 3);
  assert.equal(job.progress, 40);
  assert.equal(job.mode, "missing_only");
});

test("createAudioJob rejects when book is already 100% complete unless forceAll is set", async () => {
  const storage = memoryStorage();
  await storage.put("books/book-full/index.json", JSON.stringify({
    title: "Full Book",
    chapterCount: 2
  }));
  await storage.put("audio-jobs/manifests/book-full.json", JSON.stringify({
    bookId: "book-full",
    totalChapters: 2,
    audioChapters: {
      "1": { ready: true },
      "2": { ready: true }
    }
  }));

  // Reject when not forcing
  await assert.rejects(
    async () => {
      await createAudioJob({ bookId: "book-full", bookTitle: "Full Book", totalChapters: 2 }, storage);
    },
    (err) => {
      assert.match(err.message, /đã có đủ audio cho toàn bộ 2 chương/);
      return true;
    }
  );

  // Succeed when forceAll is true
  const forceJob = await createAudioJob({
    bookId: "book-full",
    bookTitle: "Full Book",
    totalChapters: 2,
    forceAll: true
  }, storage);
  assert.equal(forceJob.mode, "force_all");
  assert.equal(forceJob.startChapter, 1);
});

test("createAudioJob rejects when starting chapter has no Vietnamese translation", async () => {
  const storage = memoryStorage();
  await storage.put("books/book-raw/index.json", JSON.stringify({
    title: "Raw Chinese Book",
    revision: 1,
    chapterCount: 10
  }));
  await storage.put("books/book-raw/r1/ch/1.json", JSON.stringify({
    title: "第一章",
    content: "这是一段未经翻译的中文小说正文。"
  }));

  await assert.rejects(
    async () => {
      await createAudioJob({ bookId: "book-raw", bookTitle: "Raw Chinese Book", totalChapters: 10 }, storage);
    },
    (err) => {
      assert.match(err.message, /chưa có bản dịch tiếng Việt/);
      return true;
    }
  );
});

