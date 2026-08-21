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
const { translateText, translateBatchChapters } = require("../server/gemini");
const { createTranslationEngine } = require("../server/translation-engine");

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
// Chapters each book gets per turn before the worker moves on. One keeps the
// rotation tightest, and since the Gemini call dominates the cost, slicing finely
// is close to free.
const CHAPTERS_PER_TURN = Math.max(1, Number(process.env.TRANSLATE_CHAPTERS_PER_TURN || 1));
const ROTATION_KEY = "jobs/translate-rotation.json";
const TRANSLATE_STATUS_KEY = "jobs/translate-status.json";

async function writeTranslateStatus(storage, status) {
  try {
    await storage.put(TRANSLATE_STATUS_KEY, JSON.stringify({
      updatedAt: new Date().toISOString(),
      ...status
    }));
  } catch (err) {
    console.warn("Unable to write translate status:", err.message);
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Thiếu GEMINI_API_KEY.");

  const storage = createStorage();
  const db = createSupabase();
  const engine = createTranslationEngine({ storage });
  const deadlineAt = Date.now() + Math.max(0, RUN_MINUTES * 60 * 1000 - RESERVE_MS);

  const jobs = await listJobs(storage, ONLY_BOOK);
  if (!jobs.length) {
    console.log("Không có job dịch nào đang chờ.");
    await writeTranslateStatus(storage, {
      state: "idle",
      finishedAt: new Date().toISOString(),
      message: "Tất cả các bộ truyện đã được dịch đầy đủ. Không có job chờ."
    });
    return;
  }

  // Round-robin, a slice at a time, so every book moves every day.
  //
  // Draining one queue at a time is wrong for a reader whichever end you start.
  // Longest-first spreads the daily allowance over everything and finishes
  // nothing; shortest-first finishes books but leaves someone reading book nine
  // waiting weeks to see a single translated chapter. Taking a small slice from
  // each book in turn means every title gains ground daily, which is what stops
  // anyone waiting indefinitely on the one book they happen to be reading.
  //
  // Ordered by id rather than size so the cycle is stable between runs, and
  // rotated to resume after whichever book was served last - otherwise a day that
  // runs out of quota part-way keeps favouring the same few books tomorrow.
  // Ordered by id rather than size so the cycle is stable between runs, and
  // rotated to resume after whichever book was served last - otherwise a day that
  // runs out of quota part-way keeps favouring the same few books tomorrow.
  const ordered = [...jobs].sort((a, b) => a.bookId.localeCompare(b.bookId));
  const rotation = (await readJson(storage, ROTATION_KEY)) || {};
  const resumeAfter = ordered.findIndex((job) => job.bookId === rotation.lastBookId);
  const queue =
    resumeAfter >= 0 ? [...ordered.slice(resumeAfter + 1), ...ordered.slice(0, resumeAfter + 1)] : ordered;

  // Active readers & top read books from Supabase analytics
  const activeReadBooks = await (db?.readTopBooks?.({ limit: 20 }).catch(() => [])) || [];
  const activeBookIds = new Set(activeReadBooks.map((b) => b.bookId));

  // Sort queue:
  // 1. VIP Active Books (currently being read by real readers)
  // 2. High priority newly discovered chapters
  // 3. Stable rotation order
  queue.sort((a, b) => {
    const aIsActive = activeBookIds.has(a.bookId);
    const bIsActive = activeBookIds.has(b.bookId);
    if (aIsActive !== bIsActive) return bIsActive ? 1 : -1;
    if (b.highPriority !== a.highPriority) return b.highPriority - a.highPriority;
    return a.bookId.localeCompare(b.bookId);
  });

  console.log(`Có ${jobs.length} book trong hàng đợi, ${activeBookIds.size} book VIP có độc giả đọc:`);
  for (const job of queue) {
    const vipTag = activeBookIds.has(job.bookId) ? " [VIP ĐỘC GIẢ]" : "";
    console.log(`  ${job.bookId} r${job.revision}: ${job.pending} chờ (${job.highPriority} ưu tiên)${vipTag} / ${job.total}`);
  }
  if (rotation.lastBookId) console.log(`  (lượt trước dừng ở ${rotation.lastBookId}; vòng này bắt đầu sau đó)`);

  let spentTotal = 0;
  let translatedTotal = 0;
  let stoppedForQuota = false;
  let stop = false;
  let cycle = 0;

  // Publishing is throttled per book, not globally: with one chapter per turn a
  // publish at the end of every slice would rewrite a 95 KB index per chapter.
  const sincePublish = new Map();
  const touched = new Map();
  const rowChecked = new Set();

  const publishBook = (job) =>
    refreshBookOutputs({ storage, db, job, state: job.state }).catch((error) =>
      console.warn(`  (không publish được tiến độ ${job.bookId}: ${error.message})`)
    );

  while (!stop) {
    cycle += 1;
    let translatedThisCycle = 0;

    for (const job of queue) {
      if (spentTotal >= REQUEST_BUDGET || Date.now() >= deadlineAt) {
        stop = true;
        break;
      }
      if (isDone(job.state)) continue;

      if (!rowChecked.has(job.bookId)) {
        // chapters.book_id references books.id. Ingest normally creates the row
        // first, but if it did not every chapter sync fails on the foreign key.
        await ensureBookRow({ storage, db, job });
        rowChecked.add(job.bookId);
      }

      const isVip = activeBookIds.has(job.bookId);
      const sliceSize = isVip
        ? Math.max(10, Number(process.env.TRANSLATE_CHAPTERS_PER_TURN_VIP || 10))
        : CHAPTERS_PER_TURN;

      const remainingBudget = REQUEST_BUDGET === Infinity ? Infinity : REQUEST_BUDGET - spentTotal;
      const result = await runTranslationJobs({
        state: job.state,
        requestBudget: Math.min(remainingBudget, sliceSize),
        deadlineAt,
        spacingMs: SPACING_MS,
        batchSize: 2,
        loadChapter: (n) => readJson(storage, originalKey(job.bookId, job.revision, n)),
        translateChapter: async (chapter) => {
          const existing = await readJson(storage, chapterKey(job.bookId, job.revision, chapter.chapterNumber));
          if (existing && existing.translationStatus === "completed" && existing.content) {
            console.log(`  ch ${chapter.chapterNumber}: đã có bản dịch trên R2, bỏ qua Gemini`);
            return existing.content;
          }
          const glossary = await engine.loadGlossary(job.bookId);
          const output = await translateText(chapter.content, apiKey, {
            bookId: job.bookId,
            glossary,
            engine
          });
          if (!output || !output.translation) throw new Error("Gemini không trả bản dịch.");
          return output.translation;
        },
        translateBatch: async (chapters) => {
          const glossary = await engine.loadGlossary(job.bookId);
          return translateBatchChapters(chapters, apiKey, {
            bookId: job.bookId,
            glossary,
            engine
          });
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
        onProgress: async ({ chapter, status, completed, total }) => {
          console.log(`  [${job.bookId}] ch ${chapter}: ${status}  (${completed}/${total})`);
          await writeTranslateStatus(storage, {
            state: "running",
            currentBookId: job.bookId,
            currentChapter: chapter,
            currentCompleted: completed,
            currentTotalChapters: total,
            translatedThisRun: translatedTotal,
            spentRequests: spentTotal,
            message: `Đang dịch [${job.bookId}] — Chương ${chapter} (${completed}/${total})`,
            queue: queue.map((j) => ({
              bookId: j.bookId,
              revision: j.revision,
              pending: j.pending,
              highPriority: j.highPriority || activeBookIds.has(j.bookId),
              total: j.total,
              translated: (j.total || 0) - (j.pending || 0)
            }))
          });
        }
      });

      spentTotal += result.spent;
      translatedTotal += result.translated;
      translatedThisCycle += result.translated;

      if (result.translated) {
        touched.set(job.bookId, job);
        const waiting = (sincePublish.get(job.bookId) || 0) + result.translated;
        if (waiting >= PUBLISH_EVERY) {
          sincePublish.set(job.bookId, 0);
          await publishBook(job);
          console.log(`  [${job.bookId}] -> đã publish tiến độ`);
        } else {
          sincePublish.set(job.bookId, waiting);
        }
      }

      // Written after every slice, so an interrupted run still tells the next one
      // where the cycle had reached.
      rotation.lastBookId = job.bookId;
      await storage.put(ROTATION_KEY, JSON.stringify(rotation)).catch(() => {});

      if (result.quotaExhausted) {
        stoppedForQuota = true;
        stop = true;
        console.log("  -> hết quota Gemini, dừng để lượt sau tiếp tục từ đây");
        break;
      }
    }

    // A full pass that translated nothing means every queue is finished or
    // waiting on a backoff, so spinning gains nothing.
    if (!translatedThisCycle) break;
  }

  // Anything with unpublished progress is written once at the end, so counts are
  // current even for books whose slice never reached the publish threshold.
  for (const [bookId, job] of touched) {
    if (!sincePublish.get(bookId)) continue;
    await publishBook(job);
  }

  await writeTranslateStatus(storage, {
    state: stoppedForQuota ? "paused_quota" : "idle",
    finishedAt: new Date().toISOString(),
    currentBookId: "",
    translatedThisRun: translatedTotal,
    spentRequests: spentTotal,
    message: stoppedForQuota
      ? `Tạm dừng: Hết quota Gemini. Đã dịch ${translatedTotal} chương trong phiên.`
      : `Phiên dịch hoàn tất: Đã dịch ${translatedTotal} chương mới trên ${touched.size} bộ truyện.`,
    queue: queue.map((j) => ({
      bookId: j.bookId,
      revision: j.revision,
      pending: j.pending,
      highPriority: j.highPriority,
      total: j.total,
      translated: (j.total || 0) - (j.pending || 0)
    }))
  });

  console.log(`\nĐã chạy ${cycle} vòng, ${touched.size} truyện có bản dịch mới.`);

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
