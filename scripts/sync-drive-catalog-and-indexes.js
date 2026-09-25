#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

for (const envFile of [".env.local", ".env"]) {
  const file = path.resolve(__dirname, "..", envFile);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

const { createSupabase } = require("../server/supabase");
const {
  chapterTitleFromDocument,
  isCompletedTranslationDocument
} = require("../server/drive-catalog-chapter");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_STORAGE_FOLDER_ID || "1-TvHLKA7z_hyt90BdJpRBsjmCQGW3z8P";
const SOURCE_TOTAL_OVERRIDES = {
  // The Drive folder currently contains only a partial 461-chapter translation,
  // while the archived source manifest records the complete 1,508 chapters.
  "fanqie-7143038691944959011": 1508
};

let token = "";
let tokenExpiry = 0;

async function getToken() {
  if (token && Date.now() < tokenExpiry - 60000) return token;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) throw new Error(`Google OAuth error: ${body.error || response.status}`);
  token = body.access_token;
  tokenExpiry = Date.now() + Number(body.expires_in || 3600) * 1000;
  return token;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function drive(url, options = {}) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${await getToken()}`, ...(options.headers || {}) }
      });
      if (response.ok) return response;
      if (response.status === 404) return response;
      const detail = await response.text().catch(() => "");
      const retryable = response.status === 429 || response.status >= 500 || (response.status === 403 && /rateLimitExceeded|userRateLimitExceeded/i.test(detail));
      if (!retryable || attempt === 7) throw new Error(`Drive HTTP ${response.status}: ${detail.slice(0, 200)}`);
      await sleep(1500 * Math.pow(2, attempt));
    } catch (error) {
      if (attempt === 7) throw error;
      await sleep(1500 * Math.pow(2, attempt));
    }
  }
}

async function listChildren(parentId) {
  const files = [];
  let pageToken = "";
  do {
    const url = new URL(DRIVE_FILES_URL);
    url.searchParams.set("q", `'${parentId}' in parents and trashed = false`);
    url.searchParams.set("fields", "nextPageToken,files(id,name,size,mimeType,appProperties)");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await drive(url);
    if (!res.ok) throw new Error(`listChildren HTTP ${res.status}`);
    const body = await res.json();
    files.push(...(body.files || []));
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return files;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function readJsonFile(file, { required = false } = {}) {
  try {
    const res = await drive(`${DRIVE_FILES_URL}/${file.id}?alt=media`);
    if (!res.ok) {
      if (required) throw new Error(`Drive HTTP ${res.status} while reading ${file.name}`);
      return null;
    }
    return await res.json();
  } catch (error) {
    if (required) throw error;
    return null;
  }
}

async function uploadOrUpdateFile(folderId, fileName, relPath, contentString, mimeType = "application/json; charset=utf-8", existingFileId = null) {
  const metadata = {
    name: fileName,
    mimeType,
    appProperties: {
      relPath,
      cacheControl: relPath.includes("/ch/") ? "public, max-age=604800, stale-while-revalidate=86400" : "public, max-age=60, stale-while-revalidate=300"
    }
  };

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", new Blob([contentString], { type: mimeType }));

  if (existingFileId) {
    const patchUrl = `${DRIVE_UPLOAD_URL}/${existingFileId}?uploadType=multipart&fields=id,name,size,appProperties`;
    const res = await drive(patchUrl, { method: "PATCH", body: form });
    if (!res.ok) throw new Error(`Update ${relPath} error: ${res.status}`);
    return res.json();
  } else {
    metadata.parents = [folderId];
    const postUrl = `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,size,appProperties`;
    const res = await drive(postUrl, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Create ${relPath} error: ${res.status}`);
    return res.json();
  }
}

async function main() {
  console.log("\n=======================================================");
  console.log("   🔄 SYNC DRIVE FOLDERS, INDEXES & CATALOG SNAPSHOT");
  console.log("=======================================================\n");

  const db = createSupabase(process.env, { role: "service" });
  const allDbBooks = db ? await db.listBooks({ limit: 1000 }) : [];
  const dbBookMap = new Map((allDbBooks || []).map((b) => [b.id, b]));

  console.log(`Database contains ${dbBookMap.size} books.`);

  // 1. Locate Drive 'books' root and 'catalog' root
  const rootItems = await listChildren(ROOT_FOLDER_ID);
  const booksFolder = rootItems.find((f) => f.name === "books" && f.mimeType === "application/vnd.google-apps.folder");
  let catalogFolder = rootItems.find((f) => f.name === "catalog" && f.mimeType === "application/vnd.google-apps.folder");

  if (!booksFolder) throw new Error("Could not find 'books' folder under Drive storage root!");
  if (!catalogFolder) {
    console.log("Creating 'catalog' folder in Drive root...");
    const createRes = await drive(DRIVE_FILES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "catalog", mimeType: "application/vnd.google-apps.folder", parents: [ROOT_FOLDER_ID] })
    });
    catalogFolder = await createRes.json();
  }

  if (process.argv.includes("--dedupe-snapshot-only")) {
    const catalogFiles = await listChildren(catalogFolder.id);
    const existingCatalogFile = catalogFiles.find(
      (f) => f.appProperties?.relPath === "catalog/latest.json" || f.name === "latest.json"
    );
    if (!existingCatalogFile) throw new Error("Could not find catalog/latest.json to deduplicate.");
    const currentSnapshot = await readJsonFile(existingCatalogFile);
    if (!currentSnapshot || !Array.isArray(currentSnapshot.books)) throw new Error("catalog/latest.json is invalid.");
    const uniqueBooks = Array.from(new Map(currentSnapshot.books.map((book) => [book.id, book])).values());
    await uploadOrUpdateFile(
      catalogFolder.id,
      "latest.json",
      "catalog/latest.json",
      JSON.stringify({ ...currentSnapshot, generatedAt: new Date().toISOString(), books: uniqueBooks }),
      "application/json; charset=utf-8",
      existingCatalogFile.id
    );
    console.log(`✅ Deduplicated catalog snapshot: ${currentSnapshot.books.length} -> ${uniqueBooks.length} books.`);
    return;
  }

  const onlyBookIds = new Set(process.argv
    .filter((arg) => arg.startsWith("--book="))
    .map((arg) => arg.slice("--book=".length).trim())
    .filter(Boolean));

  // 2. List all book folders
  const allBookFolders = (await listChildren(booksFolder.id)).filter(
    (f) => f.mimeType === "application/vnd.google-apps.folder"
  );
  const bookFolders = onlyBookIds.size
    ? allBookFolders.filter((folder) => {
        const match = folder.name.match(/\(([^)]+)\)$/) || folder.name.match(/^([a-z0-9_-]+)$/i);
        return match && onlyBookIds.has(match[1]);
      })
    : allBookFolders;
  console.log(`Found ${bookFolders.length} book folders on Google Drive.\n`);

  const catalogBooks = [];

  for (let i = 0; i < bookFolders.length; i++) {
    const bf = bookFolders[i];
    // Folder name format: "Title (bookId)" or "bookId"
    const idMatch = bf.name.match(/\(([^)]+)\)$/) || bf.name.match(/^([a-z0-9_-]+)$/i);
    const bookId = idMatch ? idMatch[1] : bf.name;

    if (bookId === "fanqie-7087872099557051400") {
      // User explicitly skipped Thai Thuong Kiem Ton
      continue;
    }

    const dbBook = dbBookMap.get(bookId) || {};
    const bookTitle = dbBook.title || bf.name.replace(/\s*\([^)]+\)$/, "").trim() || bookId;

    console.log(`[${i + 1}/${bookFolders.length}] Scanning ${bookTitle} (${bookId})...`);

    // List all files in this book folder
    const files = await listChildren(bf.id);

    // Check existing index.json / r1/index.json
    let existingIndexFile = files.find(
      (f) => f.appProperties?.relPath === `books/${bookId}/index.json` || f.name === "index.json"
    );
    let existingR1IndexFile = files.find(
      (f) => f.appProperties?.relPath === `books/${bookId}/r1/index.json`
    );

    // Group chapters
    const chaptersByNum = new Map();
    for (const f of files) {
      const origMatch = f.name.match(/^(\d+)\.original\.json$/);
      if (origMatch) {
        const n = Number(origMatch[1]);
        if (!chaptersByNum.has(n)) chaptersByNum.set(n, { n, hasOriginal: true, hasTranslated: false });
        else chaptersByNum.get(n).hasOriginal = true;
      }
      const transMatch = f.name.match(/^(\d+)\.json$/);
      if (transMatch) {
        const n = Number(transMatch[1]);
        if (!chaptersByNum.has(n)) chaptersByNum.set(n, { n, hasOriginal: false, translatedFile: f });
        else chaptersByNum.get(n).translatedFile = f;
      }
    }

    // A numbered JSON file can contain source text, a rough convert, a pending
    // placeholder, or a real translation. Inspect the document instead of
    // treating filename existence as proof that the chapter was translated.
    const translatedFiles = Array.from(chaptersByNum.values()).filter((c) => c.translatedFile);
    await mapWithConcurrency(translatedFiles, 12, async (chapter) => {
      // Never turn a transient Drive read error into a false pending chapter.
      // A required read aborts this book's sync instead of publishing bad counts.
      const document = await readJsonFile(chapter.translatedFile, { required: true });
      chapter.documentTitle = chapterTitleFromDocument(document);
      chapter.hasTranslated = isCompletedTranslationDocument(document);
    });

    // Try reading existing index if available to retain chapter titles
    let existingIndexData = null;
    if (existingIndexFile) {
      try {
        const res = await drive(`${DRIVE_FILES_URL}/${existingIndexFile.id}?alt=media`);
        if (res.ok) existingIndexData = await res.json();
      } catch {}
    }

    const existingTitles = new Map(
      (existingIndexData?.chapters || []).map((c) => [Number(c.n || c.chapterNumber), c.title])
    );

    const sortedNums = Array.from(chaptersByNum.keys()).sort((a, b) => a - b);
    const totalChapters = Math.max(
      Number(SOURCE_TOTAL_OVERRIDES[bookId] || 0),
      Number(dbBook.total_chapters || 0),
      sortedNums.length > 0 ? sortedNums[sortedNums.length - 1] : 0,
      sortedNums.length
    );

    let translatedCount = 0;
    const chaptersList = [];

    for (let n = 1; n <= totalChapters; n++) {
      const c = chaptersByNum.get(n);
      const isTranslated = c?.hasTranslated === true;
      if (isTranslated) translatedCount++;

      // The chapter document is the freshest source of its translated title.
      // The old index remains a fallback for pending or unreadable documents.
      const title = c?.documentTitle || existingTitles.get(n) || `Chương ${n}`;
      chaptersList.push({
        n,
        title,
        status: isTranslated ? "completed" : "pending",
        translationStatus: isTranslated ? "completed" : "pending"
      });
    }

    const isCompleted = translatedCount >= totalChapters && totalChapters > 0;
    const status = isCompleted ? "Hoàn thành" : (translatedCount > 0 ? "Đang cập nhật" : "Chờ dịch");

    console.log(`   -> Total: ${totalChapters} chapters | Translated: ${translatedCount} | Status: ${status}`);

    // Build canonical index object
    const indexObject = {
      schema: 1,
      bookId,
      revision: 1,
      chapterUrlTemplate: `/books/${bookId}/r1/ch/{n}.json`,
      title: bookTitle,
      author: dbBook.author || existingIndexData?.author || "",
      genre: dbBook.genre || existingIndexData?.genre || "",
      status,
      originalStatus: dbBook.status || "Hoàn thành",
      description: dbBook.description || existingIndexData?.description || "",
      cover: dbBook.cover_url || existingIndexData?.cover || `/covers/${bookId}.jpg`,
      source: dbBook.source || existingIndexData?.source || (bookId.startsWith("qidian-") ? "qidian" : "fanqie"),
      sourceId: dbBook.source_id || existingIndexData?.sourceId || bookId.replace(/^[a-z]+-/, ""),
      totalChapters,
      translatedChapters: translatedCount,
      updatedAt: new Date().toISOString(),
      chapters: chaptersList
    };

    const indexJsonStr = JSON.stringify(indexObject);

    // Save books/<bookId>/index.json
    await uploadOrUpdateFile(
      bf.id,
      "index.json",
      `books/${bookId}/index.json`,
      indexJsonStr,
      "application/json; charset=utf-8",
      existingIndexFile?.id
    );

    // Save books/<bookId>/r1/index.json
    await uploadOrUpdateFile(
      bf.id,
      "r1-index.json",
      `books/${bookId}/r1/index.json`,
      indexJsonStr,
      "application/json; charset=utf-8",
      existingR1IndexFile?.id
    );

    // Update Supabase
    if (db) {
      try {
        await db.updateBookProgress(bookId, {
          totalChapters,
          translatedChapters: translatedCount,
          revision: 1,
          status
        });
      } catch (err) {
        console.warn(`   ⚠️ Supabase update error: ${err.message}`);
      }
    }

    // Add to catalog snapshot
    catalogBooks.push({
      id: bookId,
      title: bookTitle,
      author: dbBook.author || "",
      description: dbBook.description || "",
      cover: `/covers/${bookId}.jpg`,
      status,
      originalStatus: dbBook.status || "Hoàn thành",
      genre: dbBook.book_categories?.[0]?.categories?.name || dbBook.genre || "",
      chapterCount: totalChapters,
      totalChapters,
      translatedChapters: translatedCount,
      revision: 1,
      featured: Boolean(dbBook.featured),
      updatedAt: new Date().toISOString(),
      createdAt: dbBook.created_at || ""
    });
  }

  // 3. Publish catalog/latest.json
  console.log(`\nPublishing catalog/latest.json with ${catalogBooks.length} books...`);
  let booksForSnapshot = catalogBooks;
  if (onlyBookIds.size) {
    const catalogFiles = await listChildren(catalogFolder.id);
    const existingCatalogFile = catalogFiles.find(
      (f) => f.appProperties?.relPath === "catalog/latest.json" || f.name === "latest.json"
    );
    const existingSnapshot = existingCatalogFile ? await readJsonFile(existingCatalogFile, { required: true }) : null;
    const merged = new Map((existingSnapshot?.books || []).map((book) => [book.id, book]));
    for (const book of catalogBooks) merged.set(book.id, book);
    booksForSnapshot = Array.from(merged.values());
  }
  const uniqueCatalogBooks = Array.from(new Map(booksForSnapshot.map((book) => [book.id, book])).values());
  const catalogSnapshot = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    books: uniqueCatalogBooks.sort((a, b) => (b.translatedChapters || 0) - (a.translatedChapters || 0))
  };

  const catalogFiles = await listChildren(catalogFolder.id);
  const existingCatalogFile = catalogFiles.find(
    (f) => f.appProperties?.relPath === "catalog/latest.json" || f.name === "latest.json"
  );

  await uploadOrUpdateFile(
    catalogFolder.id,
    "latest.json",
    "catalog/latest.json",
    JSON.stringify(catalogSnapshot),
    "application/json; charset=utf-8",
    existingCatalogFile?.id
  );

  console.log("✅ Successfully synced all book indexes and catalog snapshot on Google Drive!");
}

main().catch((err) => {
  console.error("Fatal error in sync script:", err);
  process.exitCode = 1;
});
