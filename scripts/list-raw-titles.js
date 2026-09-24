"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
for (const envName of [".env.local", ".env"]) {
  const envPath = path.join(ROOT, envName);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

const { createStorage } = require("../server/storage");
const storage = createStorage(process.env);

async function main() {
  const start = Number(process.argv[2] || 66);
  const end = Number(process.argv[3] || 75);
  for (let i = start; i <= end; i++) {
    const raw = await storage.get(`books/qidian-1041637443/r1/ch/${i}.original.json`);
    if (raw) {
      const d = JSON.parse(raw.toString("utf8"));
      const content = d.content || (Array.isArray(d.paragraphs) ? d.paragraphs.join("\n\n") : "");
      console.log(`Ch ${i}: title="${d.title}", chars=${content.length}`);
    } else {
      console.log(`Ch ${i}: NOT FOUND in R2`);
    }
  }
}

main().catch(console.error);
