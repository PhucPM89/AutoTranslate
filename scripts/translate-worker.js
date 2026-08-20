"use strict";

// Translation worker.
//
// Deliberately separate from the crawler. The crawler runs every 15 minutes and
// must finish in minutes: it detects chapters, publishes their source text and
// enqueues them. This worker is the slow half — it drains those queues against
// Gemini on its own schedule, checkpointing after every chapter so a run that
// hits the Gemini quota or the GitHub Actions time limit simply stops and the
// next run resumes.
//
//   node scripts/translate-worker.js [--budget 200] [--minutes 300] [--book id]

const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { chapterKey, originalKey, buildChapterDocument } = require("../server/ingest/documents");
const { publishIndex } = require("../server/ingest/ingest-book");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");
const {
  jobStateKey,
  runTranslationJobs,
  summarize,
  isDone
} = require("../server/ingest/translation-queue");
const { translateText } = require("../server/gemini");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const REQUEST_BUDGET = Number(flag("--budget", process.env.TRANSLATE_BUDGET || 0)) || Infinity;
const RUN_MINUTES = Number(flag("--minutes", process.env.TRANSLATE_RUN_MINUTES || 300));
const ONLY_BOOK = flag("--book", "");
// Measured on 19 real chapters: 17.8s average latency per chapter at 1.11 Gemini
// requests each, i.e. about 3.7 requests per minute with zero quota errors. The
// latency alone paces the worker well under any free-tier RPM, so the extra delay
// is small on purpose - a 4s gap was adding ~22% wall clock for no benefit.
// Raise it if 429s appear; do not lower it to zero.
const SPACING_MS = Number(process.env.TRANSLATE_SPACING_MS || 1000);
const RESERVE_MS = 3 * 60 * 1000;
// How often to republish index.json and resync Supabase mid-run. At the measured
// 3.37 chapters/minute this is roughly every seven minutes: frequent enough that
// readers see progress, rare enough that the 1,425-row upsert is noise.
const PUBLISH_EVERY = Math.max(1, Number(process.env.TRANSLATE_PUBLISH_EVERY || 25));

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Thiếu GEMINI_API_KEY.");

  const storage = createStorage();
  const db = createSupabase();
  const deadlineAt = Date.now() + Math.max(0, RUN_MINUTES * 60 * 1000 - RESERVE_MS);

  const jobs = await listJobs(storage, ONLY_BOOK);
  if (!jobs.length) {
    console.log("Không có job dịch nào đang chờ.");
    return;
  }

  // Books with newly discovered chapters go first, then the ones with the most
  // outstanding work, so an ongoing novel stays current.
  jobs.sort((a, b) => b.highPriority - a.highPriority || b.pending - a.pending);
  console.log(`Có ${jobs.length} book trong hàng đợi:`);
  for (const job of jobs) {
    console.log(`  ${job.bookId} r${job.revision}: ${job.pending} chờ (${job.highPriority} ưu tiên cao) / ${job.total}`);
  }

  let spentTotal = 0;
  let translatedTotal = 0;
  let stoppedForQuota = false;

  for (const job of jobs) {
    if (spentTotal >= REQUEST_BUDGET || Date.now() >= deadlineAt) break;

    const state = job.state;
    if (isDone(state)) continue;
    console.log(`\n=== ${job.bookId} r${job.revision} ===`);
    let sinceLastPublish = 0;
    // chapters.book_id references books.id, and refreshBookOutputs upserts
    // chapters before the book row. Ingest normally creates the book first, but
    // if it did not, every chapter sync would fail on the foreign key.
    await ensureBookRow({ storage, db, job });

    const result = await runTranslationJobs({
      state,
      requestBudget: REQUEST_BUDGET === Infinity ? Infinity : REQUEST_BUDGET - spentTotal,
      deadlineAt,
      spacingMs: SPACING_MS,
      loadChapter: (n) => readJson(storage, originalKey(job.bookId, job.revision, n)),
      translateChapter: async (chapter) => {
        // Never spend a Gemini call on work that is already durable. This is the
        // guard that makes a worker restart free rather than expensive.
        const existing = await readJson(storage, chapterKey(job.bookId, job.revision, chapter.chapterNumber));
        if (existing && existing.translationStatus === "completed" && existing.content) {
          console.log(`  ch ${chapter.chapterNumber}: đã có bản dịch trên R2, bỏ qua Gemini`);
          return existing.content;
        }
        const output = await translateText(chapter.content, apiKey);
        if (!output || !output.translation) throw new Error("Gemini không trả bản dịch.");
        return output.translation;
      },
      publishChapter: async (chapter, translation) => {
        await storage.put(
          chapterKey(job.bookId, job.revision, chapter.chapterNumber),
          JSON.stringify(
            buildChapterDocument({
              bookId: job.bookId,
              revision: job.revision,
              chapter,
              translation,
              translationStatus: "completed"
            })
          )
        );
      },
      saveState: (next) => storage.put(jobStateKey(job.bookId), JSON.stringify(next)),
      // Chapter rows are synced in bulk rather than one request per chapter:
      // fewer round trips, and R2 stays the source of truth either way. But the
      // sync cannot wait for the end of the run - a run may translate for five
      // hours, and one killed at the Actions timeout would publish nothing at
      // all, leaving readers looking at a count from hours ago.
      onProgress: async ({ chapter, status, completed, total }) => {
        console.log(`  ch ${chapter}: ${status}  (${completed}/${total})`);
        if (status !== "completed") return;
        sinceLastPublish += 1;
        if (sinceLastPublish < PUBLISH_EVERY) return;
        sinceLastPublish = 0;
        // Never let a publishing hiccup end a run that is otherwise translating.
        await refreshBookOutputs({ storage, db, job, state }).catch((error) =>
          console.warn(`  (không publish được tiến độ: ${error.message})`)
        );
        console.log(`  -> đã publish tiến độ: ${completed}/${total}`);
      }
    });

    spentTotal += result.spent;
    translatedTotal += result.translated;
    console.log(`  -> dịch ${result.translated}, lỗi ${result.failed}, còn ${result.summary.pending} chờ`);

    // Republish the index so the reader sees the new statuses, and refresh book
    // totals in Supabase.
    await refreshBookOutputs({ storage, db, job, state });

    if (result.quotaExhausted) {
      stoppedForQuota = true;
      console.log("  -> hết quota Gemini, dừng để lượt sau tiếp tục");
      break;
    }
  }

  if (translatedTotal > 0) {
    await publishCatalogSnapshot({ storage, site: siteSettings(), log: (event) => console.log("  ", JSON.stringify(event)) });
  }

  // "Dừng vì quota" on its own leaves you guessing whether the worker is broken
  // or the day's allowance is simply spent. The free tier is a per-model daily
  // allowance, so it is a wall that running more often cannot push through.
  const reason = stoppedForQuota
    ? " Dừng vì hết quota Gemini trong ngày; quota free tier tính theo ngày cho từng model, nên lượt sau chỉ tiếp tục được sau khi reset."
    : Date.now() >= deadlineAt
      ? " Dừng vì hết thời gian chạy."
      : " Hết việc trong hàng đợi.";
  console.log(`\nXong: dịch ${translatedTotal} chương, dùng ${spentTotal} lượt gọi.${reason}`);
}

async function listJobs(storage, onlyBook) {
  const objects = await storage.list("jobs/");
  const jobs = [];
  for (const object of objects) {
    if (!object.key.endsWith("/translation.json")) continue;
    const state = await readJson(storage, object.key);
    if (!state || !Array.isArray(state.chapters)) continue;
    if (onlyBook && state.bookId !== onlyBook) continue;
    const counts = summarize(state);
    if (counts.completed === counts.total) continue;
    jobs.push({
      bookId: state.bookId,
      revision: state.revision,
      state,
      total: counts.total,
      pending: counts.total - counts.completed,
      highPriority: counts.highPriority || 0
    });
  }
  return jobs;
}

async function ensureBookRow({ storage, db, job }) {
  if (!db) return;
  const index = await readJson(storage, `books/${job.bookId}/index.json`);
  if (!index) return;
  // Only creates a missing row. Overwriting an existing one would reset the
  // provenance the crawler depends on, since index.json carries no source or
  // source_id.
  const exists = await db.bookExists(job.bookId).catch(() => true);
  if (exists) return;
  await db
    .upsertBook({
      id: job.bookId,
      title: index.title,
      author: index.author,
      description: index.description,
      cover: index.cover,
      status: index.status,
      totalChapters: index.totalChapters || 0,
      translatedChapters: index.translatedChapters || 0,
      revision: job.revision,
      // Carried from the index so a row created here is not born as an admin
      // upload. The crawler recognises its books by these two fields.
      source: index.source || "admin",
      sourceId: index.sourceId || null,
      sourceUrl: index.sourceUrl || null
    })
    .catch((error) => console.warn(`  (Supabase book insert lỗi: ${error.message})`));
}

async function refreshBookOutputs({ storage, db, job, state }) {
  const index = await readJson(storage, `books/${job.bookId}/index.json`);
  if (!index) return;
  const statusByNumber = new Map(state.chapters.map((entry) => [entry.n, entry.status]));
  const chapters = index.chapters.map((entry) => ({
    chapterNumber: entry.n,
    title: entry.title,
    translationStatus: statusByNumber.get(entry.n) || entry.status
  }));
  await publishIndex({
    storage,
    book: {
      id: job.bookId,
      title: index.title,
      author: index.author,
      genre: index.genre,
      status: index.status,
      description: index.description,
      cover: index.cover
    },
    revision: job.revision,
    chapters,
    state
  });

  if (db) {
    await db
      .upsertChapters(job.bookId, job.revision, chapters)
      .catch((error) => console.warn(`  (Supabase chapters sync lỗi: ${error.message})`));
    const completed = chapters.filter((chapter) => chapter.translationStatus === "completed").length;
    // Counts only: title, cover and provenance belong to whoever ingested the book.
    await db
      .updateBookProgress(job.bookId, {
        totalChapters: chapters.length,
        translatedChapters: completed,
        revision: job.revision
      })
      .catch((error) => console.warn(`  (Supabase book update lỗi: ${error.message})`));
  }
}

function siteSettings() {
  return {
    name: "Trạm Chữ",
    tagline: "Một góc đọc truyện Trung được tuyển chọn và dịch.",
    contactEmail: process.env.SITE_CONTACT_EMAIL || ""
  };
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

module.exports = { listJobs, refreshBookOutputs, ensureBookRow };

if (require.main === module) {
  main().catch((error) => {
    console.error("TRANSLATE WORKER FAILED:", error.message);
    process.exit(1);
  });
}
