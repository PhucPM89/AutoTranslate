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

const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");

function hasHan(s) {
  return /[\u4e00-\u9fa5]/.test(String(s || ""));
}

async function main() {
  const storage = createStorage();
  const db = createSupabase(process.env);

  console.log("=== QUÉT NHANH TOÀN BỘ SÁCH TRÊN CATALOG & SUPABASE ===");

  const rawCatalog = await storage.get("catalog/latest.json");
  const catalog = rawCatalog ? JSON.parse(rawCatalog.toString()) : { books: [] };
  console.log(`Tìm thấy ${catalog.books.length} bộ trong catalog/latest.json.`);

  const suspectBooks = [];

  for (const b of catalog.books) {
    const title = b.title || "";
    const author = b.author || "";
    const desc = b.description || "";

    const titleHasHan = hasHan(title);
    const authorHasHan = hasHan(author);
    const descHasHan = hasHan(desc);
    const descMissing = !desc || desc.trim().length < 15;
    const titleIsId = title === b.id || title.startsWith("fanqie-");

    if (titleHasHan || authorHasHan || descHasHan || descMissing || titleIsId) {
      suspectBooks.push({
        id: b.id,
        title,
        author,
        descLength: desc.length,
        descPreview: desc.slice(0, 100),
        titleHasHan,
        authorHasHan,
        descHasHan,
        descMissing,
        titleIsId
      });
    }
  }

  // Also query Supabase directly
  if (db) {
    const supaBooks = await db.listBooks({ limit: 1000 });
    if (supaBooks) {
      console.log(`Tìm thấy ${supaBooks.length} bộ trong Supabase books table.`);
      for (const sb of supaBooks) {
        const title = sb.title || "";
        const author = sb.author || "";
        const desc = sb.description || "";

        const titleHasHan = hasHan(title);
        const authorHasHan = hasHan(author);
        const descHasHan = hasHan(desc);
        const descMissing = !desc || desc.trim().length < 15;
        const titleIsId = title === sb.id || title.startsWith("fanqie-");

        if (titleHasHan || authorHasHan || descHasHan || descMissing || titleIsId) {
          if (!suspectBooks.some(x => x.id === sb.id)) {
            suspectBooks.push({
              id: sb.id,
              title,
              author,
              descLength: desc.length,
              descPreview: desc.slice(0, 100),
              titleHasHan,
              authorHasHan,
              descHasHan,
              descMissing,
              titleIsId,
              fromSupabase: true
            });
          }
        }
      }
    }
  }

  console.log(`\n=== TÌM THẤY TỔNG CỘNG ${suspectBooks.length} BỘ TRUYỆN CẦN XỬ LÝ / BỔ SUNG ===`);
  for (const b of suspectBooks) {
    console.log(JSON.stringify(b, null, 2));
  }
}

main().catch(console.error);
