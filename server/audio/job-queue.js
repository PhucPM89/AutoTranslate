"use strict";

const crypto = require("node:crypto");

const INDEX_KEY = "audio-jobs/index.json";
const jobKey = (id) => `audio-jobs/jobs/${id}.json`;

async function readJson(storage, key, fallback = null) {
  const raw = await storage.get(key).catch(() => null);
  if (!raw) return fallback;
  try { return JSON.parse(raw.toString("utf8")); } catch { return fallback; }
}

async function listAudioJobs(storage) {
  return (await readJson(storage, INDEX_KEY, { jobs: [] })).jobs || [];
}

async function saveIndex(storage, summary) {
  let jobs = await listAudioJobs(storage);
  const at = jobs.findIndex((item) => item.id === summary.id);
  if (at >= 0) jobs[at] = { ...jobs[at], ...summary };
  else jobs.unshift(summary);
  jobs = jobs.slice(0, 100);
  await storage.put(INDEX_KEY, Buffer.from(JSON.stringify({ jobs, updatedAt: new Date().toISOString() }, null, 2)), { contentType: "application/json" });
}

function summary(job) {
  return {
    id: job.id, bookId: job.bookId, bookTitle: job.bookTitle, status: job.status,
    progress: job.progress, completedChapters: job.completedChapters, totalChapters: job.totalChapters,
    currentChapter: job.currentChapter, stageMessage: job.stageMessage, attempts: job.attempts,
    retryAt: job.retryAt || null, error: job.error || null,
    createdAt: job.createdAt, updatedAt: job.updatedAt
  };
}

const manifestKey = (bookId) => `audio-jobs/manifests/${bookId}.json`;

async function getAudioBookStatus(bookId, storage) {
  if (!bookId) return null;
  const rawBook = await storage.get(`books/${bookId}/index.json`).catch(() => null);
  if (!rawBook) return null;

  let book;
  try { book = JSON.parse(rawBook.toString("utf8")); } catch { return null; }

  const totalChapters = Number(book.chapterCount || book.totalChapters || book.chapters?.length || 0);
  const revision = Number(book.revision || 1);
  const bookTitle = String(book.title || bookId);

  // 1. Check cached manifest first
  let manifest = await readJson(storage, manifestKey(bookId), null);
  const completed = new Set();

  if (manifest && manifest.audioChapters && typeof manifest.audioChapters === "object") {
    for (const ch of Object.keys(manifest.audioChapters)) {
      completed.add(Number(ch));
    }
  } else {
    // 2. Scan chapter files if manifest doesn't exist yet
    // Scan chapters in concurrent chunks
    const BATCH_SIZE = 25;
    for (let start = 1; start <= totalChapters; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, totalChapters);
      const promises = [];
      for (let n = start; n <= end; n += 1) {
        promises.push((async (chNum) => {
          const rawCh = await storage.get(`books/${bookId}/r${revision}/ch/${chNum}.json`).catch(() => null);
          if (!rawCh) return;
          try {
            const chDoc = JSON.parse(rawCh.toString("utf8"));
            if (chDoc.audio?.status === "ready" || chDoc.audio?.url || chDoc.audioUrl) {
              completed.add(chNum);
            }
          } catch {}
        })(n));
      }
      await Promise.all(promises);
    }

    // Check existing jobs in history as well
    const jobs = await listAudioJobs(storage);
    const existingJob = jobs.find((j) => j.bookId === bookId && j.completedChapters > 0);
    if (existingJob) {
      for (let i = 1; i <= Number(existingJob.completedChapters); i += 1) {
        completed.add(i);
      }
    }

    // Save initial manifest for quick future lookup
    const audioChaptersObj = {};
    for (const n of completed) {
      audioChaptersObj[n] = { ready: true };
    }
    manifest = {
      bookId,
      totalChapters,
      revision,
      audioChapters: audioChaptersObj,
      updatedAt: new Date().toISOString()
    };
    await storage.put(manifestKey(bookId), Buffer.from(JSON.stringify(manifest, null, 2)), { contentType: "application/json" }).catch(() => {});
  }

  const audioChapters = Array.from(completed).sort((a, b) => a - b);
  const audioChaptersCount = audioChapters.length;
  const missingChaptersCount = Math.max(0, totalChapters - audioChaptersCount);

  let firstMissingChapter = 1;
  while (completed.has(firstMissingChapter) && firstMissingChapter <= totalChapters) {
    firstMissingChapter += 1;
  }

  const isFullyCreated = totalChapters > 0 && audioChaptersCount >= totalChapters;
  const percent = totalChapters > 0 ? Math.round((audioChaptersCount / totalChapters) * 100) : 0;

  return {
    bookId,
    bookTitle,
    revision,
    totalChapters,
    audioChaptersCount,
    audioChapters,
    missingChaptersCount,
    firstMissingChapter: firstMissingChapter > totalChapters ? totalChapters : firstMissingChapter,
    isFullyCreated,
    percent
  };
}

async function updateAudioManifest(bookId, chapterNumber, audioMeta, storage) {
  if (!bookId || !chapterNumber) return;
  const manifest = await readJson(storage, manifestKey(bookId), {
    bookId,
    audioChapters: {},
    updatedAt: new Date().toISOString()
  });
  if (!manifest.audioChapters) manifest.audioChapters = {};
  manifest.audioChapters[chapterNumber] = { ...audioMeta, updatedAt: new Date().toISOString() };
  manifest.updatedAt = new Date().toISOString();
  await storage.put(manifestKey(bookId), Buffer.from(JSON.stringify(manifest, null, 2)), { contentType: "application/json" }).catch(() => {});
}

async function createAudioJob({ bookId, bookTitle, revision = 1, totalChapters, mode = "missing_only", startChapter = null, forceAll = false }, storage) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(String(bookId || ""))) throw new Error("bookId không hợp lệ.");
  const total = Number(totalChapters);
  if (!Number.isInteger(total) || total < 1) throw new Error("Bộ truyện chưa có chương để tạo audio.");

  const active = (await listAudioJobs(storage)).find((item) => item.bookId === bookId && ["pending", "running", "retrying"].includes(item.status));
  if (active) return readJson(storage, jobKey(active.id), active);

  let completedChapters = 0;
  let start = 1;
  let progress = 0;
  let stageMessage = "Đang chờ audio worker cục bộ...";
  const isForce = forceAll || mode === "force_all";

  if (!isForce) {
    const status = await getAudioBookStatus(bookId, storage);
    if (status) {
      if (status.isFullyCreated) {
        throw new Error(`Bộ truyện "${bookTitle || bookId}" đã có đủ audio cho toàn bộ ${status.totalChapters} chương. Chọn 'Tạo lại toàn bộ' nếu bạn muốn ghi đè.`);
      }
      if (status.audioChaptersCount > 0) {
        completedChapters = status.audioChaptersCount;
        start = startChapter ? Math.max(1, Number(startChapter)) : status.firstMissingChapter;
        progress = Math.min(99, Math.round((status.audioChaptersCount / total) * 100));
        stageMessage = `Đã có sẵn ${status.audioChaptersCount}/${total} chương audio. Sẽ tạo tiếp từ chương ${start}...`;
      }
    }
  } else {
    start = startChapter ? Math.max(1, Number(startChapter)) : 1;
    stageMessage = `Chuẩn bị tạo lại toàn bộ audio từ chương ${start}...`;
  }

  // Chặn tạo audio nếu chương bắt đầu chưa có bản dịch tiếng Việt
  const chKey = `books/${bookId}/r${revision}/ch/${start}.json`;
  const rawCh = await storage.get(chKey).catch(() => null);
  if (rawCh) {
    try {
      const chDoc = JSON.parse(rawCh.toString("utf8"));
      const text = String(chDoc.content || chDoc.text || "").trim();
      if (!text || /[\u3400-\u9fff]/.test(text.slice(0, 1000))) {
        throw new Error(`Chương ${start} chưa có bản dịch tiếng Việt. Chỉ có thể tạo audio cho các chương đã dịch.`);
      }
    } catch (e) {
      if (e.message.includes("chưa có bản dịch")) throw e;
    }
  }

  const now = new Date().toISOString();
  const id = `audio_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const job = {
    id,
    bookId,
    bookTitle: String(bookTitle || bookId),
    revision: Number(revision) || 1,
    status: "pending",
    progress,
    totalChapters: total,
    completedChapters,
    currentChapter: Math.max(0, start - 1),
    startChapter: start,
    mode: isForce ? "force_all" : "missing_only",
    attempts: 0,
    consecutiveFailures: 0,
    stageMessage,
    error: null,
    createdAt: now,
    updatedAt: now
  };
  await storage.put(jobKey(id), Buffer.from(JSON.stringify(job, null, 2)), { contentType: "application/json" });
  await saveIndex(storage, summary(job));
  return job;
}

async function getAudioJob(id, storage) { return readJson(storage, jobKey(id)); }

async function updateAudioJob(id, patch, storage) {
  const current = await getAudioJob(id, storage);
  if (!current) throw new Error(`Không tìm thấy audio job ${id}.`);
  const job = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await storage.put(jobKey(id), Buffer.from(JSON.stringify(job, null, 2)), { contentType: "application/json" });
  await saveIndex(storage, summary(job));
  return job;
}

async function nextAudioJob(storage) {
  const jobs = await listAudioJobs(storage);
  const now = Date.now();
  const item = jobs.find((job) => job.status === "pending" || (job.status === "retrying" && (!job.retryAt || new Date(job.retryAt).getTime() <= now)));
  return item ? getAudioJob(item.id, storage) : null;
}

module.exports = {
  INDEX_KEY,
  jobKey,
  manifestKey,
  listAudioJobs,
  createAudioJob,
  getAudioJob,
  updateAudioJob,
  nextAudioJob,
  getAudioBookStatus,
  updateAudioManifest
};
