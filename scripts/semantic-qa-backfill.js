#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
for (const file of [".env.local", ".env"]) {
  const target = path.join(process.cwd(), file);
  if (!fs.existsSync(target)) continue;
  for (const line of fs.readFileSync(target, "utf8").split("\n")) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
}
const { createStorage, LAYOUT } = require("../server/storage");
const { TRANSLATION_VERSION, isProtectedGeminiDocument } = require("../server/translation-version");
const { mergeReviewEntries, reviewQueueKey } = require("../server/semantic-review");
const storage = createStorage();
const args = process.argv.slice(2);
const value = (flag, fallback = "") => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : fallback; };
const ONLY_BOOK = value("--book");
const MAX_BOOKS = Math.max(1, Number(value("--max-books", "10")));
const READ_CONCURRENCY = Math.max(1, Math.min(32, Number(value("--concurrency", "16"))));
const DRY_RUN = args.includes("--dry-run");
async function readJson(key) { const raw = await storage.get(key); return raw ? JSON.parse(raw.toString("utf8")) : null; }
async function putJson(key, value) { await storage.put(key, JSON.stringify(value, null, 2), { cacheControl: "private, no-store" }); }
async function mapConcurrent(items, concurrency, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return output;
}

async function main() {
  const indexKeys = ONLY_BOOK ? [`books/${ONLY_BOOK}/index.json`] : (await storage.list("books/"))
    .map((item) => item.key).filter((key) => /^books\/[^/]+\/index\.json$/.test(key)).slice(0, MAX_BOOKS);
  let books = 0, drafts = 0, queued = 0;
  for (const indexKey of indexKeys) {
    const state = await readJson(indexKey);
    if (!state || !Array.isArray(state.chapters)) continue;
    const bookId = state.id || state.bookId || indexKey.split("/")[1];
    const revision = Number(state.revision || 1);
    let queue = await readJson(reviewQueueKey(bookId));
    let scanned = 0;
    const results = await mapConcurrent(state.chapters, READ_CONCURRENCY, async (item) => {
      const chapterNumber = Number(item.n || item.chapterNumber);
      if (!chapterNumber) return null;
      const published = await readJson(LAYOUT.chapter(bookId, revision, chapterNumber));
      if (!published?.content || isProtectedGeminiDocument(published)) return null;
      if (published.provider !== "hachimi" || published.translationVersion !== TRANSLATION_VERSION) return null;
      let draft = await readJson(LAYOUT.chapterDraft(bookId, revision, chapterNumber));
      if (!draft) {
        draft = { ...published, qaStatus: published.qaStatus || "review_pending", qaReviewed: false };
        if (!DRY_RUN) await putJson(LAYOUT.chapterDraft(bookId, revision, chapterNumber), draft);
        drafts += 1;
      }
      scanned += 1;
      if (scanned % 100 === 0) console.log(`  ${bookId}: đã tìm ${scanned} Hachimi v2 draft...`);
      return { revision, chapterNumber, translationVersion: draft.translationVersion, content: draft.content };
    });
    const candidates = results.filter(Boolean);
    const before = queue?.entries?.length || 0;
    queue = mergeReviewEntries(queue, candidates, { bookId, revision });
    queued += Math.max(0, queue.entries.length - before);
    if (!DRY_RUN && candidates.length) await putJson(reviewQueueKey(bookId), queue);
    books += 1;
    console.log(`${bookId}: ${candidates.length} draft hợp lệ · queue ${queue.entries.length}.`);
  }
  console.log(`Backfill: ${books} bộ · tạo ${drafts} draft · thêm ${queued} queue entries${DRY_RUN ? " (dry-run)" : ""}.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
