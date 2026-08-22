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

process.env.GROQ_MODEL = "openai/gpt-oss-120b";
process.env.GROQ_FALLBACK_MODELS = "groq/compound-mini,qwen/qwen3.6-27b,openai/gpt-oss-20b";

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

  console.log("Translating Chapter 85 with openai/gpt-oss-120b...");
  const keys = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").split(",");
  const start = Date.now();
  const res = await translateText(doc.content, keys, {
    bookId,
    glossary,
    engine
  });

  console.log("\n[SUCCESS] Translation completed in " + ((Date.now() - start)/1000).toFixed(2) + "s:", {
    length: res.translation?.length,
    modelsUsed: res.modelsUsed,
    elapsedMs: res.elapsedMs
  });
  console.log("\nTranslated Preview:\n", res.translation?.slice(0, 300));
}

main().catch(console.error);
