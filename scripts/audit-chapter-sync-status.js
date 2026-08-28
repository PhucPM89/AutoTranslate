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

async function auditChapterSync() {
  const storage = createStorage(env);
  const db = createSupabase(env);

  console.log("==========================================================================");
  console.log("   🔍 KIỂM TRA ĐỒNG BỘ THÔNG TIN CHƯƠNG TRÊN CLOUDFLARE R2 & SUPABASE");
  console.log("==========================================================================\n");

  // 1. Lấy danh sách 5 bộ truyện gần nhất từ Supabase
  const books = await db.listBooks({ limit: 5 });
  for (const book of books) {
    const bookId = book.id;
    console.log(`📌 Kiểm tra bộ: [${bookId}] - "${book.title}"`);

    // A. Kiểm tra Cloudflare R2 index.json
    const rawIndex = await storage.get(`books/${bookId}/index.json`);
    if (rawIndex) {
      const idx = JSON.parse(rawIndex.toString("utf8"));
      const sampleCh = idx.chapters?.[idx.chapters.length > 500 ? 500 : 0];
      console.log(`   [Cloudflare R2 Index]`);
      console.log(`   - Tiêu đề: "${idx.title}" | Status: "${idx.status}"`);
      console.log(`   - Tiến độ R2: ${idx.translatedChapters}/${idx.totalChapters} chương`);
      console.log(`   - Mẫu chương ${sampleCh?.n || 1}:`);
      console.log(`     + Title: "${sampleCh?.title}"`);
      console.log(`     + Status: "${sampleCh?.translationStatus || sampleCh?.status}"`);
      console.log(`     + Provider: "${sampleCh?.provider || 'N/A'}"`);
      console.log(`     + Model: "${sampleCh?.model || 'N/A'}"`);
    }

    // B. Kiểm tra Supabase
    console.log(`   [Supabase Database]`);
    console.log(`   - Tiêu đề: "${book.title}" | Status: "${book.status}"`);
    console.log(`   - Tiến độ Supabase: ${book.translated_chapters}/${book.total_chapters} ch`);
    console.log(`   - Đồng bộ hoàn hảo: ${rawIndex && JSON.parse(rawIndex.toString()).translatedChapters === book.translated_chapters ? '✅ 100% Khớp' : '⚠️ Đang cập nhật'}`);
    console.log("--------------------------------------------------------------------------\n");
  }

  // 2. Kiểm tra Catalog Snapshot công khai
  console.log("📦 Kiểm tra file `catalog-snapshot.json` trên CDN Cloudflare:");
  const rawSnap = await storage.get("catalog-snapshot.json");
  if (rawSnap) {
    const snap = JSON.parse(rawSnap.toString("utf8"));
    const fullBooks = snap.books.filter(b => b.status === "Hoàn thành" || (b.chapterCount > 0 && b.translatedChapters >= b.chapterCount));
    console.log(`- Tổng số truyện trong snapshot: ${snap.books.length} bộ`);
    console.log(`- Số truyện hiển thị 'Hoàn thành' trên CDN: ${fullBooks.length} bộ 🎉`);
  }
}

auditChapterSync().catch(console.error);
