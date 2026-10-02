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

const { listAudioJobs } = require("../server/audio/job-queue");

async function check() {
  const storage = createStorage();
  try {
    const rawJob = await storage.get("audio-jobs/jobs/audio_1790925762394_0ba55276.json");
    if (rawJob) {
      const job = JSON.parse(rawJob.toString("utf8"));
      console.log(`[JOB FILE] ID: ${job.id}`);
      console.log(`[JOB FILE] Status: ${job.status}`);
      console.log(`[JOB FILE] Current Chapter: ${job.currentChapter}`);
      console.log(`[JOB FILE] Stage: ${job.stageMessage}`);
      console.log(`[JOB FILE] Progress: ${job.completedChapters}/${job.totalChapters} (${job.progress}%)`);
      console.log(`[JOB FILE] Updated: ${job.updatedAt}`);
    } else {
      console.log("[JOB FILE] Not found!");
    }
  } catch (err) {
    console.log("[JOB FILE] Error reading:", err.message);
  }

  try {
    const rawManifest = await storage.get("audio-jobs/manifests/qidian-1036575193.json");
    if (rawManifest) {
      const manifest = JSON.parse(rawManifest.toString("utf8"));
      const chapters = Object.keys(manifest.audioChapters || {}).map(Number).sort((a, b) => a - b);
      console.log(`\n[MANIFEST] Tổng số chương hoàn thành: ${chapters.length}`);
      const lastFew = chapters.slice(-10);
      for (const ch of lastFew) {
        const info = manifest.audioChapters[ch];
        console.log(`  ✓ Chương ${ch}: Thời lượng ${info.durationSeconds}s | File ID: ${info.fileId || "N/A"}`);
      }
    }
  } catch (err) {
    console.log("[MANIFEST] Error reading manifest:", err.message);
  }
}

check().catch(console.error);
