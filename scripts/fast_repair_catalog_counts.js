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

const { createSupabase } = require("../server/supabase");
const { createStorage } = require("../server/storage");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");

function siteSettings() {
  return {
    title: process.env.SITE_TITLE || "Trạm Chữ",
    tagline: process.env.SITE_TAGLINE || "Kho tiểu thuyết dịch máy AI chất lượng cao"
  };
}

async function main() {
  const db = createSupabase();
  const storage = createStorage();

  console.log("=== 1. FETCHING ALL BOOKS FROM SUPABASE ===");
  const rows = await db.request("books", { query: "?select=id,title,total_chapters,translated_chapters&limit=1000" });
  console.log(`Found ${rows.length} books in Supabase.`);

  let fixedCount = 0;
  const chunkSize = 20;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (row) => {
      try {
        const raw = await storage.get(`books/${row.id}/index.json`);
        if (!raw) return;
        const idx = JSON.parse(raw.toString("utf8"));
        const total = Number(idx.totalChapters || idx.chapters?.length || 0);
        const trans = Number(idx.translatedChapters || idx.chapters?.filter(c => c.status === "completed").length || 0);

        if (total > 0 && (row.total_chapters !== total || row.translated_chapters !== trans)) {
          await db.updateBookProgress(row.id, {
            totalChapters: total,
            translatedChapters: trans,
            revision: idx.revision || 1
          });
          fixedCount++;
        }
      } catch (err) {
        console.error(`Error updating book ${row.id}:`, err.message);
      }
    }));
  }

  console.log(`✓ Fixed and synchronized ${fixedCount} books in Supabase!`);

  console.log("\n=== 2. REBUILDING & PUBLISHING CATALOG/LATEST.JSON TO R2 ===");
  const snapshot = await publishCatalogSnapshot({
    storage,
    db,
    site: siteSettings(),
    log: console.log
  });

  console.log(`✓ Published snapshot with ${snapshot?.books?.length || 0} books.`);

  // Sample check first 15 books
  const sample = (snapshot?.books || []).slice(0, 15).map(b => ({
    title: b.title.slice(0, 30),
    translated: b.translatedChapters,
    total: b.chapterCount,
    pct: b.chapterCount > 0 ? `${((b.translatedChapters / b.chapterCount) * 100).toFixed(1)}%` : "0%"
  }));
  console.table(sample);
}

main().catch(console.error);
