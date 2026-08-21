"use strict";

const path = require("path");
const fs = require("fs");

function loadEnvFile(file) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match) {
        let val = match[2].trim();
        if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
        process.env[match[1]] = val;
      }
    }
  }
}

loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { createStorage } = require("../server/storage");
const { summarize } = require("../server/ingest/translation-queue");

async function main() {
  const storage = createStorage();
  const objects = await storage.list("jobs/");
  console.log(`Objects in jobs/: ${objects.length}`);
  
  let validJobFiles = 0;
  for (const obj of objects) {
    if (!obj.key.endsWith("/translation.json")) continue;
    validJobFiles++;
    const raw = await storage.get(obj.key);
    if (!raw) continue;
    const state = JSON.parse(raw.toString("utf8"));
    const counts = summarize(state);
    if (validJobFiles <= 5 || counts.completed < counts.total) {
      console.log(`Job: ${obj.key} -> total: ${counts.total}, completed: ${counts.completed}, pending: ${counts.pending}, failed: ${counts.failed}`);
    }
  }
  console.log(`Total translation.json files: ${validJobFiles}`);
}

main().catch(console.error);
