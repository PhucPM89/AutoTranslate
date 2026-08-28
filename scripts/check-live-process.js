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

async function checkLiveProcess() {
  const storage = createStorage(env);
  const rawStatus = await storage.get("jobs/translate-status.json");
  if (rawStatus) {
    const status = JSON.parse(rawStatus.toString("utf8"));
    console.log("=== TRANSLATE STATUS ===");
    console.log("State:", status.state);
    console.log("Book Title:", status.currentBookTitle);
    console.log("Book ID:", status.currentBookId);
    console.log("Current Chapter:", status.currentChapter);
    console.log("Completed:", status.currentCompleted);
    console.log("Translated this run:", status.translatedThisRun);
    console.log("Updated at:", status.updatedAt);
    console.log("Message:", status.message);
    console.log("Keys in status:", Object.keys(status));
  }
}

checkLiveProcess().catch(console.error);
