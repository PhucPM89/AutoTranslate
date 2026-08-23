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
const { jobStateKey } = require("../server/ingest/translation-queue");

async function main() {
  const storage = createStorage();
  const bookId = "fanqie-6883748331202284558";

  console.log("Checking all completed chapters in Yen Vu Lau for truncation...");
  const stateRaw = await storage.get(jobStateKey(bookId));
  const state = JSON.parse(stateRaw.toString("utf8"));
  const completed = state.chapters.filter(c => c.status === "completed");

  const shortChapters = [];
  for (const c of completed) {
    if (c.n > 800 && c.n < 1555) {
      const raw = await storage.get(`books/${bookId}/r1/ch/${c.n}.json`);
      if (raw) {
        const doc = JSON.parse(raw.toString("utf8"));
        if (doc.characters < 1800) {
          shortChapters.push({ n: c.n, title: doc.title, chars: doc.characters, end: doc.content.slice(-50).replace(/\n/g, " ") });
        }
      }
    }
  }

  console.log(`Found ${shortChapters.length} short/truncated chapters between 800 and 1555:`);
  console.table(shortChapters);
}

main().catch(console.error);
