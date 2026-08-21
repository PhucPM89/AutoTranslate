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
  
  // 1. Get translate status
  const rawStatus = await storage.get("jobs/translate-status.json");
  if (rawStatus) {
    console.log("=== jobs/translate-status.json ===");
    console.log(rawStatus.toString("utf8"));
  } else {
    console.log("Không tìm thấy jobs/translate-status.json");
  }

  // 2. List jobs
  const objects = await storage.list("jobs/");
  console.log(`\nTìm thấy ${objects.length} file trong jobs/`);
  for (const obj of objects.slice(0, 10)) {
    console.log(" -", obj.key);
  }
}

main().catch(console.error);
