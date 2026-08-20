"use strict";

// Ingest one uploaded EPUB. Started by the admin panel through a
// workflow_dispatch, so it runs with the full Actions time limit instead of a
// serverless timeout.
//
// The archive is read from the PRIVATE bucket with server credentials. The
// browser only ever held a presigned PUT for that one key.
//
//   node scripts/ingest-worker.js --archive uploads/<hex>.epub --title "..."

const { createArchiveStorage } = require("../server/storage");
const { runIngest } = require("../server/ingest/run-ingest");
const { slug } = require("../server/storage/keys");

const args = process.argv.slice(2);
const flag = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

async function main() {
  const archiveKey = flag("--archive", process.env.ARCHIVE_KEY);
  if (!archiveKey) throw new Error("Thiếu --archive (key EPUB trong bucket archive).");
  if (!archiveKey.startsWith("uploads/") || archiveKey.includes("..")) {
    throw new Error("archive key không hợp lệ.");
  }

  const title = flag("--title", process.env.BOOK_TITLE) || "Chưa đặt tên";
  const bookId = flag("--id", process.env.BOOK_ID) || bookIdFromKey(archiveKey);

  console.log(`Đang tải EPUB từ bucket archive: ${archiveKey}`);
  const archive = createArchiveStorage();
  const epubBuffer = await archive.get(archiveKey);
  if (!epubBuffer || !epubBuffer.length) throw new Error(`Không đọc được ${archiveKey}.`);
  console.log(`  ${(epubBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  const result = await runIngest({
    epubBuffer,
    book: {
      id: bookId,
      title,
      author: flag("--author", process.env.BOOK_AUTHOR),
      genre: flag("--genre", process.env.BOOK_GENRE),
      description: flag("--description", process.env.BOOK_DESCRIPTION),
      cover: flag("--cover", process.env.BOOK_COVER)
    },
    revision: Number(flag("--revision", process.env.BOOK_REVISION || "1")) || 1,
    // Chapters are enqueued here and translated by translate-worker.js. Ingest
    // must not sit on a Gemini queue for hours while the admin waits.
    translateEnabled: false,
    log: (event) => console.log("  ", JSON.stringify(event))
  });

  console.log(`\nXong: ${bookId} — ${result.chapters ?? result.totalChapters ?? "?"} chương đã xếp hàng dịch.`);
}

// Derived from the random key so a re-dispatch of the same upload is idempotent
// rather than creating a second book.
function bookIdFromKey(archiveKey) {
  const base = archiveKey.replace(/^uploads\//, "").replace(/\.epub$/i, "");
  return slug(`upload-${base}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("INGEST WORKER FAILED:", error.message);
    process.exit(1);
  });
}

module.exports = { bookIdFromKey };
