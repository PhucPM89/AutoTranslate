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

async function classifyAll() {
  const good = [];
  const minor = [];
  const truncated = [];

  for (let i = 1; i <= 250; i++) {
    const rawKey = `books/${BOOK_ID}/r1/ch/${i}.original.json`;
    const transKey = `books/${BOOK_ID}/r1/ch/${i}.json`;

    const rawBuf = await storage.get(rawKey);
    const transBuf = await storage.get(transKey);

    if (!transBuf || !rawBuf) {
      truncated.push({ ch: i, reason: "MISSING_FILE" });
      continue;
    }

    const rawDoc = JSON.parse(rawBuf.toString("utf8"));
    const transDoc = JSON.parse(transBuf.toString("utf8"));

    const rawContent = rawDoc.content || rawDoc.text || "";
    const transContent = transDoc.content || "";

    // Raw paragraphs excluding titles/notes
    let rawParas = rawContent.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    // Trans paragraphs (handling both double and single newline)
    let doubleParas = transContent.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    let singleParas = transContent.split(/\n+/).map(p => p.trim()).filter(Boolean);
    let transParas = doubleParas.length > 1 ? doubleParas : singleParas;

    // Filter out title lines in rawParas if present
    while (rawParas.length > 0 && /^(第[0-9一二三四五六七八九十百千]+章|\(.*\)|（.*）)/.test(rawParas[0])) {
      rawParas.shift();
    }
    while (rawParas.length > 0 && (/^(\(.*\)|（.*）|\(\)|（）)$/.test(rawParas[rawParas.length - 1]) || rawParas[rawParas.length - 1].length < 5)) {
      rawParas.pop();
    }

    const diff = Math.abs(rawParas.length - transParas.length);
    const ratio = transParas.length / (rawParas.length || 1);

    if (ratio < 0.7 || diff > 15) {
      truncated.push({ ch: i, title: transDoc.title, rawCount: rawParas.length, transCount: transParas.length, ratio: ratio.toFixed(2), diff });
    } else if (diff <= 3) {
      good.push({ ch: i, title: transDoc.title, rawCount: rawParas.length, transCount: transParas.length, diff });
    } else {
      minor.push({ ch: i, title: transDoc.title, rawCount: rawParas.length, transCount: transParas.length, diff });
    }
  }

  console.log(`=== CLASSIFICATION REPORT (Total 250 Chapters) ===`);
  console.log(`✅ HIGH FIDELITY / PARITY (Diff <= 3): ${good.length}`);
  console.log(`⚠️ MINOR PARAGRAPH MERGES (Diff 4..15): ${minor.length}`);
  console.log(`❌ TRUNCATED / SUMMARIZED (Ratio < 0.7 or Diff > 15): ${truncated.length}`);

  console.log("\n--- TRUNCATED CHAPTER LIST ---");
  console.log(truncated.map(t => `Ch ${t.ch} (${t.title}): Raw=${t.rawCount}, Trans=${t.transCount}, Ratio=${t.ratio}, Diff=${t.diff}`).join("\n"));

  console.log("\n--- MINOR MERGE CHAPTER LIST ---");
  console.log(minor.map(m => `Ch ${m.ch}: Raw=${m.rawCount}, Trans=${m.transCount}, Diff=${m.diff}`).join("\n"));
}

classifyAll().catch(console.error);
