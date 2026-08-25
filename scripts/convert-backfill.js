"use strict";

// Backfill the offline convert tier onto chapters that were published BEFORE
// convert existed (or before it was wired in). Ingest only converts new
// chapters and skips ones already on storage, so a book crawled earlier sits as
// raw Chinese. This republishes those chapters as readable Hán-Việt convert.
//
//   node scripts/convert-backfill.js --all                 # preview every book
//   node scripts/convert-backfill.js --book fanqie-123      # preview one book
//   node scripts/convert-backfill.js --all --commit         # actually write
//
// Safety:
//   * Never touches chapters already marked "completed" (LLM work is kept).
//   * Leaves the translation queue untouched, so the LLM tier still upgrades
//     these chapters later — convert is only the readable floor.
//   * --dry-run by default; pass --commit to write to storage.
//   * A chapter with no source document is skipped, never blanked.

const fs = require("fs");
const path = require("path");

// Load .env / .env.local so createStorage() picks up R2 like the daemon does.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      let val = match[2].trim();
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      process.env[match[1]] = val;
    }
  }
}
loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { createStorage } = require("../server/storage");
const { buildChapterDocument, chapterKey, originalKey } = require("../server/ingest/documents");
const { jobStateKey } = require("../server/ingest/translation-queue");
const { getConvertFunction, CONVERT_VERSION } = require("../server/convert");

function flag(name) {
  return process.argv.includes(name);
}
function flagValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

async function readJson(storage, key) {
  const buffer = await storage.get(key);
  if (!buffer) return null;
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    return null;
  }
}

// Bounded parallelism so a 3,000-chapter book does not open 3,000 writes at once.
async function pool(items, worker, concurrency = 12) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
      while (i < items.length) {
        const current = i++;
        await worker(items[current]);
      }
    })
  );
}

async function listBookIds(storage, only) {
  if (only) return [only];
  const objects = await storage.list("jobs/");
  return objects
    .filter((o) => o.key.endsWith("/translation.json"))
    .map((o) => o.key.slice("jobs/".length, -"/translation.json".length));
}

async function backfillBook(storage, convert, bookId, { commit, force }) {
  const state = await readJson(storage, jobStateKey(bookId));
  if (!state || !Array.isArray(state.chapters)) {
    return { bookId, skipped: "no job state", converted: 0, pending: 0 };
  }
  const revision = state.revision || 1;
  // Only chapters not yet completed by the LLM are candidates.
  const candidates = state.chapters.filter((c) => c.status !== "completed");

  // Preview is cheap: one job-state read per book, no per-chapter GETs. Only a
  // real --commit run touches chapter objects (and R2 request cost).
  if (!commit) {
    return { bookId, revision, converted: 0, candidates: candidates.length, missing: 0, preview: true };
  }

  let converted = 0;
  let missing = 0;
  await pool(candidates, async (entry) => {
    const n = entry.n;
    const published = await readJson(storage, chapterKey(bookId, revision, n));
    // Completed LLM chapters are never touched. A chapter already converted at
    // the current engine version is skipped — so a re-pass after the rules
    // improve resumes across runs instead of restarting from the top, and only
    // stale convert (older or unstamped version) is re-rendered. --force
    // re-renders every convert chapter regardless of version.
    if (published) {
      if (published.translationStatus === "completed") return;
      if (published.translationStatus === "convert" && !force && (published.convertVersion || 0) >= CONVERT_VERSION) return;
    }
    const source = await readJson(storage, originalKey(bookId, revision, n));
    if (!source || !source.content) {
      missing += 1;
      return;
    }
    let text;
    try {
      text = convert(source.content);
    } catch {
      return;
    }
    if (!text) return;
    if (commit) {
      await storage.put(
        chapterKey(bookId, revision, n),
        JSON.stringify(
          buildChapterDocument({
            bookId,
            revision,
            chapter: source,
            translation: text,
            translationStatus: "convert",
            convertVersion: CONVERT_VERSION
          })
        )
      );
    }
    converted += 1;
  });

  return { bookId, revision, converted, missing, candidates: candidates.length };
}

async function main() {
  const only = flagValue("--book");
  const all = flag("--all");
  const commit = flag("--commit");
  const force = flag("--force");
  if (!only && !all) {
    console.error("Dùng: --all  hoặc  --book <id>   (thêm --commit để ghi thật; mặc định chỉ xem trước)");
    process.exit(1);
  }

  const convert = getConvertFunction();
  if (!convert) {
    console.error("Không có từ điển convert (data/convert). Không thể backfill.");
    process.exit(1);
  }

  const storage = createStorage();
  const bookIds = await listBookIds(storage, only);
  console.log(`${commit ? "GHI THẬT" : "XEM TRƯỚC"} — ${bookIds.length} bộ truyện\n`);

  let totalConverted = 0;
  for (const bookId of bookIds) {
    const r = await backfillBook(storage, convert, bookId, { commit, force });
    totalConverted += r.converted || 0;
    if (r.skipped) {
      console.log(`  ${bookId}: bỏ qua (${r.skipped})`);
    } else if (r.preview) {
      totalConverted += r.candidates;
      console.log(`  ${bookId}: ${r.candidates} chương chưa dịch sẽ được convert`);
    } else {
      console.log(`  ${bookId}: ${r.converted} chương convert / ${r.candidates} chưa dịch${r.missing ? ` (${r.missing} thiếu bản gốc)` : ""}`);
    }
  }
  console.log(`\nTổng: ${totalConverted} chương ${commit ? "đã convert" : "sẽ convert"}.`);
  if (!commit) console.log("Chạy lại với --commit để ghi lên storage.");
}

main().catch((err) => {
  console.error("Lỗi backfill:", err.message);
  process.exit(1);
});
