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

const { createStorage, LAYOUT, cacheControlFor } = require("../server/storage");
const { repairTranslationTextArtifacts } = require("../server/translation-artifacts");

const args = process.argv.slice(2);
const flag = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const hasFlag = (name) => args.includes(name);

const ONLY_BOOK = flag("--book", "");
const WRITE = hasFlag("--write");
const MAX_BOOKS = Number(flag("--max-books", "0"));
const MAX_CHAPTERS = Number(flag("--max-chapters", "0"));
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

async function main() {
  const catalog = (await readJson(LAYOUT.catalogSnapshot())) || {};
  let books = catalog.books || [];
  if (ONLY_BOOK) books = books.filter((book) => book.id === ONLY_BOOK);
  if (MAX_BOOKS > 0) books = books.slice(0, MAX_BOOKS);

  const totals = { books: 0, scanned: 0, changed: 0 };
  const changedBooks = new Map();

  console.log(`${WRITE ? "WRITE" : "DRY-RUN"} repair translation artifacts`);
  console.log(`Books: ${books.length}${ONLY_BOOK ? ` (only ${ONLY_BOOK})` : ""}`);
  console.log(`Chapter concurrency: ${CONCURRENCY}`);

  for (const book of books) {
    const index = await readJson(LAYOUT.bookIndex(book.id));
    if (!index) continue;

    totals.books += 1;
    const revision = index.revision || 1;
    let chapters = (index.chapters || []).filter((chapter) => chapter.status === "completed");
    if (MAX_CHAPTERS > 0) chapters = chapters.slice(0, MAX_CHAPTERS);

    await mapConcurrent(chapters, CONCURRENCY, async (entry) => {
      const key = LAYOUT.chapter(book.id, revision, entry.n);
      const chapter = await readJson(key);
      if (!chapter || !chapter.content) return;

      totals.scanned += 1;
      const repaired = repairTranslationTextArtifacts(chapter.content, { title: chapter.title || entry.title || "" });
      if (repaired.text === chapter.content) return;

      totals.changed += 1;
      changedBooks.set(book.id, (changedBooks.get(book.id) || 0) + 1);
      console.log(`- ${book.title || book.id} / ch ${entry.n}: ${repaired.reasons.join("; ")}`);

      if (WRITE) {
        await storage.put(
          key,
          JSON.stringify({
            ...chapter,
            content: repaired.text,
            repairedAt: new Date().toISOString(),
            repairedFrom: "translation-text-artifact-cleanup"
          }),
          { cacheControl: cacheControlFor(key) }
        );
      }
    });
  }

  console.log("\nSummary");
  console.log(`- Books scanned: ${totals.books}`);
  console.log(`- Chapters scanned: ${totals.scanned}`);
  console.log(`- Chapters ${WRITE ? "repaired" : "would repair"}: ${totals.changed}`);
  for (const [bookId, count] of changedBooks) {
    const book = books.find((item) => item.id === bookId);
    console.log(`  ${book?.title || bookId} (${bookId}): ${count}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
