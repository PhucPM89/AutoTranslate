"use strict";

const fs = require("node:fs");
const path = require("node:path");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}
loadEnv(path.resolve(".env.local"));
loadEnv(path.resolve(".env"));

const { createStorage } = require("../server/storage");
const { listAudioJobs, nextAudioJob } = require("../server/audio/job-queue");

async function main() {
  const storage = createStorage();
  console.log("Storage Driver:", storage.driver);
  console.log("Storage Folder ID:", storage.folderId || "N/A");

  const jobs = await listAudioJobs(storage);
  console.log(`Tìm thấy ${jobs.length} jobs trong index:`);
  for (const j of jobs) {
    console.log(`- Job ID: ${j.id} | Book: ${j.bookTitle} (${j.bookId})`);
    console.log(`  Status: ${j.status} | Tiến độ: ${j.completedChapters}/${j.totalChapters} (${j.progress}%)`);
    console.log(`  Updated: ${j.updatedAt} | Mode: ${j.mode}`);
    console.log(`  Stage: ${j.stageMessage}`);
    if (j.status === "running" || j.error) {
      console.log(`  Failures: ${j.consecutiveFailures || 0} | Attempts: ${j.attempts || 0} | Error: ${j.error || "None"}`);
    }
  }

  const next = await nextAudioJob(storage);
  console.log("\nNext Audio Job được chọn:");
  if (next) {
    console.log(`=> ID: ${next.id}, Book: ${next.bookTitle} (${next.bookId}), Status: ${next.status}`);
  } else {
    console.log("=> Không có job nào!");
  }

  const { findChapterAudioOnDrive } = require("../server/audio/drive-storage");
  const ch1 = await findChapterAudioOnDrive({ bookId: "qidian-1036575193", bookName: "Ranh Giới Hoàng Hôn", chapterNumber: 1 });
  if (ch1 && ch1.file) {
    console.log(`\n[GOOGLE DRIVE] File Chương 1 trên Drive:`);
    console.log(`- File ID: ${ch1.file.id} | Name: ${ch1.file.name} | Size: ${(ch1.file.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`- Public URL: ${ch1.url}`);
  }

  const rawManifest = await storage.get("audio-jobs/manifests/qidian-1036575193.json");
  if (rawManifest) {
    const manifest = JSON.parse(rawManifest.toString("utf8"));
    const chapters = Object.keys(manifest.audioChapters || {});
    console.log(`\n[MANIFEST TRÊN DRIVE] Đã ghi nhận ${chapters.length} chương hoàn chỉnh:`);
    for (const ch of chapters.sort((a, b) => Number(a) - Number(b))) {
      const item = manifest.audioChapters[ch];
      console.log(`  ✓ Chương ${ch}: Thời lượng ${item.durationSeconds || "N/A"}s | File ID: ${item.fileId || "N/A"}`);
    }
  }
}

main().catch(err => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
