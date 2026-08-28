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

async function checkAllBooksR2VsSupabase() {
  const storage = createStorage(env);
  const db = createSupabase(env);

  console.log("==========================================================================");
  console.log("   🔍 KIỂM TRA ĐỐI CHIẾU SỐ LƯỢNG TRUYỆN: R2 STORAGE VS SUPABASE DB");
  console.log("==========================================================================\n");

  // 1. Check R2 Storage
  console.log("1. Đang quét danh sách thư mục `books/` trên Cloudflare R2...");
  const objects = await storage.list("books/");
  const indexKeys = objects.filter(o => o.key && o.key.endsWith("/index.json"));
  console.log(`➔ R2 Storage: Tìm thấy ${indexKeys.length} file index.json (tương đương ${indexKeys.length} bộ truyện trên R2).`);

  // 2. Check Supabase
  let supabaseBooks = [];
  if (db) {
    supabaseBooks = await db.listBooks({ limit: 1000 });
  }
  console.log(`➔ Supabase DB: listBooks() trả về ${supabaseBooks.length} bản ghi truyện.`);

  // 3. Compare the difference
  const r2BookIds = indexKeys.map(k => k.key.split("/")[1]);
  const supabaseBookIds = new Set(supabaseBooks.map(b => b.id));

  const missingInSupabase = r2BookIds.filter(id => !supabaseBookIds.has(id));
  console.log(`\n- Số bộ có trên R2 nhưng chưa được đồng bộ vào Supabase: ${missingInSupabase.length} bộ.`);

  // 4. Detailed audit across ALL R2 books
  console.log("\n==========================================================================");
  console.log(`📊 THỐNG KÊ CHI TIẾT TRÊN TOÀN BỘ ${indexKeys.length} BỘ TRUYỆN TRÊN R2 STORAGE:`);
  console.log("==========================================================================\n");

  let totalR2Chapters = 0;
  let totalR2Translated = 0;
  let fullCount = 0;
  let partialCount = 0;
  let unCount = 0;

  const allBookStats = [];

  for (const obj of indexKeys) {
    const raw = await storage.get(obj.key);
    if (!raw) continue;
    try {
      const idx = JSON.parse(raw.toString("utf8"));
      const bookId = idx.bookId || obj.key.split("/")[1];
      const title = idx.title || bookId;
      const total = Number(idx.totalChapters || idx.chapters?.length || 0);
      const done = Number(idx.translatedChapters || 0);
      const pending = Math.max(0, total - done);

      totalR2Chapters += total;
      totalR2Translated += done;

      const item = { bookId, title, total, done, pending };
      if (done >= total && total > 0) fullCount++;
      else if (done > 0) partialCount++;
      else unCount++;

      allBookStats.push(item);
    } catch {}
  }

  console.log(`- TỔNG SỐ TRUYỆN THỰC TẾ TRÊN R2 STORAGE: ${allBookStats.length} BỘ (${totalR2Chapters.toLocaleString("vi-VN")} chương)`);
  console.log(`  + 🎉 Đã dịch hoàn thành 100% (FULL):    ${fullCount} bộ`);
  console.log(`  + 🔄 Đang dịch dở dang (Partially):     ${partialCount} bộ`);
  console.log(`  + 📄 Chưa dịch chương nào (Convert):    ${unCount} bộ`);
  console.log(`  + ⏳ Tổng số chương còn chờ dịch:       ${(totalR2Chapters - totalR2Translated).toLocaleString("vi-VN")} chương\n`);
}

checkAllBooksR2VsSupabase().catch(console.error);
