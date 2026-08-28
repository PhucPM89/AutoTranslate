"use strict";

const fs = require("fs");
const path = require("path");

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

const ROOT = path.join(__dirname, "..");
const env = {
  ...parseEnvFile(path.join(ROOT, ".env")),
  ...parseEnvFile(path.join(ROOT, ".env.local")),
  ...process.env
};

const { createStorage } = require("../server/storage/index");

async function checkLiveStatus() {
  const storage = createStorage(env);
  const rawStatus = await storage.get("jobs/translate-status.json");
  if (rawStatus) {
    const status = JSON.parse(rawStatus.toString("utf8"));
    console.log("=== CURRENT LIVE STATUS ===");
    console.log({
      state: status.state,
      bookTitle: status.currentBookTitle,
      currentChapter: status.currentChapter,
      completed: status.currentCompleted,
      total: status.currentTotalChapters,
      translatedThisRun: status.translatedThisRun,
      lastSuccessAt: status.lastSuccessAt,
      lastSuccessfulChapter: status.lastSuccessfulChapter,
      speed: status.speed
    });
  }

  const rawAudit = await storage.get("jobs/qa-audit-log.json");
  if (rawAudit) {
    const log = JSON.parse(rawAudit.toString("utf8"));
    console.log(`\n=== QA AUDIT LOG (${log.length} records) ===`);
    console.log("Last 5 repaired chapters:", log.slice(0, 5));
  }
}

checkLiveStatus().catch(console.error);
