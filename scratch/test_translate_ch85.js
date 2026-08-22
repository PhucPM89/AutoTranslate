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
const { createStorage } = require("../server/storage");
const { translateText } = require("../server/gemini");
const { createTranslationEngine } = require("../server/translation-engine");

async function main() {
  const storage = createStorage();
  const bookId = "fanqie-6497813954591460365";
  const chNum = 85;

  const origRaw = await storage.get(`books/${bookId}/r1/ch/${chNum}.original.json`);
  const doc = JSON.parse(origRaw.toString());

  const engine = createTranslationEngine();
  const glossary = await engine.loadGlossary(bookId);

  console.log("Testing translateText for chapter 85 with production gemini.js...");
  const keys = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").split(",");
  const start = Date.now();
  const res = await translateText(doc.content, keys, {
    bookId,
    glossary,
    engine
  });

  console.log("\n[SUCCESS] Chapter 85 translated successfully in " + ((Date.now() - start)/1000).toFixed(2) + "s:", {
    length: res.translation?.length,
    modelsUsed: res.modelsUsed,
    chunkCount: res.chunkCount,
    elapsedMs: res.elapsedMs
  });
  console.log("\nPreview:\n", res.translation?.slice(0, 300));
}

main().catch(console.error);
