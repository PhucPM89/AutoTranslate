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

async function countPendingHachimiBooks() {
  const storage = createStorage(env);
  const db = createSupabase(env);

  console.log("==========================================================================");
  console.log("   📊 THỐNG KÊ CHI TIẾT CÁC BỘ TRUYỆN CHỜ HACHIMI DỊCH");
  console.log("==========================================================================\n");

  let books = [];
  if (db) {
    books = await db.listBooks({ limit: 300 });
  }

  const fullyTranslated = [];
  const partiallyTranslated = [];
  const completelyUntranslated = [];

  let totalChaptersAllBooks = 0;
  let totalTranslatedChapters = 0;
  let totalPendingChapters = 0;

  for (const book of books) {
    const bookId = book.id;
    try {
      const indexRaw = await storage.get(`books/${bookId}/index.json`);
      if (!indexRaw) continue;
      const index = JSON.parse(indexRaw.toString("utf8"));
      const title = index.title || book.title || bookId;
      const total = Number(index.totalChapters || index.chapters?.length || 0);
      const done = Number(index.translatedChapters || 0);
      const pending = Math.max(0, total - done);

      totalChaptersAllBooks += total;
      totalTranslatedChapters += done;
      totalPendingChapters += pending;

      const item = {
        bookId,
        title,
        total,
        done,
        pending,
        pct: total > 0 ? ((done / total) * 100).toFixed(1) : 0
      };

      if (done >= total && total > 0) {
        fullyTranslated.push(item);
      } else if (done > 0) {
        partiallyTranslated.push(item);
      } else {
        completelyUntranslated.push(item);
      }
    } catch (err) {}
  }

  const totalBooks = fullyTranslated.length + partiallyTranslated.length + completelyUntranslated.length;
  const totalNeedTranslationBooks = partiallyTranslated.length + completelyUntranslated.length;

  console.log("📈 TỔNG QUAN TOÀN BỘ KHO TRUYỆN:");
  console.log(`- Tổng số bộ truyện trong thư viện:   ${totalBooks} bộ (${totalChaptersAllBooks.toLocaleString("vi-VN")} chương)`);
  console.log(`- 🎉 Đã dịch hoàn thành 100% (FULL):   ${fullyTranslated.length} bộ (${fullyTranslated.reduce((acc, b) => acc + b.done, 0).toLocaleString("vi-VN")} chương)`);
  console.log(`- ⏳ TỔNG SỐ BỘ CHƯA XONG / CẦN DỊCH:  ${totalNeedTranslationBooks} BỘ (${totalPendingChapters.toLocaleString("vi-VN")} chương còn lại)`);
  console.log(`    + 🔄 Đang dịch dở dang (Partially): ${partiallyTranslated.length} bộ`);
  console.log(`    + 📄 Chưa dịch chương nào (Convert): ${completelyUntranslated.length} bộ`);
  console.log("==========================================================================\n");

  if (partiallyTranslated.length > 0) {
    console.log(`🔄 DANH SÁCH ${partiallyTranslated.length} BỘ ĐANG DỊCH DỞ DANG (ĐƯỢC ƯU TIÊN TIẾP TỤC DỊCH):`);
    partiallyTranslated
      .sort((a, b) => b.done - a.done)
      .slice(0, 15)
      .forEach((b, i) => {
        console.log(`   ${i + 1}. [${b.title}] ➔ Đã dịch ${b.done}/${b.total} ch (${b.pct}%) — Còn ${b.pending} chương`);
      });
    if (partiallyTranslated.length > 15) {
      console.log(`   ... và ${partiallyTranslated.length - 15} bộ dịch dở khác.`);
    }
    console.log("");
  }

  if (completelyUntranslated.length > 0) {
    console.log(`📄 DANH SÁCH TIÊU BIỂU CÁC BỘ MỚI NGUYÊN (0% - CHỜ DỊCH):`);
    completelyUntranslated.slice(0, 10).forEach((b, i) => {
      console.log(`   ${i + 1}. [${b.title}] (Tổng ${b.total} chương)`);
    });
    if (completelyUntranslated.length > 10) {
      console.log(`   ... và ${completelyUntranslated.length - 10} bộ mới khác.`);
    }
  }
}

countPendingHachimiBooks().catch(console.error);
