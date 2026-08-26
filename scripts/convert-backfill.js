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
const { publishIndex } = require("../server/ingest/ingest-book");
const { jobStateKey } = require("../server/ingest/translation-queue");
const { buildConvertEngineFromDisk, mineBookNames, isCultivationGenre, CONVERT_VERSION } = require("../server/convert");

// How many of a book's chapters to read for name mining. The cast shows up early
// and often, so a sample is enough and keeps the extra R2 reads bounded.
const NAME_SAMPLE = Number(process.env.CONVERT_NAME_SAMPLE || 40);
const FAST_INDEX_SAMPLE = Number(process.env.CONVERT_FAST_INDEX_SAMPLE || 12);

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

async function backfillBook(storage, bookId, { commit, force }) {
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

  const index = await readJson(storage, `books/${bookId}/index.json`);
  if (index && !force && candidates.length) {
    const sampleEntries = evenSample(candidates, FAST_INDEX_SAMPLE);
    const sampleStatuses = await Promise.all(
      sampleEntries.map(async (entry) => {
        const published = await readJson(storage, chapterKey(bookId, revision, entry.n));
        return published?.translationStatus || "";
      })
    );
    if (sampleStatuses.length && sampleStatuses.every((status) => status === "convert")) {
      await publishConvertIndex({ storage, bookId, revision, index, state });
      return { bookId, revision, converted: 0, missing: 0, candidates: candidates.length, nameCount: 0, indexSynced: true };
    }
  }

  // Mine this book's character names from a sample, then convert every chapter
  // with them merged in, so a character reads identically across the whole book
  // (Consistency Engine). The sample is spread EVENLY across the novel, not taken
  // from the front — a lead introduced at chapter 400 is invisible to the first
  // forty (付宇茜: 0 hits in ch1-40, 323 in ch1-200).
  const step = Math.max(1, Math.floor(candidates.length / NAME_SAMPLE));
  const sampleEntries = candidates.filter((_, idx) => idx % step === 0).slice(0, NAME_SAMPLE);
  const sample = [];
  for (const entry of sampleEntries) {
    const src = await readJson(storage, originalKey(bookId, revision, entry.n));
    if (src && src.content) sample.push(src.content);
  }
  const nameGlossary = sample.length ? mineBookNames(sample) : {};
  // Genre decides everyday-noun realization: a modern book reads 门 as "cửa", a
  // cultivation one keeps "môn". The genre lives on the published book index.
  const modern = !isCultivationGenre(index && index.genre);
  const engine = buildConvertEngineFromDisk(process.env, { nameGlossary, modern });
  const nameCount = Object.keys(nameGlossary).length;
  const indexStatusByNumber = new Map();
  for (const chapter of index?.chapters || []) {
    const n = Number(chapter.n || chapter.chapterNumber || 0);
    if (n) indexStatusByNumber.set(n, chapter.status || chapter.translationStatus || "pending");
  }

  let converted = 0;
  let missing = 0;
  let indexNeedsPublish = false;
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
      if (published.translationStatus === "convert" || published.translationStatus === "failed") {
        indexStatusByNumber.set(n, published.translationStatus);
        indexNeedsPublish = true;
      }
      if (published.translationStatus === "convert" && !force && (published.convertVersion || 0) >= CONVERT_VERSION) return;
    }
    const source = await readJson(storage, originalKey(bookId, revision, n));
    if (!source || !source.content) {
      missing += 1;
      return;
    }
    let text;
    try {
      text = engine.convert(source.content);
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
    indexStatusByNumber.set(n, "convert");
    indexNeedsPublish = true;
  });

  if (commit && index && indexNeedsPublish) {
    await publishConvertIndex({ storage, bookId, revision, index, state, statusByNumber: indexStatusByNumber });
  }

  return { bookId, revision, converted, missing, candidates: candidates.length, nameCount };
}

function evenSample(items, limit) {
  const count = Math.max(1, Math.min(Number(limit) || 1, items.length));
  if (items.length <= count) return items;
  const sample = [];
  for (let i = 0; i < count; i += 1) {
    sample.push(items[Math.floor((i * (items.length - 1)) / (count - 1))]);
  }
  return sample;
}

async function publishConvertIndex({ storage, bookId, revision, index, state, statusByNumber = null }) {
  const chapters = [];
  const stateByNumber = new Map((state.chapters || []).map((entry) => [entry.n, entry.status]));
  for (const chapter of index.chapters || []) {
    const n = Number(chapter.n || chapter.chapterNumber || 0);
    if (!n) continue;
    const queueStatus = stateByNumber.get(n);
    const status =
      queueStatus === "completed" || queueStatus === "failed"
        ? queueStatus
        : statusByNumber?.get(n) || "convert";
    chapters.push({
      chapterNumber: n,
      title: chapter.title || `Chương ${n}`,
      translationStatus: status
    });
  }
  await publishIndex({
    storage,
    book: {
      id: bookId,
      title: index.title,
      author: index.author,
      genre: index.genre,
      status: index.status,
      description: index.description,
      cover: index.cover,
      source: index.source,
      sourceId: index.sourceId,
      sourceUrl: index.sourceUrl
    },
    revision,
    chapters,
    state
  });
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

  const convert = buildConvertEngineFromDisk();
  if (!convert) {
    console.error("Không có từ điển convert (data/convert). Không thể backfill.");
    process.exit(1);
  }

  const storage = createStorage();
  const bookIds = await listBookIds(storage, only);
  console.log(`${commit ? "GHI THẬT" : "XEM TRƯỚC"} — ${bookIds.length} bộ truyện\n`);

  let totalConverted = 0;
  for (const bookId of bookIds) {
    const r = await backfillBook(storage, bookId, { commit, force });
    totalConverted += r.converted || 0;
    if (r.skipped) {
      console.log(`  ${bookId}: bỏ qua (${r.skipped})`);
    } else if (r.preview) {
      totalConverted += r.candidates;
      console.log(`  ${bookId}: ${r.candidates} chương chưa dịch sẽ được convert`);
    } else {
      const syncNote = r.indexSynced ? " · đã đồng bộ index nhanh" : "";
      console.log(`  ${bookId}: ${r.converted} chương convert / ${r.candidates} chưa dịch · ${r.nameCount||0} tên nhân vật${syncNote}${r.missing ? ` (${r.missing} thiếu gốc)` : ""}`);
    }
  }
  console.log(`\nTổng: ${totalConverted} chương ${commit ? "đã convert" : "sẽ convert"}.`);
  if (!commit) console.log("Chạy lại với --commit để ghi lên storage.");
}

main().catch((err) => {
  console.error("Lỗi backfill:", err.message);
  process.exit(1);
});
