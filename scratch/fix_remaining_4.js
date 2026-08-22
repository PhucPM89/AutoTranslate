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

delete require.cache[require.resolve("../server/gemini")];
delete require.cache[require.resolve("../server/translation-engine")];

const { createStorage } = require("../server/storage");
const { translateText } = require("../server/gemini");
const { createTranslationEngine } = require("../server/translation-engine");

const REMAINING_ITEMS = [
  { bookId: "fanqie-6985246250434038815", chapterNumber: 130 },
  { bookId: "fanqie-6985246250434038815", chapterNumber: 131 },
  { bookId: "fanqie-7196962342398069821", chapterNumber: 85 },
  { bookId: "fanqie-7567841691395181592", chapterNumber: 8 }
];

async function main() {
  const storage = createStorage();
  const engine = createTranslationEngine();
  const keys = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").split(",").map(k => k.trim()).filter(Boolean);

  console.log("=== ĐANG XỬ LÝ 4 CHƯƠNG CUỐI CÙNG ===");

  for (const item of REMAINING_ITEMS) {
    const chKey = `books/${item.bookId}/r1/ch/${item.chapterNumber}.json`;
    const origKey = `books/${item.bookId}/r1/ch/${item.chapterNumber}.original.json`;

    console.log(`\nĐang dịch lại [${item.bookId}] Chương ${item.chapterNumber}...`);
    const rawOrig = await storage.get(origKey);
    if (!rawOrig) {
      console.warn(`  [Bỏ qua] Không có file gốc ${origKey}`);
      continue;
    }

    const origDoc = JSON.parse(rawOrig.toString());
    const glossary = await engine.loadGlossary(item.bookId);

    try {
      const res = await translateText(origDoc.content, keys, {
        bookId: item.bookId,
        glossary,
        engine
      });

      const clean = engine.postProcessTranslation(res.translation, glossary);
      const updatedDoc = {
        chapterNumber: item.chapterNumber,
        title: origDoc.title || `Chương ${item.chapterNumber}`,
        content: clean,
        updatedAt: new Date().toISOString()
      };

      await storage.put(chKey, Buffer.from(JSON.stringify(updatedDoc, null, 2)), "application/json");
      console.log(`  ➔ THÀNH CÔNG [${item.bookId}] ch ${item.chapterNumber} (${clean.length} ký tự).`);
      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      console.error(`  [LỖI]`, err.message);
    }
  }

  console.log("\nĐÃ XỬ LÝ XONG 4 CHƯƠNG CUỐI CÙNG!");
}

main().catch(console.error);
