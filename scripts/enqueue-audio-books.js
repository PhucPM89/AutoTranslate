"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createStorage } = require("../server/storage");
const { createAudioJob, listAudioJobs } = require("../server/audio/job-queue");

for (const name of [".env.local", ".env"]) {
  const file = path.resolve(name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

function chapterCounts(book) {
  const total = Number(book.totalChapters || book.chapterCount || book.chapters?.length || 0);
  const translated = Number(book.translatedChapters || 0);
  return { total, translated, full: total > 0 && translated >= total };
}

function prioritizeBooks(books) {
  return [...books]
    // Hàng đợi tạo audio chỉ dành riêng cho các bộ đã dịch full trên Drive
    .filter((book) => chapterCounts(book).full)
    .sort((a, b) => {
      // 1. Ưu tiên bộ Ranh Giới Hoàng Hôn trước tiên
      const isRghhA = a.id === "qidian-1036575193" || /ranh giới hoàng hôn/i.test(a.title || "");
      const isRghhB = b.id === "qidian-1036575193" || /ranh giới hoàng hôn/i.test(b.title || "");
      if (isRghhA && !isRghhB) return -1;
      if (!isRghhA && isRghhB) return 1;

      // 2. Tới các bộ đã dịch full khác trên hệ thống
      const ac = chapterCounts(a);
      const bc = chapterCounts(b);
      if (bc.translated !== ac.translated) return bc.translated - ac.translated;
      return String(a.title || a.id).localeCompare(String(b.title || b.id), "vi");
    });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const storage = createStorage();
  const raw = await storage.get("catalog/latest.json");
  if (!raw) throw new Error("Không đọc được catalog/latest.json.");
  const catalog = JSON.parse(raw.toString("utf8"));
  
  const activeJobs = await listAudioJobs(storage);
  const activeIds = new Set(activeJobs
    .filter((job) => ["pending", "running", "retrying", "completed"].includes(job.status))
    .map((job) => job.bookId));

  const books = prioritizeBooks(catalog.books || []);
  const pendingToEnqueue = books.filter((book) => !activeIds.has(book.id));

  const planned = books.map((book) => ({
    id: book.id,
    title: book.title,
    genre: book.genre || "",
    alreadyEnqueued: activeIds.has(book.id),
    ...chapterCounts(book)
  }));

  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, planned, existingJobs: activeJobs }, null, 2));
    return;
  }

  const created = [];
  for (const book of pendingToEnqueue) {
    const counts = chapterCounts(book);
    const indexRaw = await storage.get(`books/${book.id}/index.json`);
    if (!indexRaw) continue;
    const index = JSON.parse(indexRaw.toString("utf8"));
    const job = await createAudioJob({
      bookId: book.id,
      bookTitle: book.title,
      genre: book.genre || index.genre || "",
      revision: Number(index.revision || 1),
      totalChapters: counts.total,
      mode: "missing_only"
    }, storage);
    created.push({ id: job.id, bookId: job.bookId, title: job.bookTitle, totalChapters: job.totalChapters });
  }
  console.log(JSON.stringify({ dryRun: false, created, allPlanned: planned }, null, 2));
}

if (require.main === module) main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

module.exports = { chapterCounts, prioritizeBooks };
