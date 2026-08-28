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

async function backfillTags() {
  const storage = createStorage(env);
  const archive = createArchiveStorage(env);
  const db = createSupabase(env);

  console.log("=================================================================");
  console.log("   🏷️  BẮT ĐẦU PHỦ LẠI TAG PROVIDER CHO TOÀN BỘ THƯ VIỆN");
  console.log("=================================================================\n");

  let books = [];
  if (db) {
    books = await db.listBooks({ limit: 200 });
  }

  // Load existing QA audit log to cross-reference Gemini repaired chapters
  let qaAuditChapters = new Set();
  try {
    const rawAudit = await storage.get("jobs/qa-audit-log.json");
    if (rawAudit) {
      const auditLog = JSON.parse(rawAudit.toString("utf8"));
      if (Array.isArray(auditLog)) {
        for (const entry of auditLog) {
          if (entry.bookId && entry.chapterNumber) {
            qaAuditChapters.add(`${entry.bookId}:${entry.chapterNumber}`);
          }
        }
      }
    }
  } catch {}

  console.log(`- Tìm thấy ${books.length} bộ truyện trong thư viện cần kiểm tra và phủ tag.`);
  console.log(`- Số chương đã ghi nhận trong QA Audit Log: ${qaAuditChapters.size}\n`);

  let totalUpdatedBooks = 0;
  let totalTaggedChapters = 0;
  let totalHachimiTagged = 0;
  let totalGeminiTagged = 0;
  let totalConvertTagged = 0;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const bookId = book.id;

    try {
      const indexRaw = await storage.get(`books/${bookId}/index.json`);
      if (!indexRaw) continue;
      const index = JSON.parse(indexRaw.toString("utf8"));
      const title = index.title || book.title || bookId;
      const chapters = index.chapters || [];

      if (!chapters.length) continue;

      let bookHachimi = 0;
      let bookGemini = 0;
      let bookConvert = 0;
      let changed = false;

      for (let idx = 0; idx < chapters.length; idx++) {
        const ch = chapters[idx];
        const chNum = ch.n || ch.chapterNumber || (idx + 1);
        const isCompleted = ch.translationStatus === "completed" || ch.status === "completed";

        if (isCompleted) {
          const isGeminiAudit = qaAuditChapters.has(`${bookId}:${chNum}`);
          if (isGeminiAudit || ch.provider === "gemini") {
            ch.provider = "gemini";
            ch.model = ch.model || "gemini-3.6-flash";
            ch.qaReviewed = true;
            bookGemini++;
            totalGeminiTagged++;
          } else {
            ch.provider = ch.provider || "hachimi";
            ch.model = ch.model || "HachimiMT-60-QT";
            ch.qaReviewed = ch.qaReviewed || false;
            bookHachimi++;
            totalHachimiTagged++;
          }
          changed = true;
        } else {
          ch.provider = ch.provider || "crawler-convert";
          ch.translationStatus = ch.translationStatus || "convert";
          bookConvert++;
          totalConvertTagged++;
          changed = true;
        }
        totalTaggedChapters++;
      }

      if (changed) {
        index.updatedAt = new Date().toISOString();
        await storage.put(`books/${bookId}/index.json`, JSON.stringify(index));
        totalUpdatedBooks++;
        console.log(`[${i + 1}/${books.length}] Đã phủ tag [${title}] (Tổng: ${chapters.length} ch) ➔ Hachimi: ${bookHachimi}, Gemini: ${bookGemini}, Convert: ${bookConvert}`);
      }
    } catch (err) {
      console.warn(`❌ Lỗi khi xử lý bộ ${bookId}:`, err.message);
    }
  }

  console.log("\n=================================================================");
  console.log("🎉 HOÀN TẤT QUÁ TRÌNH PHỦ TAG CHO TOÀN BỘ HỆ THỐNG!");
  console.log(`- Tổng số bộ truyện đã cập nhật:  ${totalUpdatedBooks} bộ`);
  console.log(`- Tổng số chương đã phủ tag:      ${totalTaggedChapters.toLocaleString("vi-VN")} chương`);
  console.log(`  + 🤖 Tag Hachimi MT:             ${totalHachimiTagged.toLocaleString("vi-VN")} chương`);
  console.log(`  + ⭐ Tag Gemini QA/Dịch lại:     ${totalGeminiTagged.toLocaleString("vi-VN")} chương`);
  console.log(`  + 📄 Tag Crawler / Convert:      ${totalConvertTagged.toLocaleString("vi-VN")} chương`);
  console.log("=================================================================\n");
}

backfillTags().catch(console.error);
