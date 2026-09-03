#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}
loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const { createStorage, createArchiveStorage, LAYOUT } = require("../server/storage");
const { assessTranslation, translateText, parseApiKeys } = require("../server/gemini");
const { calculateFluencyScore, reflectAndPolish } = require("../server/reflection-engine");

const args = process.argv.slice(2);
const flag = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const hasFlag = (name) => args.includes(name);

const BOOK_ID = flag("--book", "fanqie-6497813734990285837");
const FROM_CH = Math.max(1, Number(flag("--from", "1")));
const TO_CH = Number(flag("--to", "0"));
const AUTO_REPAIR = hasFlag("--repair");
const PROVIDER = flag("--provider", process.env.TRANSLATION_PROVIDER || "gemini-web");

const storage = createStorage();
const privateStorage = createArchiveStorage();

async function readJson(store, key) {
  try {
    const raw = await store.get(key);
    return raw ? JSON.parse(raw.toString("utf8")) : null;
  } catch {
    return null;
  }
}

async function getKeys() {
  let r2Keys = [];
  try {
    const raw = privateStorage && (await privateStorage.get("config/api-keys.json"));
    if (raw) r2Keys = JSON.parse(raw.toString("utf8"));
  } catch {}

  const envKeys = [
    process.env.GEMINI_API_KEYS,
    process.env.GEMINI_API_KEY,
    process.env.GROQ_API_KEYS,
    process.env.GROQ_API_KEY
  ]
    .filter(Boolean)
    .flatMap(parseApiKeys);

  return Array.from(new Set([...r2Keys, ...envKeys])).filter(Boolean);
}

async function main() {
  console.log("===============================================================");
  console.log(`🔍 [AUDIT & REPAIR] RÀ SOÁT CHẤT LƯỢNG BẢN DỊCH HỆ THỐNG`);
  console.log(`   - Bộ truyện: ${BOOK_ID}`);
  console.log(`   - Chế độ: ${AUTO_REPAIR ? "TỰ ĐỘNG SỬA LỖI (--repair)" : "CHỈ QUÉT BÁO CÁO (Dry-run)"}`);
  console.log(`   - Provider: ${PROVIDER}`);
  console.log("===============================================================\n");

  const bookIndex = await readJson(storage, LAYOUT.bookIndex(BOOK_ID));
  if (!bookIndex) {
    throw new Error(`Không tìm thấy dữ liệu bộ truyện: ${LAYOUT.bookIndex(BOOK_ID)}`);
  }

  const revision = bookIndex.revision || 1;
  const totalChapters = bookIndex.totalChapters || bookIndex.chapters?.length || 0;
  const maxCh = TO_CH > 0 ? Math.min(totalChapters, TO_CH) : totalChapters;
  const bookTitle = bookIndex.title || bookIndex.titleVi || BOOK_ID;
  const keys = await getKeys();

  console.log(`📖 Tác phẩm: "${bookTitle}" | Tổng số chương: ${totalChapters} (Revision: r${revision})`);
  console.log(`📋 Phạm vi rà soát: Chương ${FROM_CH} ➔ Chương ${maxCh}\n`);

  const results = {
    scanned: 0,
    passed: 0,
    flawed: 0,
    repairedFast: 0,
    repairedModel: 0,
    failedRepairs: 0,
    issuesSummary: {}
  };

  for (let chNum = FROM_CH; chNum <= maxCh; chNum += 1) {
    results.scanned += 1;
    const chKey = LAYOUT.chapter(BOOK_ID, revision, chNum);
    const origKey = LAYOUT.chapterOriginal(BOOK_ID, revision, chNum);

    const chData = await readJson(storage, chKey);
    if (!chData || !chData.content) {
      continue;
    }

    const origData = await readJson(privateStorage || storage, origKey);
    const sourceText = origData?.content || "";
    const currentTranslation = chData.content;

    const quality = assessTranslation(sourceText, currentTranslation);
    const fluency = calculateFluencyScore(currentTranslation);

    if (quality.acceptable && fluency.score >= 9.0) {
      results.passed += 1;
      process.stdout.write(`✓ [Ch ${chNum}] Đạt chuẩn (${fluency.score}/10)\r`);
      continue;
    }

    results.flawed += 1;
    const reasons = [];
    if (!quality.acceptable) reasons.push(quality.reason);
    if (fluency.issues?.length) reasons.push(...fluency.issues);
    const issueSummary = reasons.join(" | ");

    reasons.forEach((r) => {
      const key = r.split("(")[0].trim();
      results.issuesSummary[key] = (results.issuesSummary[key] || 0) + 1;
    });

    console.log(`\n❌ [Ch ${chNum}] Phát hiện vấn đề (Điểm: ${fluency.score}/10):`);
    console.log(`   - Lý do: ${issueSummary}`);

    if (AUTO_REPAIR) {
      // Stage 1: Fast deterministic reflection repair (Sót chữ Hán, sượng ngữ pháp, căn chỉnh dấu câu)
      const reflection = reflectAndPolish(currentTranslation, { sourceText });
      const fastScore = calculateFluencyScore(reflection.text);
      const fastQuality = assessTranslation(sourceText, reflection.text);

      if (fastQuality.acceptable && fastScore.score >= 9.0) {
        chData.content = reflection.text;
        chData.updatedAt = new Date().toISOString();
        chData.repaired = true;
        await storage.put(chKey, JSON.stringify(chData, null, 2), { cacheControl: "public, max-age=60" });
        console.log(`   ✨ [Stage 1] Đã sửa sạch hoàn hảo qua Reflection Engine ➔ Điểm mới: ${fastScore.score}/10`);
        results.repairedFast += 1;
        continue;
      }

      // Stage 2: Targeted Model Reflection & Repair (cho các chương bị cắt cụt / thiếu nội dung)
      if (sourceText) {
        console.log(`   🔄 [Stage 2] Đang nạp vào Targeted Model Reflection & Repair...`);
        try {
          const startRepair = Date.now();
          const res = await translateText(sourceText, keys, {
            bookId: BOOK_ID,
            bookTitle,
            provider: PROVIDER,
            forceCloud: PROVIDER !== "gemini-web"
          });

          const newFluency = calculateFluencyScore(res.translation);
          console.log(`   ✨ [Stage 2] Đã sửa xong (${Date.now() - startRepair}ms) ➔ Điểm mới: ${newFluency.score}/10`);

          chData.content = res.translation;
          chData.updatedAt = new Date().toISOString();
          chData.repaired = true;
          await storage.put(chKey, JSON.stringify(chData, null, 2), { cacheControl: "public, max-age=60" });

          results.repairedModel += 1;
        } catch (err) {
          console.error(`   ⚠️ Không thể sửa model: ${err.message}`);
          results.failedRepairs += 1;
        }
      }
    }
  }

  console.log("\n\n===============================================================");
  console.log(`📊 TỔNG KẾT RÀ SOÁT BẢN DỊCH:`);
  console.log(`   - Tổng chương đã quét: ${results.scanned}`);
  console.log(`   - Đạt chuẩn ban đầu: ${results.passed} chương (${Math.round((results.passed / Math.max(1, results.scanned)) * 100)}%)`);
  console.log(`   - Có vấn đề cần chỉnh: ${results.flawed} chương`);
  if (AUTO_REPAIR) {
    console.log(`   - Đã sửa sạch (Reflection): ${results.repairedFast} chương`);
    console.log(`   - Đã sửa sâu (Targeted Model): ${results.repairedModel} chương`);
    console.log(`   - Tổng đã sửa thành công: ${results.repairedFast + results.repairedModel}/${results.flawed} chương`);
    if (results.failedRepairs > 0) {
      console.log(`   - Sửa thất bại: ${results.failedRepairs} chương`);
    }
  }
  console.log(`\n📋 Thống kê loại lỗi đã xử lý:`);
  for (const [issue, count] of Object.entries(results.issuesSummary)) {
    console.log(`   • ${issue}: ${count} chương`);
  }
  console.log("===============================================================");
}

main().catch((err) => {
  console.error("Lỗi Audit:", err);
  process.exitCode = 1;
});
