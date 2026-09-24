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
const BOOK_ID = "qidian-1036575193";

async function main() {
  const ch = Number(process.argv[2] || 251);
  const rawKey = `books/${BOOK_ID}/r1/ch/${ch}.original.json`;
  const buf = await storage.get(rawKey);
  if (!buf) {
    console.log("No raw buf for ch", ch);
    return;
  }
  const doc = JSON.parse(buf.toString("utf8"));
  const rawText = String(doc.content || doc.text || "").replace(/\r\n/g, "\n").trim();
  const paras = (rawText.includes("\n\n") ? rawText.split(/\n\s*\n/) : rawText.split(/\n/))
    .map(p => p.trim())
    .filter(Boolean);

  const start = Number(process.argv[3] || 0);
  const count = Number(process.argv[4] || 25);
  console.log(`=== CHAPTER ${ch}: ${doc.title} (${paras.length} paras, showing [${start}..${start + count - 1}]) ===`);
  paras.slice(start, start + count).forEach((p, idx) => {
    console.log(`[P${start + idx}] ${p}`);
  });
}

main().catch(console.error);
