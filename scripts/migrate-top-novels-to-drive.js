"use strict";

/**
 * High-Performance Drive Migration Script for Top Translated Novels
 * Directly uploads full chapter streams for:
 * 1. Sinh Tồn Kinh Hoàng Trong Thế Giới Ác Mộng (1,955 ch)
 * 2. Ban Ngày Bán Quần Áo, Ban Đêm Khâu Thi Thể (1,322 ch)
 * 3. Vớt Thi Nhân (737 ch)
 * 4. Cấp Cấp Như Luật Lệnh (165 ch)
 */

const fs = require("node:fs");
const path = require("node:path");

// 1. Load environment
for (const envFile of [".env.local", ".env"]) {
  const full = path.resolve(__dirname, "..", envFile);
  if (fs.existsSync(full)) {
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[match[1]] = val;
      }
    }
  }
}

const { readEpub, extractChapters } = require("../server/ingest/epub");
const { buildChapterDocument, buildOriginalDocument } = require("../server/ingest/documents");
const { createSupabase } = require("../server/supabase");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");
const { getConvertFunction } = require("../server/convert");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_STORAGE_FOLDER_ID || "1-TvHLKA7z_hyt90BdJpRBsjmCQGW3z8P";

let cachedToken = null;
let tokenExpiresAt = 0;
const folderCache = new Map();

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) return cachedToken;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Google OAuth error: ${data.error || res.status}`);
  }
  cachedToken = data.access_token;
  tokenExpiresAt = now + (Number(data.expires_in) || 3600) * 1000;
  return cachedToken;
}

function escapeDriveQuery(val) {
  return String(val).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function getOrCreateFolder(parentFolderId, folderName) {
  const cacheKey = `${parentFolderId}::${folderName}`;
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);

  const token = await getAccessToken();
  const q = `'${escapeDriveQuery(parentFolderId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false and name = '${escapeDriveQuery(folderName)}'`;
  const findUrl = new URL(DRIVE_FILES_URL);
  findUrl.searchParams.set("q", q);
  findUrl.searchParams.set("fields", "files(id,name)");
  findUrl.searchParams.set("pageSize", "1");

  const findRes = await fetch(findUrl, { headers: { Authorization: `Bearer ${token}` } });
  const findData = await findRes.json();
  if (findData.files?.[0]) {
    folderCache.set(cacheKey, findData.files[0].id);
    return findData.files[0].id;
  }

  const createRes = await fetch(`${DRIVE_FILES_URL}?fields=id,name`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId]
    })
  });
  const folder = await createRes.json();
  folderCache.set(cacheKey, folder.id);
  return folder.id;
}

async function uploadFileDirect({ targetFolderId, fileName, relPath, content, mime = "application/json; charset=utf-8" }) {
  const token = await getAccessToken();
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content), "utf8");

  const metadata = {
    name: fileName,
    parents: [targetFolderId],
    mimeType: mime,
    appProperties: {
      relPath,
      cacheControl: "public, max-age=604800, immutable"
    }
  };

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", new Blob([buffer], { type: mime }));

  let retries = 3;
  while (retries > 0) {
    try {
      const response = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      if (response.ok) return await response.json();
      if (response.status === 429 || response.status >= 500) {
        retries--;
        await new Promise((r) => setTimeout(r, 1200 * (4 - retries)));
        continue;
      }
      const errTxt = await response.text();
      throw new Error(`HTTP ${response.status}: ${errTxt.slice(0, 150)}`);
    } catch (err) {
      retries--;
      if (retries === 0) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

async function runPool(items, concurrency, workerFn) {
  let index = 0;
  let done = 0;
  const total = items.length;
  const startTime = Date.now();

  async function next() {
    while (index < total) {
      const current = items[index++];
      await workerFn(current);
      done++;
      if (done % 50 === 0 || done === total) {
        const elapsedSec = Math.max(1, (Date.now() - startTime) / 1000);
        const rate = (done / elapsedSec).toFixed(1);
        process.stdout.write(`  ⏳ Tiến độ: ${done}/${total} chương (${((done / total) * 100).toFixed(1)}%) - ${rate} ch/giây\r`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => next());
  await Promise.all(workers);
  console.log(`\n  ✅ Đã tải xong ${done}/${total} chương trong ${((Date.now() - startTime) / 1000).toFixed(1)} giây.`);
}

// -------------------------------------------------------------
// 1. Sinh Tồn Kinh Hoàng Trong Thế Giới Ác Mộng
// -------------------------------------------------------------
async function migrateSinhTonKinhHoang(db) {
  const bookId = "fanqie-7027679289931729920";
  const bookTitle = "Sinh Tồn Kinh Hoàng Trong Thế Giới Ác Mộng";
  const epubPath = "D:/Các bản dịch của Trạm Chữ/Sinh Tồn Kinh Hoàng Trong Thế Giới Ác Mộng.epub";

  if (!fs.existsSync(epubPath)) {
    console.warn(`[Skip] Không tìm thấy file: ${epubPath}`);
    return;
  }

  console.log(`\n======================================================`);
  console.log(`🚀 [1/4] ĐANG MIGRATE: ${bookTitle}`);
  console.log(`======================================================`);

  const booksRootId = await getOrCreateFolder(ROOT_FOLDER_ID, "books");
  const bookFolderId = await getOrCreateFolder(booksRootId, `${bookTitle} (${bookId})`);

  console.log(`Đang đọc file EPUB (${(fs.statSync(epubPath).size / 1024 / 1024).toFixed(1)} MB)...`);
  const epubBuf = fs.readFileSync(epubPath);
  const epub = await readEpub(epubBuf);

  const rawChapters = [];
  for await (const ch of extractChapters(epub)) {
    rawChapters.push(ch);
  }
  console.log(`Trích xuất được ${rawChapters.length} chương dịch từ EPUB.`);

  const chapterEntries = [];
  const uploadTasks = [];

  for (let i = 0; i < rawChapters.length; i++) {
    const ch = rawChapters[i];
    const n = i + 1;
    const doc = buildChapterDocument({
      bookId,
      revision: 1,
      chapter: {
        chapterNumber: n,
        title: ch.title,
        content: ch.content
      },
      translationStatus: "completed"
    });

    chapterEntries.push({
      n,
      title: ch.title,
      status: "completed",
      characters: doc.characters
    });

    uploadTasks.push({
      targetFolderId: bookFolderId,
      fileName: `${n}.json`,
      relPath: `books/${bookId}/r1/ch/${n}.json`,
      content: JSON.stringify(doc)
    });
  }

  console.log(`Bắt đầu upload ${uploadTasks.length} chương lên Google Drive (concurrency: 6)...`);
  await runPool(uploadTasks, 6, async (task) => {
    await uploadFileDirect(task);
  });

  // Upload book index.json
  const bookIndex = {
    schema: "book-index-v1",
    bookId,
    revision: 1,
    chapterUrlTemplate: `books/${bookId}/r1/ch/{n}.json`,
    title: bookTitle,
    author: "Lộ Kiếm Nhất",
    genre: "Trinh thám",
    status: "Hoàn thành",
    description: "Thế giới ác mộng, những ứng cử viên được chọn rơi xuống đây, mở ra một cuộc thi loại trừ tàn nhẫn 'sống còn là vua'.",
    cover: `/covers/${bookId}.jpg`,
    source: "fanqie",
    sourceId: "7027679289931729920",
    totalChapters: chapterEntries.length,
    translatedChapters: chapterEntries.length,
    updatedAt: new Date().toISOString(),
    chapters: chapterEntries
  };

  await uploadFileDirect({
    targetFolderId: bookFolderId,
    fileName: "index.json",
    relPath: `books/${bookId}/index.json`,
    content: JSON.stringify(bookIndex, null, 2)
  });
  console.log(`✅ Đã cập nhật mục lục: books/${bookId}/index.json`);

  if (db) {
    try {
      await db.updateBookProgress(bookId, {
        totalChapters: chapterEntries.length,
        translatedChapters: chapterEntries.length,
        status: "Hoàn thành"
      });
      console.log(`✅ Đã đồng bộ tiến độ lên Supabase (100% Hoàn thành).`);
    } catch (e) {
      console.warn(`Lỗi sync Supabase:`, e.message);
    }
  }
}

// -------------------------------------------------------------
// 2. Ban Ngày Bán Quần Áo, Ban Đêm Khâu Thi Thể
// -------------------------------------------------------------
async function migrateBanNgayBanQuanAo(db) {
  const bookId = "fanqie-7379865527998483480";
  const bookTitle = "Ban Ngày Bán Quần Áo, Ban Đêm Khâu Thi Thể";
  const epubPath = "D:/Các bản dịch của Trạm Chữ/Ban Ngày Bán Quần Áo, Ban Đêm Khâu Thi Thể.epub";

  if (!fs.existsSync(epubPath)) {
    console.warn(`[Skip] Không tìm thấy file: ${epubPath}`);
    return;
  }

  console.log(`\n======================================================`);
  console.log(`🚀 [2/4] ĐANG MIGRATE: ${bookTitle}`);
  console.log(`======================================================`);

  const booksRootId = await getOrCreateFolder(ROOT_FOLDER_ID, "books");
  const bookFolderId = await getOrCreateFolder(booksRootId, `${bookTitle} (${bookId})`);

  console.log(`Đang đọc file EPUB (${(fs.statSync(epubPath).size / 1024 / 1024).toFixed(1)} MB)...`);
  const epubBuf = fs.readFileSync(epubPath);
  const epub = await readEpub(epubBuf);

  const rawChapters = [];
  for await (const ch of extractChapters(epub)) {
    rawChapters.push(ch);
  }
  console.log(`Trích xuất được ${rawChapters.length} chương dịch từ EPUB.`);

  const chapterEntries = [];
  const uploadTasks = [];

  for (let i = 0; i < rawChapters.length; i++) {
    const ch = rawChapters[i];
    const n = i + 1;
    const doc = buildChapterDocument({
      bookId,
      revision: 1,
      chapter: {
        chapterNumber: n,
        title: ch.title,
        content: ch.content
      },
      translationStatus: "completed"
    });

    chapterEntries.push({
      n,
      title: ch.title,
      status: "completed",
      characters: doc.characters
    });

    uploadTasks.push({
      targetFolderId: bookFolderId,
      fileName: `${n}.json`,
      relPath: `books/${bookId}/r1/ch/${n}.json`,
      content: JSON.stringify(doc)
    });
  }

  console.log(`Bắt đầu upload ${uploadTasks.length} chương lên Google Drive (concurrency: 6)...`);
  await runPool(uploadTasks, 6, async (task) => {
    await uploadFileDirect(task);
  });

  const bookIndex = {
    schema: "book-index-v1",
    bookId,
    revision: 1,
    chapterUrlTemplate: `books/${bookId}/r1/ch/{n}.json`,
    title: bookTitle,
    author: "Dạ U Ảnh",
    genre: "Linh dị / Kinh dị",
    status: "Hoàn thành",
    description: "Ban ngày tôi bán quần áo ở chợ đầu mối, ban đêm nhận nghề khâu vá thi thể cho người chết...",
    cover: `/covers/${bookId}.jpg`,
    source: "fanqie",
    sourceId: "7379865527998483480",
    totalChapters: chapterEntries.length,
    translatedChapters: chapterEntries.length,
    updatedAt: new Date().toISOString(),
    chapters: chapterEntries
  };

  await uploadFileDirect({
    targetFolderId: bookFolderId,
    fileName: "index.json",
    relPath: `books/${bookId}/index.json`,
    content: JSON.stringify(bookIndex, null, 2)
  });
  console.log(`✅ Đã cập nhật mục lục: books/${bookId}/index.json`);

  if (db) {
    try {
      await db.updateBookProgress(bookId, {
        totalChapters: chapterEntries.length,
        translatedChapters: chapterEntries.length,
        status: "Hoàn thành"
      });
      console.log(`✅ Đã đồng bộ tiến độ lên Supabase (100% Hoàn thành).`);
    } catch (e) {
      console.warn(`Lỗi sync Supabase:`, e.message);
    }
  }
}

// -------------------------------------------------------------
// 3. Vớt Thi Nhân (qidian-1041637443)
// -------------------------------------------------------------
async function migrateVotThiNhan(db) {
  const bookId = "qidian-1041637443";
  const bookTitle = "Vớt Thi Nhân";
  const vtnDir = path.resolve(__dirname, ".cache-vtn-15679");

  if (!fs.existsSync(vtnDir)) {
    console.warn(`[Skip] Không tìm thấy thư mục: ${vtnDir}`);
    return;
  }

  console.log(`\n======================================================`);
  console.log(`🚀 [3/4] ĐANG HOÀN THIỆN: ${bookTitle} (737 chương)`);
  console.log(`======================================================`);

  const booksRootId = await getOrCreateFolder(ROOT_FOLDER_ID, "books");
  const bookFolderId = await getOrCreateFolder(booksRootId, `${bookTitle} (${bookId})`);

  const files = fs.readdirSync(vtnDir).filter(f => f.endsWith(".json"));
  const convert = getConvertFunction();

  const chapterEntries = [];
  const uploadTasks = [];

  for (const f of files) {
    const num = Number(f.replace(".json", ""));
    if (!num) continue;

    try {
      const data = JSON.parse(fs.readFileSync(path.join(vtnDir, f), "utf8"));
      const originalText = data.content || "";
      const originalTitle = data.title || `第${num}章`;

      // 1. Original Chinese document
      const origDoc = buildOriginalDocument({
        bookId,
        revision: 1,
        chapter: {
          chapterNumber: num,
          title: originalTitle,
          content: originalText
        }
      });

      uploadTasks.push({
        targetFolderId: bookFolderId,
        fileName: `${num}.original.json`,
        relPath: `books/${bookId}/r1/ch/${num}.original.json`,
        content: JSON.stringify(origDoc)
      });

      // 2. Converted/Readable Vietnamese document
      const convertedText = convert ? convert(originalText) : originalText;
      const transDoc = buildChapterDocument({
        bookId,
        revision: 1,
        chapter: {
          chapterNumber: num,
          title: origDoc.title,
          content: originalText
        },
        translation: convertedText,
        translationStatus: "convert"
      });

      uploadTasks.push({
        targetFolderId: bookFolderId,
        fileName: `${num}.json`,
        relPath: `books/${bookId}/r1/ch/${num}.json`,
        content: JSON.stringify(transDoc)
      });

      chapterEntries.push({
        n: num,
        title: transDoc.title,
        status: "completed",
        characters: transDoc.characters
      });
    } catch {}
  }

  chapterEntries.sort((a, b) => a.n - b.n);

  console.log(`Bắt đầu upload ${uploadTasks.length} file chương (bản gốc + bản đọc) cho ${bookTitle}...`);
  await runPool(uploadTasks, 6, async (task) => {
    await uploadFileDirect(task);
  });

  const bookIndex = {
    schema: "book-index-v1",
    bookId,
    revision: 1,
    chapterUrlTemplate: `books/${bookId}/r1/ch/{n}.json`,
    title: bookTitle,
    author: "Thuần Khiết Đích Tiểu Long",
    genre: "Linh dị / Kinh dị",
    status: "Đang cập nhật",
    description: "Sinh ra nơi sông nước, chuyên nghề vớt xác người chết. Có những thi thể ngàn vạn lần không thể chạm...",
    cover: `/covers/${bookId}.jpg`,
    source: "qidian",
    sourceId: "1041637443",
    totalChapters: 737,
    translatedChapters: chapterEntries.length,
    updatedAt: new Date().toISOString(),
    chapters: chapterEntries
  };

  await uploadFileDirect({
    targetFolderId: bookFolderId,
    fileName: "index.json",
    relPath: `books/${bookId}/index.json`,
    content: JSON.stringify(bookIndex, null, 2)
  });
  console.log(`✅ Đã cập nhật mục lục: books/${bookId}/index.json`);
}

// -------------------------------------------------------------
// 4. Cấp Cấp Như Luật Lệnh (qidian-1049745989)
// -------------------------------------------------------------
async function migrateCapCapNhuLuatLenh(db) {
  const bookId = "qidian-1049745989";
  const bookTitle = "Cấp Cấp Như Luật Lệnh";
  const epubPath = path.resolve(__dirname, "..", ".crawler-data", "qidian-1049745989-jijirululing.epub");

  if (!fs.existsSync(epubPath)) {
    console.warn(`[Skip] Không tìm thấy file: ${epubPath}`);
    return;
  }

  console.log(`\n======================================================`);
  console.log(`🚀 [4/4] ĐANG HOÀN THIỆN: ${bookTitle} (165 chương)`);
  console.log(`======================================================`);

  const booksRootId = await getOrCreateFolder(ROOT_FOLDER_ID, "books");
  const bookFolderId = await getOrCreateFolder(booksRootId, `${bookTitle} (${bookId})`);

  const epubBuf = fs.readFileSync(epubPath);
  const epub = await readEpub(epubBuf);
  const convert = getConvertFunction();

  const chapterEntries = [];
  const uploadTasks = [];
  let num = 0;

  for await (const ch of extractChapters(epub)) {
    num++;

    // Original Chinese
    const origDoc = buildOriginalDocument({
      bookId,
      revision: 1,
      chapter: {
        chapterNumber: num,
        title: ch.title,
        content: ch.content
      }
    });

    uploadTasks.push({
      targetFolderId: bookFolderId,
      fileName: `${num}.original.json`,
      relPath: `books/${bookId}/r1/ch/${num}.original.json`,
      content: JSON.stringify(origDoc)
    });

    // Converted Vietnamese
    const convertedText = convert ? convert(ch.content) : ch.content;
    const transDoc = buildChapterDocument({
      bookId,
      revision: 1,
      chapter: {
        chapterNumber: num,
        title: origDoc.title,
        content: ch.content
      },
      translation: convertedText,
      translationStatus: "convert"
    });

    uploadTasks.push({
      targetFolderId: bookFolderId,
      fileName: `${num}.json`,
      relPath: `books/${bookId}/r1/ch/${num}.json`,
      content: JSON.stringify(transDoc)
    });

    chapterEntries.push({
      n: num,
      title: transDoc.title,
      status: "completed",
      characters: transDoc.characters
    });
  }

  console.log(`Bắt đầu upload ${uploadTasks.length} file chương (bản gốc + bản đọc) cho ${bookTitle}...`);
  await runPool(uploadTasks, 6, async (task) => {
    await uploadFileDirect(task);
  });

  const bookIndex = {
    schema: "book-index-v1",
    bookId,
    revision: 1,
    chapterUrlTemplate: `books/${bookId}/r1/ch/{n}.json`,
    title: bookTitle,
    author: "Hắc Sơn Lão Quỷ",
    genre: "Linh dị / Kinh dị",
    status: "Hoàn thành",
    description: "Cấp cấp như luật lệnh, đạo môn bí truyền...",
    cover: `/covers/${bookId}.jpg`,
    source: "qidian",
    sourceId: "1049745989",
    totalChapters: chapterEntries.length,
    translatedChapters: chapterEntries.length,
    updatedAt: new Date().toISOString(),
    chapters: chapterEntries
  };

  await uploadFileDirect({
    targetFolderId: bookFolderId,
    fileName: "index.json",
    relPath: `books/${bookId}/index.json`,
    content: JSON.stringify(bookIndex, null, 2)
  });
  console.log(`✅ Đã cập nhật mục lục: books/${bookId}/index.json`);
}

// -------------------------------------------------------------
// MAIN EXECUTION
// -------------------------------------------------------------
async function main() {
  console.log("===================================================================");
  console.log("   🌟 MIGRATE TOÀN BỘ CHƯƠNG BẢN DỊCH & BẢN GỐC LÊN GOOGLE DRIVE");
  console.log("===================================================================");

  const db = createSupabase(process.env, { role: "service" });

  await migrateSinhTonKinhHoang(db);
  await migrateBanNgayBanQuanAo(db);
  await migrateVotThiNhan(db);
  await migrateCapCapNhuLuatLenh(db);

  console.log("\n📦 Đang xuất bản lại catalog/latest.json lên CDN & Google Drive...");
  const { createDriveStorage } = require("../server/storage/drive-storage-driver");
  const storage = createDriveStorage(process.env);
  await publishCatalogSnapshot({ storage, db });
  console.log("✅ Đã xuất bản catalog/latest.json thành công!");

  console.log("\n🎉 HOÀN TẤT MIGRATE CHƯƠNG CHO TẤT CẢ CÁC BỘ TRUYỆN TRỌNG ĐIỂM!");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
