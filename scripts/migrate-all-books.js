"use strict";

const fs = require("fs");
const path = require("path");

for (const envFile of [".env.local", ".env"]) {
  const full = path.resolve(__dirname, "..", envFile);
  if (fs.existsSync(full)) {
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
      }
    }
  }
}

const { createDriveStorage } = require("../server/storage/drive-storage-driver");
const { createSupabase } = require("../server/supabase");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");

const storage = createDriveStorage(process.env);
const supa = createSupabase(process.env);

async function fetchBookChapters(bookId) {
  let chapters = [];
  let offset = 0;
  while (true) {
    try {
      const batch = await supa.request("chapters", {
        query: `?select=chapter_number,title,translation_status,characters&book_id=eq.${encodeURIComponent(bookId)}&order=chapter_number.asc&limit=1000&offset=${offset}`
      });
      if (!batch || !batch.length) break;
      chapters.push(...batch);
      if (batch.length < 1000) break;
      offset += 1000;
    } catch (err) {
      console.warn(`  [Warn] Fetch chapters offset ${offset} error for ${bookId}:`, err.message);
      break;
    }
  }
  return chapters;
}

async function fetchCoverBuffer(book) {
  const urlsToTry = [];
  if (book.cover_url && book.cover_url.startsWith("http")) urlsToTry.push(book.cover_url);
  urlsToTry.push(`https://cdn.tram-chu.online/covers/${book.id}.jpg`);

  const qidianMatch = book.id.match(/^qidian-(\d+)$/);
  if (qidianMatch) {
    urlsToTry.push(`https://bookcover.yuewen.com/qdbimg/349573/${qidianMatch[1]}/600`);
  }

  for (const u of urlsToTry) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 500) return buf;
      }
    } catch {}
  }
  return null;
}

async function migrateBook(book, index, totalBooks) {
  const prefix = `[${index + 1}/${totalBooks}] ${book.title} (${book.id})`;
  console.log(`\n⏳ ${prefix}...`);

  // 1. Check if index.json already exists on Drive
  let existingIndex = null;
  try {
    existingIndex = await storage.head(`books/${book.id}/index.json`);
  } catch (_) {}

  if (existingIndex && existingIndex.size > 100) {
    console.log(`   ⏭️ index.json đã tồn tại trên Drive (${existingIndex.size} bytes), bỏ qua bước tạo.`);
  } else {
    // Fetch chapters from Supabase
    const chapters = await fetchBookChapters(book.id);
    const totalCh = Math.max(chapters.length, book.total_chapters || 0);
    console.log(`   - Số chương trong Supabase: ${chapters.length} (Tổng khai báo: ${totalCh})`);

    // Build index document
    const indexDoc = {
      schema: "book-index-v1",
      bookId: book.id,
      revision: book.revision || 1,
      chapterUrlTemplate: `books/${book.id}/r1/ch/{n}.json`,
      title: book.title,
      author: book.author || "",
      genre: book.book_categories?.[0]?.categories?.name || "",
      status: book.status || (book.translated_chapters > 0 ? "Đang cập nhật" : "Chờ dịch"),
      description: book.description || "",
      cover: `/covers/${book.id}.jpg`,
      source: book.id.startsWith("fanqie") ? "fanqie" : (book.id.startsWith("qidian") ? "qidian" : "other"),
      sourceId: book.id.replace(/^[^-]+-/, ""),
      sourceUrl: book.id.startsWith("fanqie")
        ? `https://fanqienovel.com/page/${book.id.replace(/^fanqie-/, "")}`
        : (book.id.startsWith("qidian") ? `https://www.qidian.com/book/${book.id.replace(/^qidian-/, "")}` : ""),
      totalChapters: totalCh,
      translatedChapters: book.translated_chapters || 0,
      updatedAt: book.updated_at || new Date().toISOString(),
      chapters: chapters.length > 0
        ? chapters.map(c => ({
            n: Number(c.chapter_number),
            title: c.title || `Chương ${c.chapter_number}`,
            status: c.translation_status || "pending",
            characters: c.characters || 0
          }))
        : Array.from({ length: totalCh }, (_, i) => ({
            n: i + 1,
            title: `Chương ${i + 1}`,
            status: "pending",
            characters: 0
          }))
    };

    // Upload index.json to Drive
    try {
      await storage.put(`books/${book.id}/index.json`, JSON.stringify(indexDoc, null, 2), {
        contentType: "application/json; charset=utf-8",
        bookTitle: book.title,
        skipFind: true
      });
      console.log(`   ✅ Đã upload index.json vào thư mục: "books/${book.title} (${book.id})/"`);
    } catch (err) {
      console.error(`   ❌ Lỗi upload index.json:`, err.message);
    }
  }

  // 2. Check & Upload cover to Drive if not already present
  try {
    const existingCover = await storage.head(`covers/${book.id}.jpg`);
    if (!existingCover || existingCover.size < 500) {
      const coverBuf = await fetchCoverBuffer(book);
      if (coverBuf) {
        await storage.put(`covers/${book.id}.jpg`, coverBuf, {
          contentType: "image/jpeg",
          skipFind: true
        });
        console.log(`   ✅ Đã tải và lưu ảnh bìa vào Drive covers/${book.id}.jpg (${coverBuf.length} bytes)`);
      } else {
        console.log(`   ⚠️ Chưa tìm thấy ảnh bìa từ nguồn, sẽ dùng fallback tự động.`);
      }
    } else {
      console.log(`   ✅ Ảnh bìa đã có trên Drive (${existingCover.size} bytes).`);
    }
  } catch (err) {
    console.warn(`   ⚠️ Kiểm tra/tải bìa:`, err.message);
  }
}

async function main() {
  console.log("===================================================================");
  console.log("   🚀 MIGRATE TOÀN BỘ CÁC BỘ TRUYỆN TRÊN WEB VÀO THƯ MỤC RIÊNG DRIVE");
  console.log("===================================================================");

  const rows = await supa.listBooks({ limit: 1000 });
  const books = rows.filter(b => b && b.id && b.title && b.title.trim().length > 0);
  console.log(`\nTìm thấy ${books.length} bộ truyện hợp lệ trên web / Supabase.\n`);

  const limitArg = process.argv.find(a => a.startsWith("--limit="));
  const limitCount = limitArg ? Number(limitArg.split("=")[1]) : (process.argv.includes("--limit") ? Number(process.argv[process.argv.indexOf("--limit") + 1]) : 0);
  const targetBooks = limitCount > 0 ? books.slice(0, limitCount) : books;
  console.log(`\nSẽ xử lý ${targetBooks.length}/${books.length} bộ truyện.\n`);

  // We can process with concurrency = 3 to be gentle on Google Drive rate limits
  const concurrency = 3;
  for (let i = 0; i < targetBooks.length; i += concurrency) {
    const chunk = targetBooks.slice(i, i + concurrency);
    await Promise.all(chunk.map((b, idx) => migrateBook(b, i + idx, targetBooks.length)));
  }

  // Finally publish updated catalog
  console.log("\n📦 Đang cập nhật lại catalog/latest.json & books/index.json...");
  const snap = await publishCatalogSnapshot({
    storage,
    db: supa,
    site: { title: "Trạm Chữ", url: "https://tram-chu.online" }
  });
  await storage.put("books/index.json", JSON.stringify(snap, null, 2), {
    contentType: "application/json; charset=utf-8",
    skipFind: true
  });
  console.log(`\n🎉 HOÀN THÀNH MIGRATE TẤT CẢ ${books.length} BỘ TRUYỆN LÊN GOOGLE DRIVE!`);
}

main().catch(console.error);
