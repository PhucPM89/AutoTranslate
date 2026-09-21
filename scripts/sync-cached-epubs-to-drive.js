"use strict";

const fs = require("node:fs");
const path = require("node:path");

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
const { buildOriginalDocument, buildChapterDocument } = require("../server/ingest/documents");
const { createSupabase } = require("../server/supabase");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");
const { createDriveStorage } = require("../server/storage/drive-storage-driver");
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

function findEpubs(dir) {
  if (!fs.existsSync(dir)) return [];
  const epubs = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      epubs.push(...findEpubs(full));
    } else if (entry.isFile() && entry.name.endsWith(".epub")) {
      epubs.push(full);
    }
  }
  return epubs;
}

async function main() {
  console.log("===================================================================");
  console.log("   🌟 SYNC CACHED NOVEL EPUBS DIRECTLY TO GOOGLE DRIVE");
  console.log("===================================================================");

  const crawlerDir = path.resolve(process.env.TOMATO_DATA_DIR || path.join(__dirname, "..", ".crawler-data"));
  console.log("Scanning directory for EPUBs:", crawlerDir);
  const epubs = findEpubs(crawlerDir);
  console.log(`Found ${epubs.length} EPUB files.`);

  const db = createSupabase(process.env, { role: "service" });
  const books = await db.listBooks({ limit: 500 });
  const booksBySourceId = new Map();
  const booksByTitle = new Map();

  for (const b of books) {
    const sId = b.source_id || b.sourceId || b.id.replace(/^[^-]+-/, "");
    if (sId) booksBySourceId.set(sId, b);
    if (b.title) booksByTitle.set(b.title.toLowerCase().trim(), b);
  }

  const convert = getConvertFunction();
  const booksRootId = await getOrCreateFolder(ROOT_FOLDER_ID, "books");

  for (let idx = 0; idx < epubs.length; idx++) {
    const epubPath = epubs[idx];
    const fileName = path.basename(epubPath);
    console.log(`\n[${idx + 1}/${epubs.length}] Xử lý: ${fileName}...`);

    let matchedBook = null;
    const matchId = fileName.match(/(\d{10,25})/);
    if (matchId && booksBySourceId.has(matchId[1])) {
      matchedBook = booksBySourceId.get(matchId[1]);
    }

    try {
      const epubBuf = fs.readFileSync(epubPath);
      const epub = await readEpub(epubBuf);
      const meta = epub.metadata || {};
      const epubTitle = meta.title || fileName.replace(".epub", "");

      if (!matchedBook && booksByTitle.has(epubTitle.toLowerCase().trim())) {
        matchedBook = booksByTitle.get(epubTitle.toLowerCase().trim());
      }

      const bookId = matchedBook?.id || `fanqie-${matchId?.[1] || Date.now()}`;
      const bookTitle = matchedBook?.title || epubTitle;

      console.log(`-> Bộ truyện: ${bookTitle} (${bookId})`);
      const bookFolderId = await getOrCreateFolder(booksRootId, `${bookTitle} (${bookId})`);

      const chapterEntries = [];
      const uploadTasks = [];
      let n = 0;

      for await (const ch of extractChapters(epub)) {
        n++;
        const origDoc = buildOriginalDocument({
          bookId,
          revision: 1,
          chapter: { chapterNumber: n, title: ch.title, content: ch.content }
        });

        uploadTasks.push({
          targetFolderId: bookFolderId,
          fileName: `${n}.original.json`,
          relPath: `books/${bookId}/r1/ch/${n}.original.json`,
          content: JSON.stringify(origDoc)
        });

        const converted = convert ? convert(ch.content) : ch.content;
        const transDoc = buildChapterDocument({
          bookId,
          revision: 1,
          chapter: { chapterNumber: n, title: origDoc.title, content: ch.content },
          translation: converted,
          translationStatus: "convert"
        });

        uploadTasks.push({
          targetFolderId: bookFolderId,
          fileName: `${n}.json`,
          relPath: `books/${bookId}/r1/ch/${n}.json`,
          content: JSON.stringify(transDoc)
        });

        chapterEntries.push({
          n,
          title: transDoc.title,
          status: "completed",
          characters: transDoc.characters
        });
      }

      console.log(`Bắt đầu upload ${uploadTasks.length} file (${n} chương gốc + ${n} chương convert)...`);
      await runPool(uploadTasks, 6, async (task) => {
        await uploadFileDirect(task);
      });

      const bookIndex = {
        schema: "book-index-v1",
        bookId,
        revision: 1,
        chapterUrlTemplate: `books/${bookId}/r1/ch/{n}.json`,
        title: bookTitle,
        author: matchedBook?.author || meta.creator || "",
        genre: matchedBook?.book_categories?.[0]?.categories?.name || "Khác",
        status: "Hoàn thành",
        description: matchedBook?.description || meta.description || "",
        cover: `/covers/${bookId}.jpg`,
        source: bookId.startsWith("qidian") ? "qidian" : "fanqie",
        sourceId: bookId.replace(/^[^-]+-/, ""),
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

      if (matchedBook) {
        await db.updateBookProgress(bookId, {
          totalChapters: chapterEntries.length,
          translatedChapters: chapterEntries.length,
          status: "Hoàn thành"
        });
        console.log(`✅ Đã cập nhật tiến độ Supabase.`);
      }
    } catch (err) {
      console.error(`❌ Lỗi xử lý ${fileName}:`, err.message);
    }
  }

  console.log("\n📦 Xuất bản Catalog Snapshot mới...");
  const storage = createDriveStorage(process.env);
  await publishCatalogSnapshot({ storage, db });
  console.log("✅ Hoàn tất!");
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, findEpubs };
