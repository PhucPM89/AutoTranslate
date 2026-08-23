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

  console.log("Fast scanning Yen Vu Lau for short/truncated chapters (800 - 1555)...");
  const stateRaw = await storage.get(jobStateKey(bookId));
  const state = JSON.parse(stateRaw.toString("utf8"));
  const targetChapters = state.chapters.filter(c => c.status === "completed" && c.n >= 800 && c.n <= 1555).map(c => c.n);

  const shortList = [];
  const chunkSize = 40;
  for (let i = 0; i < targetChapters.length; i += chunkSize) {
    const chunk = targetChapters.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (n) => {
      try {
        const raw = await storage.get(`books/${bookId}/r1/ch/${n}.json`);
        if (raw) {
          const doc = JSON.parse(raw.toString("utf8"));
          if (doc.characters < 1800) {
            shortList.push({ n, title: doc.title, chars: doc.characters, end: doc.content.slice(-40).replace(/\n/g, " ") });
          }
        }
      } catch {}
    }));
  }

  shortList.sort((a, b) => a.n - b.n);
  console.log(`✓ Scan complete! Found ${shortList.length} short/truncated chapters:`);
  console.table(shortList);
}

main().catch(console.error);
