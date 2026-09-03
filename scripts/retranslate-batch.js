"use strict";

const fs = require("fs");
const path = require("path");

function loadEnv(file) {
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        let val = match[2].trim();
        if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
        process.env[match[1]] = val;
      }
    }
  }
}

loadEnv(path.join(__dirname, "..", ".env"));
loadEnv(path.join(__dirname, "..", ".env.local"));

const { createStorage, createArchiveStorage } = require("../server/storage");
const { getOriginalChapter, saveTranslatedChapter } = require("./direct-translate");
const { translateText, parseApiKeys } = require("../server/gemini");
const { calculateFluencyScore } = require("../server/reflection-engine");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const storage = createStorage();
  const privateStorage = createArchiveStorage();
  const bookId = "fanqie-6497813734990285837";
  
  let r2Keys = [];
  try {
    const raw = privateStorage && await privateStorage.get("config/api-keys.json");
    if (raw) r2Keys = JSON.parse(raw.toString("utf8"));
  } catch {}
  
  const envKeys = [
    process.env.GEMINI_API_KEYS,
    process.env.GEMINI_API_KEY,
    process.env.GROQ_API_KEYS,
    process.env.GROQ_API_KEY
  ].filter(Boolean).flatMap(parseApiKeys);
  
  const allKeys = Array.from(new Set([...r2Keys, ...envKeys])).filter(Boolean);
  
  // Clean retranslate chapters 11 to 35
  for (let ch = 11; ch <= 35; ch++) {
    console.log(`\n========================================`);
    console.log(`>>> Dịch sạch Chương ${ch}...`);
    const orig = await getOriginalChapter(bookId, ch, 1);
    if (!orig) continue;
    
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const start = Date.now();
        const res = await translateText(orig.content, allKeys, {
          bookId,
          bookTitle: "Ma Y Thần Toán Tử",
          forceCloud: true
        });
        
        const flu = calculateFluencyScore(res.translation);
        console.log(`[Chương ${ch}] Thành công (${Date.now() - start}ms) - Fluency: ${flu.score}/10 - Issues: ${flu.issues.join("; ") || "0 lỗi"}`);
        
        await saveTranslatedChapter({
          bookId,
          chapterNumber: ch,
          revision: 1,
          translation: res.translation,
          titleVi: orig.title
        });
        break;
      } catch (err) {
        console.warn(`[Chương ${ch}] Thử ${attempt} lỗi: ${err.message}. Chờ 15s...`);
        await wait(15000);
      }
    }
    await wait(3000);
  }
  
  console.log("\n✓ ĐÃ HOÀN TẤT DỊCH SẠCH CHƯƠNG 11 ĐẾN 35!");
}

main().catch(console.error);
