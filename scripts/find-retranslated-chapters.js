"use strict";

const fs = require("fs");
const path = require("path");

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

const ROOT = path.join(__dirname, "..");
const env = {
  ...parseEnvFile(path.join(ROOT, ".env")),
  ...parseEnvFile(path.join(ROOT, ".env.local")),
  ...process.env
};

const { createStorage, createArchiveStorage } = require("../server/storage/index");
const { createSupabase } = require("../server/supabase");

async function findRetranslatedChapters() {
  const storage = createStorage(env);
  const archive = createArchiveStorage(env);
  const db = createSupabase(env);

  console.log("=================================================================");
  console.log("   🔍 DANH SÁCH CHI TIẾT CÁC CHƯƠNG ĐÃ ĐƯỢC GEMINI DỊCH LẠI");
  console.log("=================================================================\n");

  // 1. Check QA Audit Log for exact chapter-by-chapter log
  try {
    const rawLog = await storage.get("jobs/qa-audit-log.json");
    if (rawLog) {
      const log = JSON.parse(rawLog.toString("utf8"));
      if (Array.isArray(log) && log.length > 0) {
        console.log("=================================================================");
        console.log(`📋 NHẬT KÝ CHI TIẾT CÁC CHƯƠNG ĐÃ ĐƯỢC GEMINI HẬU KIỂM & SỬA CHỮA (${log.length} bản ghi):`);
        console.log("=================================================================\n");
        for (let i = 0; i < Math.min(log.length, 50); i++) {
          const item = log[i];
          console.log(`${i + 1}. [${item.bookTitle || item.bookId}] — Chương ${item.chapterNumber}`);
          console.log(`   • Thời gian sửa: ${item.timestamp}`);
          console.log(`   • Model xử lý: ${item.repairedWith || "gemini-3.6-flash"}`);
          console.log(`   • Lỗi phát hiện & khắc phục: ${Array.isArray(item.issuesFound) ? item.issuesFound.join(", ") : item.issuesFound}`);
          console.log(`   • Dung lượng sau hoàn thiện: ${item.charCount} ký tự Tiếng Việt`);
          console.log("");
        }
      }
    }
  } catch (err) {}

  // 2. Check translate-status
  try {
    const rawStatus = await archive?.get("jobs/translate-status.json") || await storage.get("jobs/translate-status.json");
    if (rawStatus) {
      const status = JSON.parse(rawStatus.toString("utf8"));
      if (Array.isArray(status.dailyScannedBooks) && status.dailyScannedBooks.length > 0) {
        console.log("=================================================================");
        console.log("📊 CÁC BỘ TRUYỆN ĐÃ ĐƯỢC QUÉT TRONG NGÀY (TỪ TRANSLATE-STATUS):");
        console.log("=================================================================\n");
        for (const item of status.dailyScannedBooks) {
          console.log(`- [${item.bookTitle}] (ID: ${item.bookId})`);
          console.log(`  + Đã quét: ${item.scannedChapters}/${item.totalChapters} chương`);
          console.log(`  + Số chương Gemini đã sửa lại: ${item.repairedChapters || 0} chương`);
          console.log(`  + Điểm trôi chảy: ${item.fluencyScore || 10}/10 ⭐`);
          console.log(`  + Trạng thái: ${item.statusLabel || item.status}`);
          console.log(`  + Thời gian: ${item.lastScannedAt || ""}\n`);
        }
      }
    }
  } catch (err) {}
}

findRetranslatedChapters().catch(console.error);
