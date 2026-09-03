#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const { buildChapterDocument } = require("../server/ingest/documents");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");
const { jobStateKey } = require("../server/ingest/translation-queue");
const { createStorage, LAYOUT, cacheControlFor } = require("../server/storage");
const { detectRawHanVietTranscription } = require("../server/translation-artifacts");

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const flag = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const WRITE = hasFlag("--write");
const ONLY_BOOK = flag("--book", "");
const CONCURRENCY = Math.max(1, Number(flag("--concurrency", "25")));

const storage = createStorage();

async function readJson(key) {
  const raw = await storage.get(key);
  if (!raw) return null;
  return JSON.parse(raw.toString("utf8"));
}

async function mapConcurrent(items, concurrency, fn) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function resetQueueEntry(entry, reason) {
  entry.status = "pending";
  entry.translationStatus = "pending";
  entry.attempts = 0;
  entry.nextAttemptAt = 0;
  entry.completedAt = "";
  entry.lastError = reason;
}

async function main() {
  const catalog = (await readJson(LAYOUT.catalogSnapshot())) || {};
  let books = catalog.books || [];
  if (ONLY_BOOK) books = books.filter((book) => book.id === ONLY_BOOK);

  const found = [];
  const byBook = new Map();
  console.log(`${WRITE ? "WRITE" : "DRY-RUN"} reset raw transcription chapters`);
  console.log(`Books: ${books.length}${ONLY_BOOK ? ` (only ${ONLY_BOOK})` : ""}`);

  for (const book of books) {
    const index = await readJson(LAYOUT.bookIndex(book.id));
    if (!index) continue;
    const revision = index.revision || 1;
    const chapters = (index.chapters || []).filter((chapter) => chapter.status === "completed");

    await mapConcurrent(chapters, CONCURRENCY, async (entry) => {
      const n = Number(entry.n || entry.chapterNumber);
      const doc = await readJson(LAYOUT.chapter(book.id, revision, n));
      if (!doc?.content || !detectRawHanVietTranscription(doc.content)) return;
      const original = await readJson(LAYOUT.chapterOriginal(book.id, revision, n));
      if (!original?.content) {
        found.push({ book, revision, n, entry, doc, original: null, skipped: "missing original" });
        return;
      }
      const item = { book, revision, n, entry, doc, original };
      found.push(item);
      if (!byBook.has(book.id)) byBook.set(book.id, { book, revision, chapters: [] });
      byBook.get(book.id).chapters.push(item);
    });
  }

  found.sort((a, b) => a.book.id.localeCompare(b.book.id) || a.n - b.n);
  for (const item of found) {
    console.log(`- ${item.book.title || item.book.id} (${item.book.id}) ch ${item.n}: ${item.doc?.title || item.entry?.title || ""}${item.skipped ? ` [skip: ${item.skipped}]` : ""}`);
  }
  console.log(`Total raw transcription chapters: ${found.length}`);

  if (!WRITE) return;

  const reason = "Phát hiện phiên âm Hán-Việt/pinyin thô; reset để dịch lại";
  let resetCount = 0;
  for (const { book, revision, chapters } of byBook.values()) {
    const indexKey = LAYOUT.bookIndex(book.id);
    const stateKey = jobStateKey(book.id);
    const index = await readJson(indexKey);
    const state = await readJson(stateKey);
    let indexChanged = false;
    let stateChanged = false;

    const indexByNumber = new Map((index?.chapters || []).map((entry) => [Number(entry.n || entry.chapterNumber), entry]));
    const stateByNumber = new Map((state?.chapters || []).map((entry) => [Number(entry.n || entry.chapterNumber), entry]));

    for (const item of chapters) {
      const sourceChapter = {
        ...item.original,
        chapterNumber: item.n,
        title: item.original.title || item.doc.title || item.entry.title
      };
      const pendingDoc = buildChapterDocument({
        bookId: book.id,
        revision,
        chapter: sourceChapter,
        translationStatus: "pending",
        qaRequired: true,
        qaIssues: [reason],
        qualityScore: 0
      });
      await storage.put(
        LAYOUT.chapter(book.id, revision, item.n),
        JSON.stringify({
          ...pendingDoc,
          resetAt: new Date().toISOString(),
          resetFrom: "raw-hanviet-transcription-audit",
          lastError: reason
        }),
        { cacheControl: cacheControlFor(LAYOUT.chapter(book.id, revision, item.n)) }
      );

      const indexEntry = indexByNumber.get(item.n);
      if (indexEntry) {
        indexEntry.status = "pending";
        indexEntry.translationStatus = "pending";
        indexEntry.qaRequired = true;
        indexEntry.qaIssues = [reason];
        indexChanged = true;
      }

      const stateEntry = stateByNumber.get(item.n);
      if (stateEntry) {
        resetQueueEntry(stateEntry, reason);
        stateChanged = true;
      }

      resetCount += 1;
    }

    if (indexChanged) {
      index.translatedChapters = (index.chapters || []).filter((entry) => (entry.status || entry.translationStatus) === "completed").length;
      index.updatedAt = new Date().toISOString();
      await storage.put(indexKey, JSON.stringify(index), { cacheControl: cacheControlFor(indexKey) });
    }
    if (stateChanged) {
      state.updatedAt = new Date().toISOString();
      await storage.put(stateKey, JSON.stringify(state), { cacheControl: cacheControlFor(stateKey) });
    }
  }

  await publishCatalogSnapshot({ storage, env: process.env });
  console.log(`Reset queued chapters: ${resetCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
