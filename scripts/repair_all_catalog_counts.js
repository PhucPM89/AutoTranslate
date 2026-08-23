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

  console.log("=== 1. SYNCING TOTAL_CHAPTERS & TRANSLATED_CHAPTERS FROM R2 TO SUPABASE ===");

  const objects = await storage.list("books/");
  const indexKeys = objects.filter((o) => o.key.endsWith("/index.json"));
  console.log(`Found ${indexKeys.length} books with index.json on R2.`);

  let updatedCount = 0;
  for (const obj of indexKeys) {
    try {
      const raw = await storage.get(obj.key);
      if (!raw) continue;
      const idx = JSON.parse(raw.toString("utf8"));
      const bookId = idx.bookId || obj.key.split("/")[1];
      const totalChapters = Number(idx.totalChapters || idx.chapters?.length || 0);
      const translatedChapters = Number(idx.translatedChapters || idx.chapters?.filter(c => c.status === "completed").length || 0);

      if (totalChapters > 0) {
        // Update Supabase
        await db.updateBookProgress(bookId, {
          totalChapters,
          translatedChapters,
          revision: idx.revision || 1
        });
        updatedCount++;
      }
    } catch (err) {
      console.error(`Error updating ${obj.key}:`, err.message);
    }
  }

  console.log(`✓ Updated ${updatedCount} books in Supabase!`);

  console.log("\n=== 2. REBUILDING & PUBLISHING CATALOG/LATEST.JSON TO R2 ===");
  const snapshot = await publishCatalogSnapshot({
    storage,
    db,
    site: siteSettings(),
    log: console.log
  });

  console.log(`✓ Published snapshot with ${snapshot?.books?.length || 0} books.`);

  // Print first 10 books in snapshot
  const top10 = (snapshot?.books || []).slice(0, 10).map(b => ({
    title: b.title,
    translatedChapters: b.translatedChapters,
    chapterCount: b.chapterCount
  }));
  console.table(top10);
}

main().catch(console.error);
