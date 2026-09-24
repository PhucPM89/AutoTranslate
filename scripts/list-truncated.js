"use strict";

const fsSync = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
for (const envName of [".env", ".env.local"]) {
  const envFile = path.join(ROOT, envName);
  if (!fsSync.existsSync(envFile)) continue;
  for (const line of fsSync.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      let val = match[2].trim();
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      process.env[match[1]] = val;
    }
  }
}

const { createStorage } = require("../server/storage");
const storage = createStorage();

const BOOK_ID = "qidian-1036575193";

async function main() {
  const chaptersToFix = [];

  for (let i = 1; i <= 250; i++) {
    const rawKey = `books/${BOOK_ID}/r1/ch/${i}.original.json`;
    const transKey = `books/${BOOK_ID}/r1/ch/${i}.json`;

    const rawBuf = await storage.get(rawKey);
    const transBuf = await storage.get(transKey);

    if (!rawBuf || !transBuf) continue;

    const rawDoc = JSON.parse(rawBuf.toString("utf8"));
    const transDoc = JSON.parse(transBuf.toString("utf8"));

    let rawParas = (rawDoc.content || rawDoc.text || "").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    while (rawParas.length > 0 && /^(第[0-9一二三四五六七八九十百千]+章|\(.*\)|（.*）)/.test(rawParas[0])) {
      rawParas.shift();
    }
    while (rawParas.length > 0 && (/^(\(.*\)|（.*）|\(\)|（）)$/.test(rawParas[rawParas.length - 1]) || rawParas[rawParas.length - 1].length < 5)) {
      rawParas.pop();
    }

    let transParas = (transDoc.content || "").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

    const diff = Math.abs(rawParas.length - transParas.length);
    const ratio = transParas.length / (rawParas.length || 1);

    // If ratio < 0.75 or diff > 10, it's seriously incomplete
    if (ratio < 0.75 || diff > 15) {
      chaptersToFix.push({ ch: i, title: transDoc.title, rawCount: rawParas.length, transCount: transParas.length, diff, ratio: ratio.toFixed(2) });
    }
  }

  console.log(`Chapters severely needing re-edit: ${chaptersToFix.length}`);
  console.log(chaptersToFix.map(c => `Ch ${c.ch}: raw=${c.rawCount}, trans=${c.transCount}, diff=${c.diff}`).join("\n"));
}

main().catch(console.error);
