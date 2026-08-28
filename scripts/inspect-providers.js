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

async function inspectProviders() {
  const storage = createStorage(env);

  // Check some books
  const booksToCheck = [
    "mieu-cuong-co-su",
    "fanqie-6511591158211152910",
    "fanqie-7550205522633313304"
  ];

  for (const bId of booksToCheck) {
    console.log(`\n=== BOOK: ${bId} ===`);
    const chDoc = await storage.get(`books/${bId}/r1/ch/50.json`);
    if (chDoc) {
      const doc = JSON.parse(chDoc.toString("utf8"));
      console.log("Chapter 50:", {
        provider: doc.provider,
        model: doc.model,
        updatedAt: doc.updatedAt,
        keys: Object.keys(doc)
      });
    }
  }

  // Check jobs/translation.json for worker
  const jobDoc = await storage.get("jobs/translate-status.json");
  if (jobDoc) {
    const status = JSON.parse(jobDoc.toString("utf8"));
    console.log("\n=== TRANSLATE STATUS ===");
    console.log(status);
  }
}

inspectProviders().catch(console.error);
