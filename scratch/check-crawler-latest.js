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

const { createArchiveStorage } = require("../server/storage");

async function check() {
  const archive = createArchiveStorage();
  const raw = await archive.get("crawler/status.json");
  if (raw) {
    const status = JSON.parse(raw.toString("utf8"));
    console.log("Current Crawler Status:\n", JSON.stringify(status, null, 2));
  }
}

check().catch(console.error);
