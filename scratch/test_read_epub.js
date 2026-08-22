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
const { readEpub } = require("../server/ingest/epub");

async function main() {
  const storage = createStorage();
  const testBookId = "fanqie-7077546460056652803"; // Đạp Thiên Cảnh
  const rawEpub = await storage.get(`books/${testBookId}/r1/source.epub`) || await storage.get(`books/${testBookId}/source.epub`);
  if (rawEpub) {
    const epub = await readEpub(rawEpub);
    console.log("EPUB Metadata:", epub.metadata);
  } else {
    console.log("No source.epub found for", testBookId);
  }
}

main().catch(console.error);
