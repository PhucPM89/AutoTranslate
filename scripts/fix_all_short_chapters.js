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
const { createTranslationEngine } = require("../server/translation-engine");
const { translateText } = require("../server/gemini");
const { buildChapterDocument } = require("../server/ingest/documents");

async function main() {
  const storage = createStorage();
  const bookId = "fanqie-6883748331202284558";
  const rawKeys = await storage.get("config/api-keys.json");
  const keys = JSON.parse(rawKeys.toString("utf8")).join(",");
  const engine = createTranslationEngine({ storage });

  const targetChapters = [802, 871, 879, 1049, 1128, 1459, 1547, 1550];

  console.log(`Re-translating ${targetChapters.length} short/truncated chapters with full 4096 tokens...`);

  for (const n of targetChapters) {
    console.log(`\n> Re-translating chapter ${n}...`);
    const origRaw = await storage.get(`books/${bookId}/r1/ch/${n}.original.json`);
    if (!origRaw) {
      console.log(`  Ch ${n} original not found, skipping.`);
      continue;
    }
    const orig = JSON.parse(origRaw.toString("utf8"));
    const start = Date.now();

    try {
      const res = await translateText(orig.content, keys, { bookId, engine });
      const fullTranslation = res.translation.trim();
      const doc = buildChapterDocument({
        bookId,
        revision: 1,
        chapter: {
          chapterNumber: n,
          title: orig.title
        },
        translation: fullTranslation,
        translationStatus: "completed"
      });

      await storage.put(`books/${bookId}/r1/ch/${n}.json`, JSON.stringify(doc));
      console.log(`  ✓ Chapter ${n} re-translated in ${Date.now() - start}ms! New length: ${fullTranslation.length} chars (Model: ${res.modelsUsed})`);
    } catch (err) {
      console.error(`  ✗ Error re-translating ch ${n}:`, err.message);
    }
  }

  console.log("\n✓ All target chapters re-translated and updated on R2!");
}

main().catch(console.error);
