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

async function main() {
  const storage = createStorage();
  const rawStatus = await storage.get("jobs/translate-status.json");
  if (rawStatus) {
    const parsed = JSON.parse(rawStatus.toString("utf8"));
    console.log(JSON.stringify({
      updatedAt: parsed.updatedAt,
      state: parsed.state,
      message: parsed.message,
      spentRequests: parsed.spentRequests,
      translatedThisRun: parsed.translatedThisRun,
      currentBookId: parsed.currentBookId,
      finishedAt: parsed.finishedAt
    }, null, 2));
  }
}

main().catch(console.error);
