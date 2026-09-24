#!/usr/bin/env node
"use strict";

// Recover raw Chinese chapters from a Tomato EPUB without touching R2, chapter
// translations, book indexes, or Supabase. Each Drive write is scoped to one
// canonical book folder and is create-only after an in-folder inventory.

const fs = require("node:fs");
const path = require("node:path");
const { readEpub, extractChapters } = require("../server/ingest/epub");
const { buildOriginalDocument } = require("../server/ingest/documents");
const { createSupabase } = require("../server/supabase");

for (const envFile of [".env.local", ".env"]) {
  const file = path.resolve(__dirname, "..", envFile);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const TOMATO_URL = String(process.env.TOMATO_URL || "http://127.0.0.1:18423").replace(/\/$/, "");
const TOMATO_PASSWORD = process.env.TOMATO_PASSWORD || "tomato-local-worker";
const DATA_DIR = path.resolve(process.env.TOMATO_DATA_DIR || path.join(__dirname, "..", ".crawler-data"));
const RECOVERY_CACHE_DIR = path.join(DATA_DIR, "recovery");
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_STORAGE_FOLDER_ID;

function arg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : "";
}
function escapeQuery(value) { return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

let token = "";
let tokenExpiry = 0;
async function getToken() {
  if (token && Date.now() < tokenExpiry - 60000) return token;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_DRIVE_CLIENT_ID, client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET, refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN, grant_type: "refresh_token" })
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) throw new Error(`Google OAuth error: ${body.error || response.status}`);
  token = body.access_token;
  tokenExpiry = Date.now() + Number(body.expires_in || 3600) * 1000;
  return token;
}
async function drive(url, options = {}) {
  // Google applies a per-user write quota which can be lower than the published
  // project quota. Retrying here preserves the in-flight book instead of making
  // a batch skip to another one with a partial original set.
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${await getToken()}`, ...(options.headers || {}) } });
      if (response.ok) return response;
      const detail = await response.text().catch(() => "");
      const retryable = response.status === 429 || response.status >= 500 ||
        response.status === 403 && /(?:userRateLimitExceeded|rateLimitExceeded|internalError)/i.test(detail);
      if (!retryable || attempt === 9) throw new Error(`Drive HTTP ${response.status}: ${detail.slice(0, 300)}`);
      const delay = Math.min(60000, 2000 * 2 ** attempt) + Math.floor(Math.random() * 1000);
      console.warn(`Drive transient error (${response.status}); retry ${attempt + 1}/10 in ${Math.round(delay / 1000)}s.`);
      await sleep(delay);
    } catch (error) {
      // DNS/socket resets and fetch timeouts are as transient as a 5xx. Do not
      // abandon a partially uploaded book merely because one request broke.
      if (attempt === 9 || /^Drive HTTP (?:4(?!29)|403)/.test(String(error.message || ""))) throw error;
      const delay = Math.min(60000, 2000 * 2 ** attempt) + Math.floor(Math.random() * 1000);
      console.warn(`Drive connection error; retry ${attempt + 1}/10 in ${Math.round(delay / 1000)}s: ${error.message}`);
      await sleep(delay);
    }
  }
}
async function listChildren(parentId, folders) {
  const files = [];
  let pageToken = "";
  do {
    const url = new URL(DRIVE_FILES_URL);
    const kind = folders ? "mimeType = 'application/vnd.google-apps.folder'" : "mimeType != 'application/vnd.google-apps.folder'";
    url.searchParams.set("q", `'${escapeQuery(parentId)}' in parents and trashed = false and ${kind}`);
    url.searchParams.set("fields", "nextPageToken,files(id,name,size,createdTime,appProperties)");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await (await drive(url)).json();
    files.push(...(body.files || []));
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return files;
}
async function createFolder(parentId, name) {
  const response = await drive(`${DRIVE_FILES_URL}?fields=id,name`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }) });
  return response.json();
}
async function canonicalFolder(book) {
  const roots = await listChildren(ROOT_FOLDER_ID, true);
  const booksRoots = roots.filter(item => item.name === "books");
  if (booksRoots.length !== 1) throw new Error(`Expected exactly one Drive 'books' root; found ${booksRoots.length}.`);
  const name = `${book.title} (${book.id})`;
  const folders = (await listChildren(booksRoots[0].id, true)).filter(item => item.name === name);
  if (folders.length > 1) throw new Error(`Book has ${folders.length} duplicate folders (${name}); resolve folder duplication before recovery.`);
  return folders[0] || createFolder(booksRoots[0].id, name);
}
async function tomato(pathname, options = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(`${TOMATO_URL}${pathname}`, { ...options, headers: { "x-tomato-password": TOMATO_PASSWORD, ...(options.headers || {}) }, signal: AbortSignal.timeout(60000) });
    const body = await response.json().catch(() => ({}));
    if (response.ok) return body;
    if (response.status !== 429 || attempt === 5) throw new Error(`Tomato HTTP ${response.status}: ${body.error || body.message || "unknown"}`);
    const delay = Math.min(60000, 2000 * 2 ** attempt) + Math.floor(Math.random() * 1000);
    console.warn(`Tomato rate limit; retry ${attempt + 1}/6 in ${Math.round(delay / 1000)}s.`);
    await sleep(delay);
  }
}
function allEpubs(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) for (const entry of fs.readdirSync(stack.pop(), { withFileTypes: true })) {
    const full = path.join(entry.parentPath || entry.path || "", entry.name);
    if (entry.isDirectory()) stack.push(full);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".epub")) out.push(full);
  }
  return out;
}
function allCandidateEpubs() {
  const dirs = [DATA_DIR, path.join(DATA_DIR, "library"), "D:\\data\\library"].filter(d => fs.existsSync(d));
  const seen = new Set();
  const out = [];
  for (const dir of dirs) {
    for (const f of allEpubs(dir)) {
      if (!seen.has(f)) { seen.add(f); out.push(f); }
    }
  }
  return out;
}
async function downloadEpub(sourceId) {
  const cacheFile = path.join(RECOVERY_CACHE_DIR, `fanqie-${sourceId}.epub`);
  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 1024) {
    console.log(`Using cached EPUB for Fanqie ${sourceId}.`);
    return cacheFile;
  }
  await tomato("/api/status");
  const config = await tomato("/api/config/full");
  await tomato("/api/config/full", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...config, save_path: "/data/library", novel_format: "epub", bulk_files: false, ask_format_after_download: false, preferred_book_name_field: "book_name", enable_audiobook: false, auto_open: false }) });
  const before = new Map(allCandidateEpubs().map(file => [file, fs.statSync(file).mtimeMs]));
  const started = Date.now();
  const existingJobs = await tomato("/api/jobs?all=true");
  const activeJob = (existingJobs.items || []).find((job) => String(job.book_id) === String(sourceId) && !["done", "failed", "canceled"].includes(job.state));
  const created = activeJob || await tomato("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ book_id: sourceId }) });
  if (activeJob) console.log(`Reusing active Tomato job ${activeJob.id} for ${sourceId}.`);
  for (;;) {
    const job = (await tomato(`/api/jobs?id=${encodeURIComponent(created.id)}&all=true`)).items?.[0];
    if (!job) throw new Error("Tomato job disappeared.");
    if (job.book_name_options?.length) await tomato(`/api/jobs/${created.id}/book_name`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: job.book_name_options[0].value }) });
    if (job.format_options?.length) {
      const choice = job.format_options.find(item => String(item.value).toLowerCase() === "epub") || job.format_options[0];
      await tomato(`/api/jobs/${created.id}/format`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: choice.value }) });
    }
    const saved = Number(job.progress?.saved_chapters || 0), total = Number(job.progress?.chapter_total || 0);
    process.stdout.write(`\rTomato ${sourceId}: ${saved}/${total || "?"} chapters`);
    if (job.state === "done") break;
    if (["failed", "canceled"].includes(job.state)) throw new Error(job.message || `Tomato job ${job.state}`);
    await sleep(10000);
  }
  console.log("");
  const epub = allCandidateEpubs().map(file => ({ file, mtime: fs.statSync(file).mtimeMs })).filter(item => item.mtime >= started - 5000 || item.mtime > (before.get(item.file) || 0)).sort((a, b) => b.mtime - a.mtime)[0]?.file;
  if (!epub) throw new Error("Tomato completed but no new EPUB was found.");
  fs.mkdirSync(RECOVERY_CACHE_DIR, { recursive: true });
  fs.copyFileSync(epub, cacheFile);
  return cacheFile;
}
async function uploadOriginal(folderId, fileName, relPath, body) {
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ name: fileName, parents: [folderId], mimeType: "application/json", appProperties: { relPath, cacheControl: "public, max-age=604800" } })], { type: "application/json" }));
  form.append("file", new Blob([body], { type: "application/json" }));
  await drive(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,size`, { method: "POST", body: form });
}
async function main() {
  const bookId = arg("--book");
  if (!/^fanqie-\d{10,25}$/.test(bookId)) throw new Error("Usage: node scripts/recover-fanqie-originals.js --book fanqie-<id>");
  if (!ROOT_FOLDER_ID) throw new Error("Missing GOOGLE_DRIVE_STORAGE_FOLDER_ID.");
  const db = createSupabase(process.env, { role: "service" });
  const book = (await db.listBooks({ limit: 1000 })).find(item => item.id === bookId);
  if (!book) throw new Error(`Book ${bookId} is not in the 79-book catalogue.`);
  const folder = await canonicalFolder(book);
  const existing = new Map();
  for (const file of await listChildren(folder.id, false)) {
    const match = file.name.match(/^(\d+)\.original\.json$/);
    if (!match) continue;
    const n = Number(match[1]);
    if (existing.has(n)) throw new Error(`Duplicate original chapter ${n} in ${folder.name}; manual review required.`);
    existing.set(n, file);
  }
  const expected = Number(book.total_chapters || 0);
  // A resumed batch must not download an EPUB merely to discover that this book
  // was completed by a prior run. More chapters than Supabase reports is valid
  // (sources can update before metadata does), so only skip when it is complete.
  if (expected > 0 && existing.size >= expected) {
    console.log(`${book.title}: already complete (${existing.size}/${expected}); skipped.`);
    return;
  }
  console.log(`${book.title}: ${existing.size} raw chapters already present. Starting Tomato download...`);
  const suppliedEpub = arg("--epub");
  const epubPath = suppliedEpub ? path.resolve(suppliedEpub) : await downloadEpub(bookId.replace(/^fanqie-/, ""));
  if (!fs.existsSync(epubPath)) throw new Error(`EPUB not found: ${epubPath}`);
  const epub = await readEpub(fs.readFileSync(epubPath));
  const chapters = [];
  for await (const chapter of extractChapters(epub)) chapters.push(chapter);
  if (!chapters.length) throw new Error("Downloaded EPUB contains no readable chapters.");
  if (expected && chapters.length < Math.ceil(expected * 0.9)) throw new Error(`EPUB has ${chapters.length}/${expected} chapters; refusing partial recovery.`);
  const pending = chapters.filter(chapter => !existing.has(chapter.chapterNumber));
  let uploaded = 0;
  let cursor = 0;
  // Four workers stay comfortably under the per-user Drive quota while avoiding
  // an hours-long serial upload for a recovered novel.
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
    while (cursor < pending.length) {
      const chapter = pending[cursor++];
      const doc = buildOriginalDocument({ bookId, revision: 1, chapter });
      await uploadOriginal(folder.id, `${chapter.chapterNumber}.original.json`, `books/${bookId}/r1/ch/${chapter.chapterNumber}.original.json`, JSON.stringify(doc));
      uploaded++;
      if (uploaded % 25 === 0 || uploaded === pending.length) process.stdout.write(`\rDrive ${bookId}: uploaded ${uploaded}/${pending.length} raw chapters`);
      await sleep(120);
    }
  }));
  console.log(`\nDone: ${book.title}; EPUB=${chapters.length}, uploaded=${uploaded}, existing=${existing.size}.`);

  // Build and write canonical index.json and r1/index.json to Drive
  try {
    const totalChapters = Math.max(chapters.length, existing.size + uploaded);
    const indexObject = {
      schema: 1,
      bookId,
      revision: 1,
      chapterUrlTemplate: `/books/${bookId}/r1/ch/{n}.json`,
      title: book.title,
      author: book.author || "",
      genre: book.genre || "",
      status: "Chờ dịch",
      originalStatus: book.status || "Hoàn thành",
      description: book.description || "",
      cover: book.cover_url || `/covers/${bookId}.jpg`,
      source: "fanqie",
      sourceId: bookId.replace(/^fanqie-/, ""),
      totalChapters,
      translatedChapters: 0,
      updatedAt: new Date().toISOString(),
      chapters: chapters.map((c) => ({
        n: c.chapterNumber,
        title: c.title || `Chương ${c.chapterNumber}`,
        status: "pending"
      }))
    };
    const indexStr = JSON.stringify(indexObject);
    const existingIndex = (await listChildren(folder.id, false)).find(f => f.name === "index.json" || f.appProperties?.relPath === `books/${bookId}/index.json`);
    const existingR1 = (await listChildren(folder.id, false)).find(f => f.name === "r1-index.json" || f.appProperties?.relPath === `books/${bookId}/r1/index.json`);
    
    if (existingIndex) {
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify({ name: "index.json", mimeType: "application/json", appProperties: { relPath: `books/${bookId}/index.json`, cacheControl: "public, max-age=60" } })], { type: "application/json" }));
      form.append("file", new Blob([indexStr], { type: "application/json" }));
      await drive(`${DRIVE_UPLOAD_URL}/${existingIndex.id}?uploadType=multipart&fields=id,name`, { method: "PATCH", body: form });
    } else {
      await uploadOriginal(folder.id, "index.json", `books/${bookId}/index.json`, indexStr);
    }

    if (existingR1) {
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify({ name: "r1-index.json", mimeType: "application/json", appProperties: { relPath: `books/${bookId}/r1/index.json`, cacheControl: "public, max-age=60" } })], { type: "application/json" }));
      form.append("file", new Blob([indexStr], { type: "application/json" }));
      await drive(`${DRIVE_UPLOAD_URL}/${existingR1.id}?uploadType=multipart&fields=id,name`, { method: "PATCH", body: form });
    } else {
      await uploadOriginal(folder.id, "r1-index.json", `books/${bookId}/r1/index.json`, indexStr);
    }
    await db.updateBookProgress(bookId, { totalChapters, revision: 1 });
  } catch (err) {
    console.warn(`Drive ${bookId} index update notice: ${err.message}`);
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
