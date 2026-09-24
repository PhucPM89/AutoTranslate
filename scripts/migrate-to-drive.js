#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

// Load environment
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
const db = createSupabase();

async function runQueue(items, concurrency, workerFn) {
  let index = 0;
  let successCount = 0;
  let failCount = 0;

  async function next() {
    while (index < items.length) {
      const current = items[index++];
      let retries = 3;
      let ok = false;
      while (retries > 0 && !ok) {
        try {
          await workerFn(current);
          successCount++;
          ok = true;
        } catch (err) {
          retries--;
          if (retries === 0) {
            console.error(`  ❌ Lỗi tải [${current.key}]: ${err.message}`);
            failCount++;
          } else {
            // Backoff on error (e.g. rate limit)
            await new Promise((r) => setTimeout(r, 1500 * (4 - retries)));
          }
        }
      }
      if ((successCount + failCount) % 25 === 0 || (successCount + failCount) === items.length) {
        process.stdout.write(`  ⏳ Tiến độ: ${successCount + failCount}/${items.length} (Thành công: ${successCount}, Lỗi: ${failCount})\r`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(workers);
  console.log(`\n  ✅ Hoàn tất: ${successCount} thành công, ${failCount} lỗi.`);
  return { successCount, failCount };
}

// -------------------------------------------------------------
// 1. Tải ảnh bìa (Covers) lên thư mục covers/ trên Google Drive
// -------------------------------------------------------------
async function migrateCovers() {
  console.log("\n🎨 Đang đồng bộ ảnh bìa (Covers) lên Google Drive...");
  const coversToFetch = [
    { key: "covers/qidian-1036575193.jpg", url: "https://bookcover.yuewen.com/qdbimg/349573/1036575193/600" },
    { key: "covers/qidian-1041637443.jpg", url: "https://bookcover.yuewen.com/qdbimg/349573/1041637443/600" },
    { key: "covers/qidian-1049745989.jpg", url: "https://bookcover.yuewen.com/qdbimg/349573/1049745989/600" },
    { key: "covers/qidian-1024868626.jpg", url: "https://bookcover.yuewen.com/qdbimg/349573/1024868626/600" }
  ];

  // Also check local covers in .crawler-data/covers
  const localCoverDir = path.resolve(__dirname, "..", ".crawler-data", "covers");
  if (fs.existsSync(localCoverDir)) {
    const files = fs.readdirSync(localCoverDir);
    for (const f of files) {
      if (f.includes("huanghunfenjie")) {
        coversToFetch.push({ key: "covers/qidian-1036575193.jpg", localFile: path.join(localCoverDir, f) });
      }
      if (f.includes("jijirululing")) {
        coversToFetch.push({ key: "covers/qidian-1049745989.jpg", localFile: path.join(localCoverDir, f) });
      }
    }
  }

  // Fetch Fanqie covers
  const fanqieIds = ["7143038691944959011", "7027679289931729920", "7379865527998483480"];
  for (const fId of fanqieIds) {
    try {
      const pageRes = await fetch(`https://fanqienovel.com/page/${fId}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
      });
      if (pageRes.ok) {
        const html = await pageRes.text();
        const imgMatch = html.match(/https:\/\/[^"'\s]+\.byteimg\.com\/novel-pic\/[^"'\s]+/);
        if (imgMatch) {
          coversToFetch.push({ key: `covers/fanqie-${fId}.jpg`, url: imgMatch[0] });
        }
      }
    } catch {}
  }

  for (const item of coversToFetch) {
    try {
      let buffer = null;
      if (item.localFile && fs.existsSync(item.localFile)) {
        buffer = fs.readFileSync(item.localFile);
      } else if (item.url) {
        const res = await fetch(item.url);
        if (res.ok) buffer = Buffer.from(await res.arrayBuffer());
      }
      if (buffer) {
        await storage.put(item.key, buffer, { contentType: "image/jpeg" });
        console.log(`  ✅ Đã tải lên ảnh bìa: ${item.key}`);
      }
    } catch (e) {
      console.warn(`  ⚠️ Bỏ qua bìa ${item.key}: ${e.message}`);
    }
  }
}

// -------------------------------------------------------------
// 2. Ranh Giới Hoàng Hôn (qidian-1036575193)
// -------------------------------------------------------------
async function migrateRanhGioiHoangHon() {
  const bookId = "qidian-1036575193";
  const bookTitle = "Ranh Giới Hoàng Hôn";
  const backupDir = path.resolve(__dirname, "..", "scratch", "ranh-gioi-hoang-hon", "backups");
  if (!fs.existsSync(backupDir)) return;

  console.log(`\n📚 Đang xử lý: ${bookTitle} (${bookId})...`);
  const files = fs.readdirSync(backupDir).filter((f) => f.endsWith(".json"));
  
  const chapterMap = new Map();
  for (const f of files) {
    const match = f.match(/^chapter-(\d+)\.([^.]+)\./);
    if (!match) continue;
    const num = Number(match[1]);
    const filePath = path.join(backupDir, f);
    const mtime = fs.statSync(filePath).mtimeMs;
    if (!chapterMap.has(num) || mtime > chapterMap.get(num).mtime) {
      chapterMap.set(num, { num, filePath, mtime });
    }
  }

  const sortedChapters = Array.from(chapterMap.values()).sort((a, b) => a.num - b.num);
  console.log(`  Tìm thấy ${sortedChapters.length} chương dịch hợp lệ.`);

  // Upload book index.json first
  const bookIndex = {
    schema: 1,
    bookId,
    title: bookTitle,
    author: "Hồ Viết Chi Bút",
    totalChapters: 885,
    translatedChapters: sortedChapters.length,
    revision: 1,
    chapters: sortedChapters.map((ch) => ({ number: ch.num, title: `Chương ${ch.num}` }))
  };
  await storage.put(`books/${bookId}/index.json`, JSON.stringify(bookIndex, null, 2), {
    contentType: "application/json; charset=utf-8",
    bookTitle
  });
  console.log(`  ✅ Đã tạo mục lục: books/${bookId}/index.json`);

  const items = sortedChapters.map((ch) => ({
    key: `books/${bookId}/r1/ch/${ch.num}.json`,
    filePath: ch.filePath,
    num: ch.num,
    bookTitle
  }));

  await runQueue(items, 5, async (item) => {
    const content = fs.readFileSync(item.filePath);
    await storage.put(item.key, content, {
      contentType: "application/json; charset=utf-8",
      bookTitle: item.bookTitle,
      skipFind: true
    });
  });
}

// -------------------------------------------------------------
// 3. Thập Nhật Chung Yên (fanqie-7143038691944959011)
// -------------------------------------------------------------
async function migrateThapNhatChungYen() {
  const bookId = "fanqie-7143038691944959011";
  const bookTitle = "Thập Nhật Chung Yên";
  const auditDir = path.resolve(__dirname, "..", ".cache", "thap-nhat-chung-yen-audit", "chapters");
  if (!fs.existsSync(auditDir)) return;

  console.log(`\n📚 Đang xử lý: ${bookTitle} (${bookId})...`);
  const files = fs.readdirSync(auditDir);
  const items = [];

  for (const f of files) {
    const trMatch = f.match(/^(\d+)\.translated\.json$/);
    if (trMatch) {
      const num = Number(trMatch[1]);
      items.push({
        key: `books/${bookId}/r1/ch/${num}.json`,
        filePath: path.join(auditDir, f),
        num,
        bookTitle
      });
    }
    const origMatch = f.match(/^(\d+)\.original\.json$/);
    if (origMatch) {
      const num = Number(origMatch[1]);
      items.push({
        key: `books/${bookId}/r1/ch/${num}.original.json`,
        filePath: path.join(auditDir, f),
        num,
        bookTitle
      });
    }
  }

  const translatedNums = items.filter((i) => !i.key.endsWith(".original.json")).map((i) => i.num).sort((a, b) => a - b);
  const bookIndex = {
    schema: 1,
    bookId,
    title: bookTitle,
    author: "Kiêu Kỵ Tướng Quân",
    totalChapters: 1508,
    translatedChapters: translatedNums.length,
    revision: 1,
    chapters: translatedNums.map((num) => ({ number: num, title: `Chương ${num}` }))
  };
  await storage.put(`books/${bookId}/index.json`, JSON.stringify(bookIndex, null, 2), {
    contentType: "application/json; charset=utf-8",
    bookTitle
  });
  console.log(`  ✅ Đã tạo mục lục: books/${bookId}/index.json`);

  console.log(`  Tìm thấy ${items.length} file chương.`);
  await runQueue(items, 5, async (item) => {
    const content = fs.readFileSync(item.filePath);
    await storage.put(item.key, content, {
      contentType: "application/json; charset=utf-8",
      bookTitle: item.bookTitle,
      skipFind: true
    });
  });
}

// -------------------------------------------------------------
// 4. Vớt Thi Nhân (qidian-1041637443)
// -------------------------------------------------------------
async function migrateVotThiNhan() {
  const bookId = "qidian-1041637443";
  const bookTitle = "Vớt Thi Nhân";
  const rollDir = path.resolve(
    __dirname,
    "..",
    ".cache",
    "rollbacks",
    "qidian-1041637443",
    "pre-replace-737-2026-09-15T11-41-40-551Z",
    "books",
    "qidian-1041637443"
  );
  if (!fs.existsSync(rollDir)) return;

  console.log(`\n📚 Đang xử lý: ${bookTitle} (${bookId})...`);
  const idxPath = path.join(rollDir, "index.json");
  if (fs.existsSync(idxPath)) {
    await storage.put(`books/${bookId}/index.json`, fs.readFileSync(idxPath), {
      contentType: "application/json; charset=utf-8",
      bookTitle
    });
    console.log(`  ✅ Đã tạo mục lục: books/${bookId}/index.json`);
  }

  const items = [];
  const chDir = path.join(rollDir, "r1", "ch");
  if (fs.existsSync(chDir)) {
    for (const f of fs.readdirSync(chDir)) {
      if (f.endsWith(".json")) {
        items.push({
          key: `books/${bookId}/r1/ch/${f}`,
          filePath: path.join(chDir, f),
          bookTitle
        });
      }
    }
  }

  console.log(`  Tìm thấy ${items.length} file Vớt Thi Nhân.`);
  await runQueue(items, 5, async (item) => {
    const content = fs.readFileSync(item.filePath);
    await storage.put(item.key, content, {
      contentType: "application/json; charset=utf-8",
      bookTitle: item.bookTitle,
      skipFind: true
    });
  });
}

// -------------------------------------------------------------
// 5. Xuất bản Catalog
// -------------------------------------------------------------
async function publishCatalog() {
  console.log("\n📦 Đang xuất catalog/latest.json & books/index.json lên Google Drive...");
  try {
    const snapshot = await publishCatalogSnapshot({
      storage,
      db,
      site: { title: "Trạm Chữ", url: "https://tram-chu.online" }
    });
    await storage.put("books/index.json", JSON.stringify(snapshot, null, 2), {
      contentType: "application/json; charset=utf-8"
    });
    console.log(`  ✅ Đã xuất bản danh mục thành công với ${snapshot.books?.length || 0} đầu sách!`);
  } catch (err) {
    console.error("  ❌ Lỗi xuất bản catalog:", err.message);
  }
}

async function main() {
  console.log("===================================================================");
  console.log("   🚀 ĐỒNG BỘ THEO THƯ MỤC RIÊNG TỪNG BỘ TRUYỆN TRÊN GOOGLE DRIVE");
  console.log("===================================================================");

  await publishCatalog();
  await migrateCovers();
  await migrateRanhGioiHoangHon();
  await migrateThapNhatChungYen();
  await migrateVotThiNhan();

  console.log("\n🎉 HOÀN THÀNH QUÁ TRÌNH TỔ CHỨC VÀ ĐỒNG BỘ LÊN GOOGLE DRIVE!");
}

main().catch(console.error);
