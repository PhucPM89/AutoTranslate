"use strict";
const path = require("path");
const fs = require("fs");

function loadEnv(file) {
  if (fs.existsSync(file)) {
    for (const l of fs.readFileSync(file, "utf8").split("\n")) {
      const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        let v = m[2].trim();
        if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  }
}
loadEnv(path.join(__dirname, "..", ".env"));
loadEnv(path.join(__dirname, "..", ".env.local"));

const { createStorage } = require("../server/storage");

async function main() {
  const storage = createStorage();
  const jobFiles = await storage.list("jobs/");
  const translationJobs = jobFiles.filter(f => f.key.endsWith("/translation.json"));
  console.log(`Found ${translationJobs.length} translation jobs.`);

  let totalReset = 0;
  for (const item of translationJobs) {
    const raw = await storage.get(item.key);
    if (!raw) continue;
    const job = JSON.parse(raw.toString());
    let modified = false;
    if (Array.isArray(job.chapters)) {
      for (const ch of job.chapters) {
        if (ch.status === "failed" || ch.status === "retrying" || (ch.status !== "completed" && ch.attempts > 0)) {
          ch.status = "pending";
          ch.attempts = 0;
          ch.nextAttemptAt = 0;
          ch.lastError = "";
          modified = true;
          totalReset++;
        }
      }
    }
    if (modified) {
      job.updatedAt = new Date().toISOString();
      await storage.put(item.key, JSON.stringify(job));
      console.log(`  -> Reset failed chapters for ${job.bookId}`);
    }
  }
  console.log(`Successfully reset ${totalReset} stuck/failed chapters across all jobs!`);
}

main().catch(console.error);
