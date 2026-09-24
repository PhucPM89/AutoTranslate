"use strict";

const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
for (const envName of [".env", ".env.local"]) {
  const envFile = path.join(ROOT, envName);
  if (!fsSync.existsSync(envFile)) continue;
  for (const line of fsSync.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      let val = match[2].trim();
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      process.env[match[1]] = val;
    }
  }
}

const { createStorage, LAYOUT } = require("../server/storage");
const { createSupabase } = require("../server/supabase");

const COVERS = [
  {
    bookId: "qidian-1036575193",
    localFile: path.join(ROOT, ".crawler-data", "covers", "huanghunfenjie_piaotia.jpg"),
    genreLabel: "Linh dị / Kinh dị",
    categoryId: 2 // horror: Linh dị / Kinh dị
  },
  {
    bookId: "qidian-1049745989",
    localFile: path.join(ROOT, ".crawler-data", "covers", "jijirululing_yuewen.jpg"),
    genreLabel: "Linh dị / Kinh dị",
    categoryId: 2 // horror: Linh dị / Kinh dị
  }
];

async function main() {
  console.log("=== BỔ SUNG ẢNH BÌA VÀ PHÂN LOẠI THỂ LOẠI CHO 2 BỘ TRUYỆN ===");
  const storage = createStorage(process.env);
  const db = createSupabase(process.env, { role: "service" });

  for (const item of COVERS) {
    console.log(`\n--- Xử lý: ${item.bookId} ---`);
    if (!fsSync.existsSync(item.localFile)) {
      console.warn(`Không tìm thấy file ảnh bìa: ${item.localFile}`);
      continue;
    }

    const coverBuffer = await fs.readFile(item.localFile);
    const standardCoverKey = `covers/${item.bookId}.jpg`;
    const bookCoverKey = `books/${item.bookId}/cover.jpg`;
    
    // 1. Upload ảnh bìa lên R2 tại covers/{bookId}.jpg (chính xác theo kiến trúc CDN website)
    await storage.put(standardCoverKey, coverBuffer, {
      contentType: "image/jpeg",
      cacheControl: "public, max-age=31536000, immutable"
    });
    console.log(` Đã upload ảnh bìa lên R2: ${standardCoverKey}`);

    // Upload thêm bản sao tại books/{bookId}/cover.jpg phòng khi cần
    await storage.put(bookCoverKey, coverBuffer, {
      contentType: "image/jpeg",
      cacheControl: "public, max-age=31536000, immutable"
    });

    const coverUrl = `/covers/${item.bookId}.jpg`;
    const fullCdnUrl = storage.publicUrl(standardCoverKey);
    console.log(` Public URL: ${fullCdnUrl}`);

    // 2. Cập nhật index.json trên R2 nếu đã tồn tại
    const indexKey = LAYOUT.bookIndex(item.bookId);
    try {
      const rawIndex = await storage.get(indexKey);
      if (rawIndex) {
        const indexDoc = JSON.parse(rawIndex.toString("utf8"));
        indexDoc.cover = coverUrl;
        indexDoc.genre = item.genreLabel;
        indexDoc.updatedAt = new Date().toISOString();
        await storage.put(indexKey, JSON.stringify(indexDoc, null, 2), {
          contentType: "application/json; charset=utf-8",
          cacheControl: "public, max-age=60, stale-while-revalidate=600"
        });
        console.log(` Đã cập nhật R2 index.json: cover="${coverUrl}", genre="${item.genreLabel}"`);
      }
    } catch (err) {
      console.warn(` Chưa thể cập nhật index.json trên R2: ${err.message}`);
    }

    // 3. Cập nhật Supabase
    if (db) {
      try {
        await db.request("books", {
          method: "PATCH",
          query: `?id=eq.${encodeURIComponent(item.bookId)}`,
          body: {
            cover_url: coverUrl,
            updated_at: new Date().toISOString()
          }
        });
        console.log(` Đã cập nhật cover_url trong Supabase: ${coverUrl}`);

        await db.setBookCategory(item.bookId, item.categoryId);
        console.log(` Đã liên kết thể loại "${item.genreLabel}" (ID ${item.categoryId}) trong Supabase.`);
      } catch (err) {
        console.warn(` Lỗi cập nhật Supabase: ${err.message}`);
      }
    }
  }

  // 4. Tái tạo và xuất bản snapshot danh mục mới nhất (catalog/latest.json)
  console.log("\n Đang xuất bản catalog/latest.json mới nhất lên R2...");
  const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");
  const snap = await publishCatalogSnapshot({
    storage,
    db,
    env: process.env,
    log: (ev) => console.log(`  [CATALOG] ${ev.event}: ${ev.books || ev.message || ""}`)
  });
  console.log(` Đã xuất bản catalog snapshot thành công với ${snap.books?.length} bộ truyện!`);

  console.log("\n Hoàn tất cập nhật ảnh bìa và thể loại!");
}

if (require.main === module) {
  main().catch(err => {
    console.error("Lỗi:", err);
    process.exit(1);
  });
}

module.exports = { COVERS, main };
