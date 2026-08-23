"use strict";
const path = require("path");
const fs = require("fs");

function loadEnv(file) {
  if (fs.existsSync(file)) {
    for (const l of fs.readFileSync(file, "utf8").split("\n")) {
      const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        let v = m[2].trim();
        if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  }
}
loadEnv(path.join(__dirname, "..", ".env"));
loadEnv(path.join(__dirname, "..", ".env.local"));

const { createStorage } = require("../server/storage");

async function main() {
  const storage = createStorage();
  const bookId = "fanqie-6883748331202284558";

  console.log("=== KIỂM TRA MỤC LỤC INDEX.JSON ===");
  const indexRaw = await storage.get(`books/${bookId}/index.json`);
  const indexDoc = JSON.parse(indexRaw.toString("utf8"));
  console.log("chapterUrlTemplate:", indexDoc.chapterUrlTemplate);

  const matched = indexDoc.chapters.filter(c => c.n >= 1545 && c.n <= 1552);
  console.log("Chapters 1545 - 1552 in index.json:");
  console.log(matched);

  for (const c of matched) {
    const raw = await storage.get(`books/${bookId}/r1/ch/${c.n}.json`);
    if (raw) {
      const doc = JSON.parse(raw.toString("utf8"));
      console.log(`\n--- ch/${c.n}.json (characters: ${doc.characters}) ---`);
      console.log(`Title: ${doc.title}`);
      console.log(`Preview start: ${doc.content.slice(0, 100).replace(/\n/g, " ")}`);
      console.log(`Preview end: ${doc.content.slice(-100).replace(/\n/g, " ")}`);
    } else {
      console.log(`\n--- ch/${c.n}.json: NOT FOUND ---`);
    }
  }
}

main().catch(console.error);
