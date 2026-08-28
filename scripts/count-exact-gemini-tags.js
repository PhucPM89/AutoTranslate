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

const { createStorage } = require("../server/storage/index");
const { createSupabase } = require("../server/supabase");

async function countGeminiTags() {
  const storage = createStorage(env);
  const db = createSupabase(env);

  console.log("==========================================================================");
  console.log("   🔍 KIỂM ĐẾM CHÍNH XÁC CÁC CHƯƠNG CÓ TAG [provider: 'gemini'] TOÀN HỆ THỐNG");
  console.log("==========================================================================\n");

  let books = [];
  if (db) {
    books = await db.listBooks({ limit: 200 });
  }

  let totalGeminiChapters = 0;
  let totalHachimiChapters = 0;
  let totalConvertChapters = 0;
  const geminiBooksList = [];

  for (const book of books) {
    const bookId = book.id;
    try {
      const indexRaw = await storage.get(`books/${bookId}/index.json`);
      if (!indexRaw) continue;
      const index = JSON.parse(indexRaw.toString("utf8"));
      const title = index.title || book.title || bookId;
      const chapters = index.chapters || [];

      let bookGemini = 0;
      let bookHachimi = 0;
      let bookConvert = 0;
      const geminiChNums = [];

      for (let idx = 0; idx < chapters.length; idx++) {
        const ch = chapters[idx];
        const chNum = ch.n || ch.chapterNumber || (idx + 1);
        if (ch.provider === "gemini" || ch.qaReviewed) {
          bookGemini++;
          totalGeminiChapters++;
          geminiChNums.push(chNum);
        } else if (ch.provider === "hachimi" || ch.translationStatus === "completed" || ch.status === "completed") {
          bookHachimi++;
          totalHachimiChapters++;
        } else {
          bookConvert++;
          totalConvertChapters++;
        }
      }

      if (bookGemini > 0) {
        geminiBooksList.push({
          bookId,
          title,
          geminiCount: bookGemini,
          sampleChapters: geminiChNums.slice(0, 15),
          totalChapters: chapters.length
        });
      }
    } catch (err) {}
  }

  // Also check QA Audit Log
  let auditLogCount = 0;
  try {
    const rawAudit = await storage.get("jobs/qa-audit-log.json");
    if (rawAudit) {
      const log = JSON.parse(rawAudit.toString("utf8"));
      if (Array.isArray(log)) auditLogCount = log.length;
    }
  } catch {}

  console.log("📊 KẾT QUẢ KIỂM TRA TOÀN DIỆN:");
  console.log(`- ⭐ TỔNG SỐ CHƯƠNG ĐƯỢC GẮN TAG [provider: 'gemini']: ${totalGeminiChapters.toLocaleString("vi-VN")} CHƯƠNG`);
  console.log(`- 🤖 TỔNG SỐ CHƯƠNG CÓ TAG [provider: 'hachimi']:       ${totalHachimiChapters.toLocaleString("vi-VN")} CHƯƠNG`);
  console.log(`- 📄 TỔNG SỐ CHƯƠNG DẠNG CONVERT / RAW:                 ${totalConvertChapters.toLocaleString("vi-VN")} CHƯƠNG`);
  console.log(`- 📋 Số lượt ghi nhận trong QA Audit Log:               ${auditLogCount} lượt\n`);

  if (geminiBooksList.length > 0) {
    console.log("==========================================================================");
    console.log("📚 DANH SÁCH CHI TIẾT CÁC BỘ CÓ CHƯƠNG ĐƯỢC GẮN TAG GEMINI:");
    console.log("==========================================================================\n");
    for (let i = 0; i < geminiBooksList.length; i++) {
      const b = geminiBooksList[i];
      console.log(`${i + 1}. [${b.title}] (ID: ${b.bookId})`);
      console.log(`   • Số chương đã gắn tag Gemini: ${b.geminiCount} / ${b.totalChapters} chương`);
      console.log(`   • Danh sách các chương tiêu biểu: Chương ${b.sampleChapters.join(", ")}`);
      console.log("");
    }
  } else {
    console.log("ℹ️ Hiện tại chưa có chương nào được gán tag provider: 'gemini' trong index.json.");
  }
}

countGeminiTags().catch(console.error);
