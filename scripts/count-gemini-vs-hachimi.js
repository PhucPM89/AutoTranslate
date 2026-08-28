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

async function analyzeTranslations() {
  const storage = createStorage(env);
  const archive = createArchiveStorage(env);
  const db = createSupabase(env);

  console.log("==========================================================================");
  console.log("   📊 THỐNG KÊ TỔNG SỐ CHƯƠNG ĐÃ DỊCH: GEMINI vs HACHIMI");
  console.log("==========================================================================\n");

  let books = [];
  if (db) {
    books = await db.listBooks({ limit: 100 });
  }

  let totalGeminiChapters = 0;
  let totalHachimiChapters = 0;
  let totalCompletedChapters = 0;
  let totalLibraryChapters = 0;

  const bookStats = [];

  for (const book of books) {
    const bookId = book.id;
    try {
      const indexRaw = await storage.get(`books/${bookId}/index.json`);
      if (!indexRaw) continue;
      const index = JSON.parse(indexRaw.toString("utf8"));
      const title = index.title || book.title || bookId;
      const chapters = index.chapters || [];
      totalLibraryChapters += chapters.length;

      let bookGeminiCount = 0;
      let bookHachimiCount = 0;

      for (const ch of chapters) {
        const isDone = ch.translationStatus === "completed" || ch.status === "completed";
        if (isDone) {
          totalCompletedChapters++;
          // Check chapter title format:
          // Gemini translated chapters have clean Vietnamese titles ("Chương X: ...")
          // Hachimi / raw chapters have Han titles ("第X章" or "简介" or "第...卷")
          const isGemini = ch.title && /^Chương\s+\d+/i.test(ch.title.trim());
          if (isGemini) {
            bookGeminiCount++;
            totalGeminiChapters++;
          } else {
            bookHachimiCount++;
            totalHachimiChapters++;
          }
        }
      }

      if (bookGeminiCount > 0 || bookHachimiCount > 0) {
        bookStats.push({
          bookId,
          title,
          total: chapters.length,
          gemini: bookGeminiCount,
          hachimi: bookHachimiCount,
          completed: bookGeminiCount + bookHachimiCount
        });
      }
    } catch (err) {}
  }

  // Sort by Gemini chapters descending
  bookStats.sort((a, b) => b.gemini - a.gemini);

  console.log("🔹 CHI TIẾT THEO TỪNG BỘ TRUYỆN:\n");
  for (let i = 0; i < bookStats.length; i++) {
    const b = bookStats[i];
    console.log(`${i + 1}. [${b.title}]`);
    console.log(`   • Tổng số chương: ${b.total.toLocaleString("vi-VN")}`);
    console.log(`   • ⭐ Đã dịch/hậu kiểm bằng Gemini: ${b.gemini.toLocaleString("vi-VN")} chương (${((b.gemini / b.total) * 100).toFixed(1)}%)`);
    console.log(`   • 🤖 Dịch bằng Hachimi / Convert: ${b.hachimi.toLocaleString("vi-VN")} chương (${((b.hachimi / b.total) * 100).toFixed(1)}%)`);
    console.log("");
  }

  console.log("==========================================================================");
  console.log(`🎉 TỔNG KẾT TOÀN THƯ VIỆN:`);
  console.log(`- Tổng số chương trong toàn bộ thư viện:   ${totalLibraryChapters.toLocaleString("vi-VN")} chương`);
  console.log(`- Tổng số chương đã dịch hoàn tất:         ${totalCompletedChapters.toLocaleString("vi-VN")} chương`);
  console.log(`- ⭐ Tổng số chương do GEMINI dịch/hậu kiểm: ${totalGeminiChapters.toLocaleString("vi-VN")} CHƯƠNG`);
  console.log(`- 🤖 Tổng số chương do HACHIMI/Convert:      ${totalHachimiChapters.toLocaleString("vi-VN")} CHƯƠNG`);
  console.log("==========================================================================\n");
}

analyzeTranslations().catch(console.error);
