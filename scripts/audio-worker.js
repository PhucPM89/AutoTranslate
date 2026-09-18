"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { createStorage } = require("../server/storage");
const { nextAudioJob, updateAudioJob, updateAudioManifest } = require("../server/audio/job-queue");
const { generate } = require("./generate-drive-audio");
const { storeChapterAudio, publicDownloadUrl, findChapterAudioOnDrive } = require("../server/audio/drive-storage");
const { resolveGenreVoice } = require("../server/audio/genre-voice-map");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}
loadEnv(path.resolve(".env.local"));
loadEnv(path.resolve(".env"));

function exec(command, args, options = {}) {
  return new Promise((resolve, reject) => execFile(command, args, options, (error, stdout, stderr) => error ? reject(Object.assign(error, { stdout, stderr })) : resolve({ stdout, stderr })));
}

async function inspectAudio(filePath, text) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-of", "json", filePath], { timeout: 30000 });
  const format = JSON.parse(stdout).format || {};
  const durationSeconds = Number(format.duration || 0);
  const bytes = Number(format.size || 0);
  const charsPerSecond = String(text).replace(/\s+/g, "").length / durationSeconds;
  if (durationSeconds < 5 || bytes < 10_000 || charsPerSecond < 5 || charsPerSecond > 35) throw new Error(`Audio không đạt QA (duration=${durationSeconds.toFixed(1)}s, bytes=${bytes}, chars/s=${charsPerSecond.toFixed(1)}).`);
  return { durationSeconds, bytes, charsPerSecond };
}

async function validatePublicAudio(url, expectedBytes) {
  const response = await fetch(url, { headers: { Range: "bytes=0-1023" }, redirect: "follow" });
  const type = String(response.headers.get("content-type") || "");
  const range = String(response.headers.get("content-range") || "");
  if (response.status !== 206 || !type.includes("audio/mpeg") || !range.endsWith(`/${expectedBytes}`)) throw new Error("File Drive chưa vượt qua kiểm tra phát công khai/Range.");
}

async function processJob(job, storage) {
  await updateAudioJob(job.id, { status: "running", attempts: Number(job.attempts || 0) + 1, error: null }, storage);
  const isForce = job.mode === "force_all";
  const startAt = isForce ? (Number(job.startChapter) || 1) : Math.max(1, Number(job.startChapter || 1), Number(job.completedChapters || 0) + 1);

  for (let chapterNumber = startAt; chapterNumber <= job.totalChapters; chapterNumber += 1) {
    const fresh = await (async () => { const raw = await storage.get(`audio-jobs/jobs/${job.id}.json`); return raw && JSON.parse(raw.toString("utf8")); })();
    if (fresh?.status === "canceled") return;

    const key = `books/${job.bookId}/r${job.revision}/ch/${chapterNumber}.json`;
    const raw = await storage.get(key);
    if (!raw) throw new Error(`Thiếu dữ liệu chương ${chapterNumber}.`);
    const chapter = JSON.parse(raw.toString("utf8"));
    const text = String(chapter.content || chapter.text || "").trim();
    if (!text || /[\u3400-\u9fff]/.test(text.slice(0, 1000))) {
      console.log(`[AUDIO-WORKER] Dừng tại chương ${chapterNumber}: chưa có bản dịch tiếng Việt.`);
      await updateAudioJob(job.id, {
        status: chapterNumber > 1 ? "completed" : "waiting",
        stageMessage: chapterNumber > 1
          ? `Đã tạo audio đến chương ${chapterNumber - 1}. Các chương tiếp theo chưa có bản dịch tiếng Việt.`
          : `Chưa thể tạo audio: chương ${chapterNumber} chưa có bản dịch tiếng Việt.`
      }, storage);
      return;
    }
    const sourceSha256 = crypto.createHash("sha256").update(text).digest("hex");

    // 1. Kiểm tra nếu trong Storage đã có audio hợp lệ
    if (!isForce && chapter.audio?.status === "ready" && chapter.audio.url) {
      await updateAudioManifest(job.bookId, chapterNumber, { ready: true, url: chapter.audio.url, fileId: chapter.audio.fileId }, storage);
      await updateAudioJob(job.id, {
        completedChapters: Math.max(Number(job.completedChapters || 0), chapterNumber),
        currentChapter: chapterNumber,
        progress: Math.round(chapterNumber / job.totalChapters * 100),
        stageMessage: `Chương ${chapterNumber} đã có sẵn audio hợp lệ.`
      }, storage);
      continue;
    }

    // 2. Kiểm tra nếu file audio đã tồn tại trên Google Drive
    if (!isForce) {
      try {
        const driveAudio = await findChapterAudioOnDrive({
          bookId: job.bookId,
          chapterNumber,
          bookName: job.bookTitle,
          sourceSha256
        });
        if (driveAudio && driveAudio.url) {
          chapter.audio = {
            status: "ready",
            provider: "google-drive",
            url: driveAudio.url,
            fileId: driveAudio.file.id,
            sourceSha256: driveAudio.file.appProperties?.sourceSha256 || sourceSha256,
            durationSeconds: Number(driveAudio.file.appProperties?.durationSeconds || 0),
            bytes: Number(driveAudio.file.size || 0),
            verifiedAt: new Date().toISOString()
          };
          await storage.put(key, Buffer.from(JSON.stringify(chapter, null, 2)), { contentType: "application/json; charset=utf-8" });
          await updateAudioManifest(job.bookId, chapterNumber, { ready: true, url: driveAudio.url, fileId: driveAudio.file.id }, storage);
          await updateAudioJob(job.id, {
            completedChapters: Math.max(Number(job.completedChapters || 0), chapterNumber),
            currentChapter: chapterNumber,
            consecutiveFailures: 0,
            progress: Math.round(chapterNumber / job.totalChapters * 100),
            stageMessage: `Chương ${chapterNumber} đã có trên Google Drive, liên kết thành công.`
          }, storage);
          continue;
        }
      } catch (driveCheckErr) {
        console.warn(`[AUDIO-WORKER] Kiểm tra Drive chương ${chapterNumber}:`, driveCheckErr.message);
      }
    }

    // 3. Tiến hành tổng hợp audio với giọng đọc tối ưu theo thể loại truyện
    const workDir = path.resolve("scratch", "audio-cache", `${job.bookId}-chapter-${chapterNumber}-${sourceSha256.slice(0, 16)}`);
    fs.mkdirSync(workDir, { recursive: true });
    const output = path.join(workDir, `${job.bookId}-chapter-${String(chapterNumber).padStart(4, "0")}.mp3`);
    
    // Tự động nhận diện thể loại và chọn phong cách giọng đọc phù hợp nhất
    const voiceConfig = resolveGenreVoice(job.genre || "", job.bookTitle || "");
    console.log(`[AUDIO-WORKER] Bộ truyện "${job.bookTitle}" (Thể loại: ${voiceConfig.genreName}) => Sử dụng giọng: [${voiceConfig.voiceName}]`);

    await updateAudioJob(job.id, { currentChapter: chapterNumber, stageMessage: `Đang tạo audio chương ${chapterNumber}/${job.totalChapters} [Giọng: ${voiceConfig.voiceName}]...` }, storage);
    const generated = await generate(text, output, workDir, {
      voiceConfig,
      onProgress: async ({ completed, total }) => {
        const chapterBase = (chapterNumber - 1) / job.totalChapters;
        const within = completed / total / job.totalChapters;
        await updateAudioJob(job.id, { progress: Math.min(99, Math.round((chapterBase + within) * 100)), stageMessage: `Chương ${chapterNumber} [${voiceConfig.voiceName}]: đoạn ${completed}/${total}` }, storage);
      }
    });
    const qa = await inspectAudio(output, text);
    const stored = await storeChapterAudio({ bookId: job.bookId, bookName: job.bookTitle, chapterNumber, sourceSha256, durationSeconds: qa.durationSeconds, filePath: output });
    const url = publicDownloadUrl(stored.file.id);
    await validatePublicAudio(url, qa.bytes);
    chapter.audio = { status: "ready", provider: "edge-tts", url, fileId: stored.file.id, sourceSha256, durationSeconds: qa.durationSeconds, bytes: qa.bytes, verifiedAt: new Date().toISOString() };
    await storage.put(key, Buffer.from(JSON.stringify(chapter, null, 2)), { contentType: "application/json; charset=utf-8" });
    await updateAudioManifest(job.bookId, chapterNumber, { ready: true, url, fileId: stored.file.id, durationSeconds: qa.durationSeconds }, storage);
    fs.rmSync(workDir, { recursive: true, force: true });
    await updateAudioJob(job.id, {
      completedChapters: Math.max(Number(job.completedChapters || 0), chapterNumber),
      currentChapter: chapterNumber,
      consecutiveFailures: 0,
      progress: Math.round(chapterNumber / job.totalChapters * 100),
      stageMessage: `Đã kiểm định và công bố chương ${chapterNumber}/${job.totalChapters}.`
    }, storage);
  }

  const finalStatus = await (async () => { const raw = await storage.get(`audio-jobs/jobs/${job.id}.json`); return raw && JSON.parse(raw.toString("utf8")); })();
  if (finalStatus?.status !== "canceled") {
    await updateAudioJob(job.id, {
      status: "completed",
      progress: 100,
      completedChapters: job.totalChapters,
      currentChapter: job.totalChapters,
      stageMessage: "Đã tạo và kiểm định toàn bộ audio.",
      finishedAt: new Date().toISOString()
    }, storage);
  }
}

async function runOnce(storage = createStorage()) {
  const job = await nextAudioJob(storage);
  if (!job) return false;
  try { await processJob(job, storage); }
  catch (error) {
    const failures = Number(job.consecutiveFailures || 0) + 1;
    const delayMinutes = Math.min(60, 2 ** Math.min(failures, 6));
    await updateAudioJob(job.id, { status: "retrying", consecutiveFailures: failures, error: error.message, retryAt: new Date(Date.now() + delayMinutes * 60000).toISOString(), stageMessage: `Lỗi tạm thời; tự thử lại sau ${delayMinutes} phút.` }, storage);
    console.error(`[AUDIO] ${job.id}: ${error.message}`);
  }
  return true;
}

async function main() {
  const once = process.argv.includes("--once");
  do { const worked = await runOnce(); if (once) break; await new Promise((resolve) => setTimeout(resolve, worked ? 2000 : 60000)); } while (true);
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { inspectAudio, validatePublicAudio, processJob, runOnce };
