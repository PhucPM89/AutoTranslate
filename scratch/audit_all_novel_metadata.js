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

  console.log("=== QUÉT TOÀN BỘ DANH MỤC TRUYỆN TRÊN R2 VÀ SUPABASE ===");

  // 1. Get catalog
  const rawCatalog = await storage.get("catalog/latest.json");
  const catalog = rawCatalog ? JSON.parse(rawCatalog.toString()) : { books: [] };
  console.log(`Tìm thấy ${catalog.books.length} bộ trong catalog/latest.json.`);

  // 2. Also check all book index.json files on R2
  const bookIndexFiles = await storage.list("books/");
  const indexKeys = bookIndexFiles.filter(o => o.key.endsWith("/index.json"));
  console.log(`Tìm thấy ${indexKeys.length} file books/*/index.json trên R2.`);

  const suspectBooks = [];

  for (const obj of indexKeys) {
    const bookId = obj.key.split("/")[1];
    const raw = await storage.get(obj.key);
    if (!raw) continue;
    
    let indexData;
    try {
      indexData = JSON.parse(raw.toString());
    } catch {
      suspectBooks.push({ bookId, reason: "corrupted_index_json" });
      continue;
    }

    const title = indexData.title || "";
    const author = indexData.author || "";
    const desc = indexData.description || "";

    const titleHasHan = hasHan(title);
    const authorHasHan = hasHan(author);
    const descHasHan = hasHan(desc);
    const descMissing = !desc || desc.trim().length < 20;
    const titleIsId = title === bookId || title.startsWith("fanqie-");

    if (titleHasHan || authorHasHan || descHasHan || descMissing || titleIsId) {
      suspectBooks.push({
        bookId,
        title,
        author,
        descLength: desc.length,
        descPreview: desc.slice(0, 80),
        titleHasHan,
        authorHasHan,
        descHasHan,
        descMissing,
        titleIsId
      });
    }
  }

  console.log(`\n=== PHÁT HIỆN ${suspectBooks.length} BỘ TRUYỆN CẦN BỔ SUNG / DỊCH LẠI METADATA ===`);
  for (const b of suspectBooks) {
    console.log(`- [${b.bookId}]`);
    console.log(`  Title: "${b.title}" (Han: ${b.titleHasHan}, IsId: ${b.titleIsId})`);
    console.log(`  Author: "${b.author}" (Han: ${b.authorHasHan})`);
    console.log(`  Desc: ${b.descLength} chars (Missing: ${b.descMissing}, Han: ${b.descHasHan})`);
  }
}

main().catch(console.error);
