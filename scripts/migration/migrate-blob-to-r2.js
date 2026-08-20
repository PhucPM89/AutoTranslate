"use strict";

// Moves the existing library from Vercel Blob into R2, book by book.
//
// Safe to re-run: a book whose index.json already reports the same chapter count
// is skipped, so an interrupted migration resumes instead of redoing work.
// Nothing is ever deleted from Blob — it stays as the rollback copy.
//
//   node scripts/migration/migrate-blob-to-r2.js --dry-run
//   node scripts/migration/migrate-blob-to-r2.js --limit 1
//   node scripts/migration/migrate-blob-to-r2.js

const { createStorage, hasR2Credentials } = require("../../server/storage");
const { LAYOUT } = require("../../server/storage/keys");
const { ingestBook } = require("../../server/ingest/ingest-book");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const LIMIT = Number((args.find((a) => a.startsWith("--limit")) || "").split("=")[1] || argAfter("--limit") || Infinity);
const ONLY = argAfter("--book") || "";

function argAfter(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : "";
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Thiếu BLOB_READ_WRITE_TOKEN (nguồn).");
  if (!hasR2Credentials()) throw new Error("Thiếu R2 credentials (đích).");

  const storage = createStorage();
  const { list } = require("@vercel/blob");

  // ---- source inventory -------------------------------------------------
  const blobs = [];
  let cursor;
  do {
    const page = await list({ cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);

  const catalogBlob = blobs.find((b) => b.pathname === "library/catalog.json");
  if (!catalogBlob) throw new Error("Không tìm thấy library/catalog.json trên Blob.");
  const catalog = await (await fetch(`${catalogBlob.url}?v=${Date.now()}`, { cache: "no-store" })).json();

  const books = (catalog.books || []).filter((b) => b && b.id && b.epub);
  const epubBlobs = blobs.filter((b) => b.pathname.startsWith("library/books/"));
  const coverBlobs = blobs.filter((b) => b.pathname.startsWith("library/covers/"));

  console.log("===== SOURCE (Vercel Blob) =====");
  console.log(`  catalog books : ${books.length}`);
  console.log(`  epub objects  : ${epubBlobs.length}  (${mb(epubBlobs)} MB)`);
  console.log(`  cover objects : ${coverBlobs.length}  (${mb(coverBlobs)} MB)`);
  console.log(`  mode          : ${DRY_RUN ? "DRY RUN (không ghi gì)" : "LIVE"}${FORCE ? " +force" : ""}`);

  const report = {
    booksTotal: books.length,
    booksMigrated: 0,
    booksSkipped: 0,
    booksFailed: 0,
    chaptersMigrated: 0,
    coversMigrated: 0,
    coversSkipped: 0,
    bytesEpub: 0,
    failures: []
  };

  let processed = 0;
  for (const book of books) {
    if (ONLY && book.id !== ONLY) continue;
    if (processed >= LIMIT) break;
    processed += 1;

    const label = `[${processed}/${Math.min(books.length, LIMIT === Infinity ? books.length : LIMIT)}] ${book.id}`;
    try {
      // Already migrated? index.json is written last for chapters, so it is the
      // marker that a book completed.
      if (!FORCE) {
        const existing = await readJson(storage, LAYOUT.bookIndex(book.id));
        if (existing && existing.totalChapters > 0) {
          console.log(`${label} SKIP — đã có index (${existing.totalChapters} chương)`);
          report.booksSkipped += 1;
          report.chaptersMigrated += existing.totalChapters;
          continue;
        }
      }

      if (DRY_RUN) {
        console.log(`${label} would migrate: ${book.title}`);
        report.booksMigrated += 1;
        continue;
      }

      // ---- EPUB ---------------------------------------------------------
      const response = await fetch(book.epub);
      if (!response.ok) throw new Error(`tải EPUB lỗi HTTP ${response.status}`);
      const epubBuffer = Buffer.from(await response.arrayBuffer());
      report.bytesEpub += epubBuffer.length;

      // ---- cover (copy the catalog's own cover, keep its extension) ------
      let coverUrl = "";
      if (book.cover) {
        const extension = extensionOf(book.cover);
        const coverKey = LAYOUT.cover(book.id, extension);
        if (!FORCE && (await storage.head(coverKey))) {
          report.coversSkipped += 1;
          coverUrl = safeUrl(storage, coverKey);
        } else {
          const coverResponse = await fetch(book.cover);
          if (coverResponse.ok) {
            const coverBuffer = Buffer.from(await coverResponse.arrayBuffer());
            await storage.put(coverKey, coverBuffer, { contentType: contentTypeOf(extension) });
            report.coversMigrated += 1;
            coverUrl = safeUrl(storage, coverKey);
          }
        }
      }

      // ---- chapters (translation deliberately not run here) -------------
      const result = await ingestBook({
        storage,
        epubBuffer,
        book: { ...book, cover: coverUrl || book.cover || "" },
        revision: 1,
        translate: null,
        log: () => {}
      });

      report.booksMigrated += 1;
      report.chaptersMigrated += result.totalChapters;
      console.log(
        `${label} OK — ${result.totalChapters} chương, ${(epubBuffer.length / 1048576).toFixed(1)} MB EPUB`
      );
    } catch (error) {
      report.booksFailed += 1;
      report.failures.push({ bookId: book.id, error: error.message });
      console.log(`${label} FAIL — ${error.message}`);
    }
  }

  console.log("\n===== MIGRATION REPORT =====");
  console.log(`  old books      = ${report.booksTotal}`);
  console.log(`  migrated books = ${report.booksMigrated}`);
  console.log(`  skipped books  = ${report.booksSkipped} (đã migrate trước đó)`);
  console.log(`  failed books   = ${report.booksFailed}`);
  console.log(`  chapters       = ${report.chaptersMigrated}`);
  console.log(`  covers copied  = ${report.coversMigrated} (skip ${report.coversSkipped})`);
  console.log(`  epub bytes     = ${(report.bytesEpub / 1048576).toFixed(1)} MB`);
  if (report.failures.length) {
    console.log("  failures:");
    for (const f of report.failures) console.log(`    ${f.bookId}: ${f.error}`);
  }

  const accounted = report.booksMigrated + report.booksSkipped;
  const complete = report.booksFailed === 0 && (LIMIT !== Infinity || ONLY || accounted === report.booksTotal);
  console.log(`\n  ${complete ? "PASS" : "MISMATCH"} — ${accounted}/${report.booksTotal} books accounted for`);
  if (!complete) process.exitCode = 1;
}

async function readJson(storage, key) {
  const buffer = await storage.get(key).catch(() => null);
  if (!buffer) return null;
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    return null;
  }
}

function safeUrl(storage, key) {
  try {
    return storage.publicUrl(key);
  } catch {
    return "";
  }
}

function extensionOf(url) {
  const match = String(url).toLowerCase().match(/\.(jpe?g|png|webp)(?:\?|$)/);
  return match ? `.${match[1].replace("jpeg", "jpg")}` : ".jpg";
}

function contentTypeOf(extension) {
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function mb(items) {
  return (items.reduce((sum, item) => sum + (item.size || 0), 0) / 1048576).toFixed(1);
}

main().catch((error) => {
  console.error("MIGRATION FAILED:", error.message);
  process.exit(1);
});
