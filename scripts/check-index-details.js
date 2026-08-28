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

async function checkIndexChapterDetails() {
  const storage = createStorage(env);
  const bookId = "fanqie-7373165433928567832";
  const indexRaw = await storage.get(`books/${bookId}/index.json`);
  if (!indexRaw) return;
  const index = JSON.parse(indexRaw.toString("utf8"));
  console.log("Index title:", index.title);
  console.log("Total chapters in index:", index.chapters?.length);
  const ch575 = index.chapters?.find(c => c.n === 575 || c.chapterNumber === 575);
  const ch580 = index.chapters?.find(c => c.n === 580 || c.chapterNumber === 580);
  const ch100 = index.chapters?.find(c => c.n === 100 || c.chapterNumber === 100);
  console.log("Chapter 100 in index:", ch100);
  console.log("Chapter 575 in index:", ch575);
  console.log("Chapter 580 in index:", ch580);

  // Check how many have provider === 'gemini'
  const gemCount = index.chapters?.filter(c => c.provider === "gemini").length;
  const hachimiCount = index.chapters?.filter(c => c.provider === "hachimi").length;
  console.log("Counts in this index:", { gemCount, hachimiCount });
}

checkIndexChapterDetails().catch(console.error);
