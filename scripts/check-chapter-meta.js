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

async function checkChapterMeta() {
  const storage = createStorage(env);

  // Check some sample chapters
  const bookId = "fanqie-7550205522633313304";
  const ch1 = await storage.get(`books/${bookId}/r1/c1.json`);
  const ch100 = await storage.get(`books/${bookId}/r1/c100.json`);
  const ch1300 = await storage.get(`books/${bookId}/r1/c1300.json`);

  console.log("=== CHAPTER 1 ===");
  if (ch1) console.log(JSON.parse(ch1.toString("utf8")));

  console.log("\n=== CHAPTER 100 ===");
  if (ch100) {
    const doc = JSON.parse(ch100.toString("utf8"));
    console.log({
      bookId: doc.bookId,
      chapterNumber: doc.chapterNumber,
      title: doc.title,
      characters: doc.characters || (doc.content ? doc.content.length : 0),
      updatedAt: doc.updatedAt,
      translationStatus: doc.translationStatus,
      keys: Object.keys(doc)
    });
  }

  console.log("\n=== CHAPTER 1300 ===");
  if (ch1300) {
    const doc = JSON.parse(ch1300.toString("utf8"));
    console.log({
      bookId: doc.bookId,
      chapterNumber: doc.chapterNumber,
      title: doc.title,
      characters: doc.characters || (doc.content ? doc.content.length : 0),
      updatedAt: doc.updatedAt,
      translationStatus: doc.translationStatus,
      keys: Object.keys(doc)
    });
  }
}

checkChapterMeta().catch(console.error);
