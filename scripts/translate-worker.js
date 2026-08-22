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

const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        let val = match[2].trim();
        if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
        process.env[match[1]] = val;
      }
    }
  }
}

loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.local"));

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
const { translateText, translateBatchChapters, parseApiKeys, getKeyPoolStats } = require("../server/gemini");
const { createTranslationEngine } = require("../server/translation-engine");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const REQUEST_BUDGET = Number(flag("--budget", process.env.TRANSLATE_BUDGET || 0)) || Infinity;
const RUN_MINUTES = Number(flag("--minutes", process.env.TRANSLATE_RUN_MINUTES || 300));
const ONLY_BOOK = flag("--book", "");
const SHARD_INDEX = Number(flag("--shard-index", process.env.TRANSLATE_SHARD_INDEX || 0));
const TOTAL_SHARDS = Math.max(1, Number(flag("--total-shards", process.env.TRANSLATE_TOTAL_SHARDS || 1)));
const BATCH_SIZE = Math.max(1, Number(flag("--batch-size", process.env.TRANSLATE_BATCH_SIZE || process.env.TRANSLATE_CONCURRENCY || 3)));
const CONTINUOUS_MODE = !args.includes("--once") && (args.includes("--continuous") || args.includes("--loop") || process.env.TRANSLATE_CONTINUOUS !== "false");
const RESERVE_MS = 3 * 60 * 1000;
const PUBLISH_EVERY = Math.max(1, Number(process.env.TRANSLATE_PUBLISH_EVERY || 20));
const CHAPTERS_PER_TURN = Math.max(1, Number(process.env.TRANSLATE_CHAPTERS_PER_TURN || 5));
const ROTATION_KEY = "jobs/translate-rotation.json";
const TRANSLATE_STATUS_KEY = "jobs/translate-status.json";

let lastChapterTokens = 2200;

function computeAdaptiveSpacing(keyList) {
  if (process.env.TRANSLATE_SPACING_MS) {
    return Math.max(0, Number(process.env.TRANSLATE_SPACING_MS));
  }
  const stats = getKeyPoolStats(keyList);
  const readyKeys = stats.filter((s) => s.ready).length;
  
  if (readyKeys >= 8) {
    // 8-17 keys: Parallel Waves Mode (~300ms pacing between waves)
    return 300;
  } else if (readyKeys >= 5) {
    return 600;
  } else if (readyKeys >= 3) {
    return 1200;
  } else if (readyKeys >= 1) {
    return 2500;
  }
  return 5000;
}

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
  const storage = createStorage();

  // Load dynamically configured keys from R2 Storage if present
  let keyList = [];
  try {
    const rawKeys = await storage.get("config/api-keys.json");
    if (rawKeys) {
      const parsed = JSON.parse(rawKeys.toString("utf8"));
      if (Array.isArray(parsed) && parsed.length > 0) {
        keyList = parsed;
      }
    }
  } catch {}

  const envKeys = [
    process.env.GROQ_API_KEYS,
    process.env.GROQ_API_KEY,
    process.env.OPENROUTER_API_KEYS,
    process.env.OPENROUTER_API_KEY
  ].filter(Boolean).flatMap(k => parseApiKeys(k));

  const allUniqueKeys = Array.from(new Set([...keyList, ...envKeys])).filter(Boolean);
  if (!allUniqueKeys.length) throw new Error("Thiếu GROQ_API_KEY / OPENROUTER_API_KEY.");
  const apiKey = allUniqueKeys.join(",");
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

  // Sort queue: Sequential Book Completion Mode
  // 1. VIP Active Books (currently being read by real readers)
  // 2. In-progress books with highest completion (finish almost-done books first so readers get 100% full translations!)
  // 3. Smaller pending books, then stable ID
  queue.sort((a, b) => {
    const aIsActive = activeBookIds.has(a.bookId);
    const bIsActive = activeBookIds.has(b.bookId);
    if (aIsActive !== bIsActive) return bIsActive ? 1 : -1;

    const aDone = (a.total || 0) - (a.pending || 0);
    const bDone = (b.total || 0) - (b.pending || 0);
    if (aDone > 0 || bDone > 0) {
      // Prioritize novel with highest completion count to finish 100% fastest
      const aPct = (a.total || 0) ? (aDone / a.total) : 0;
      const bPct = (b.total || 0) ? (bDone / b.total) : 0;
      if (Math.abs(bPct - aPct) > 0.05) return bPct - aPct;
      return bDone - aDone;
    }

    if (b.highPriority !== a.highPriority) return b.highPriority - a.highPriority;
    return a.bookId.localeCompare(b.bookId);
  });

  let activeQueue = queue;
  if (TOTAL_SHARDS > 1) {
    const normalizedShard = (SHARD_INDEX >= 1 && SHARD_INDEX <= TOTAL_SHARDS) ? (SHARD_INDEX - 1) : Math.max(0, SHARD_INDEX);
    activeQueue = queue.filter((job, idx) => (idx % TOTAL_SHARDS) === normalizedShard);
    console.log(`\n=== [SHARD ${normalizedShard + 1}/${TOTAL_SHARDS}] Được phân bổ ${activeQueue.length}/${queue.length} bộ truyện ===`);
  }

  console.log(`\n=== CHẾ ĐỘ DỊCH DỨT ĐIỂM TỪNG BỘ TRUYỆN 100% ===`);
  console.log(`Có ${activeQueue.length} book trong hàng đợi worker (Batch size: ${BATCH_SIZE}, ${activeBookIds.size} book VIP toàn hệ thống):`);
  for (const job of activeQueue.slice(0, 10)) {
    const vipTag = activeBookIds.has(job.bookId) ? " [VIP ĐỘC GIẢ]" : "";
    const done = (job.total || 0) - (job.pending || 0);
    const pct = job.total ? Math.round((done / job.total) * 100) : 0;
    console.log(`  ${job.bookId} r${job.revision}: Đã dịch ${done}/${job.total} (${pct}%)${vipTag} — Còn ${job.pending} chương`);
  }
  if (activeQueue.length > 10) console.log(`  ... và ${activeQueue.length - 10} bộ truyện khác đang xếp hàng.`);

  const existingStatus = (await readJson(storage, TRANSLATE_STATUS_KEY)) || {};
  const startedAt = existingStatus.state === "running" && existingStatus.startedAt ? existingStatus.startedAt : new Date().toISOString();
  let recentActivity = Array.isArray(existingStatus.recentActivity) ? existingStatus.recentActivity : [];
  const catalog = (await readJson(storage, "catalog/latest.json")) || {};
  const titleMap = new Map((catalog.books || []).map((b) => [b.id, b.title]));

  let spentTotal = 0;
  let translatedTotal = 0;
  let stoppedForQuota = false;
  let stop = false;
  let cycle = 0;

  // Publishing is throttled per book: every 5 chapters published immediately
  const PUBLISH_EVERY_CHAPTERS = 5;
  const sincePublish = new Map();
  const touched = new Map();
  const rowChecked = new Set();

  const publishBook = (job) =>
    refreshBookOutputs({ storage, db, job, state: job.state }).catch((error) =>
      console.warn(`  (không publish được tiến độ ${job.bookId}: ${error.message})`)
    );

  const parsedKeys = parseApiKeys(apiKey);

  while (!stop) {
    cycle += 1;
    let translatedThisCycle = 0;

    for (const job of activeQueue) {
      if (spentTotal >= REQUEST_BUDGET || Date.now() >= deadlineAt) {
        stop = true;
        break;
      }
      if (isDone(job.state)) continue;

      if (!rowChecked.has(job.bookId)) {
        await ensureBookRow({ storage, db, job });
        rowChecked.add(job.bookId);
      }

      const bTitle = titleMap.get(job.bookId) || job.bookId;
      console.log(`\n===============================================================`);
      console.log(`>>> [KHÓA CHẶT DỊCH 100%] Bộ truyện: "${bTitle}" (${job.bookId})`);
      console.log(`===============================================================`);

      while (!isDone(job.state) && spentTotal < REQUEST_BUDGET && Date.now() < deadlineAt) {
        const remainingBudget = REQUEST_BUDGET === Infinity ? Infinity : REQUEST_BUDGET - spentTotal;
        const result = await runTranslationJobs({
          state: job.state,
          requestBudget: remainingBudget, // Translate all chapters of this book until done!
          deadlineAt,
          spacingMs: () => computeAdaptiveSpacing(allUniqueKeys),
          batchSize: BATCH_SIZE,
          loadChapter: (n) => readJson(storage, originalKey(job.bookId, job.revision, n)),
          translateChapter: async (chapter) => {
            const existing = await readJson(storage, chapterKey(job.bookId, job.revision, chapter.chapterNumber));
            if (existing && existing.translationStatus === "completed" && existing.content) {
              console.log(`  ch ${chapter.chapterNumber}: đã có bản dịch trên R2, bỏ qua Groq AI`);
              return existing.content;
            }
            const glossary = await engine.loadGlossary(job.bookId);
            const output = await translateText(chapter.content, apiKey, {
              bookId: job.bookId,
              glossary,
              engine
            });
            if (!output || !output.translation) throw new Error("Groq AI không trả bản dịch.");
            if (output.tokensUsed) {
              lastChapterTokens = output.tokensUsed;
            }
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
          onProgress: async ({ chapter, status, completed, total, sessionDelta }) => {
            const currentTotalSession = translatedTotal + (sessionDelta || 0);
            const bTitle = titleMap.get(job.bookId) || job.bookId;
            const elapsedMin = Math.max(0.05, (Date.now() - new Date(startedAt).getTime()) / 60000);
            const currentSpeed = Math.round((currentTotalSession / elapsedMin) * 10) / 10;
            const currentSpacing = computeAdaptiveSpacing(allUniqueKeys);
            console.log(`  [${bTitle}] ch ${chapter}: ${status}  (${completed}/${total}) [Phiên này: +${currentTotalSession} ch] [Điều tốc: ${Math.round(currentSpacing/1000)}s/ch]`);
            await writeTranslateStatus(storage, {
              state: "running",
              startedAt,
              speed: currentSpeed,
              currentBookId: job.bookId,
              currentBookTitle: bTitle,
              currentChapter: chapter,
              currentCompleted: completed,
              currentTotalChapters: total,
              translatedThisRun: currentTotalSession,
              spentRequests: spentTotal + (sessionDelta || 0),
              recentActivity,
              message: `Đang dịch [${bTitle}] — Chương ${chapter} (${completed}/${total}) [Phiên này: +${currentTotalSession} chương]`,
              queue: queue.map((j) => {
                const isCurrent = j.bookId === job.bookId;
                const doneCh = isCurrent ? completed : (j.total || 0) - (j.pending || 0);
                const pendCh = isCurrent ? Math.max(0, total - completed) : j.pending;
                return {
                  bookId: j.bookId,
                  revision: j.revision,
                  pending: pendCh,
                  highPriority: j.highPriority || activeBookIds.has(j.bookId),
                  total: j.total,
                  translated: doneCh
                };
              })
            });
          }
        });

        spentTotal += result.spent;
        translatedTotal += result.translated;
        translatedThisCycle += result.translated;

        if (result.translated) {
          touched.set(job.bookId, job);
          const bTitle = titleMap.get(job.bookId) || job.bookId;
          recentActivity = [
            {
              bookId: job.bookId,
              title: bTitle,
              count: result.translated,
              at: new Date().toISOString()
            },
            ...recentActivity
          ].slice(0, 30);

          const waiting = (sincePublish.get(job.bookId) || 0) + result.translated;
          if (isDone(job.state)) {
            sincePublish.set(job.bookId, 0);
            await publishBook(job);
            console.log(`\n🎉🎉🎉 [${bTitle}] ĐÃ DỊCH HOÀN TẤT TRỌN VẸN 100% (${job.total}/${job.total} chương)! Đã xuất bản lên thư viện.`);
            break;
          } else if (waiting >= PUBLISH_EVERY_CHAPTERS) {
            sincePublish.set(job.bookId, 0);
            await publishBook(job);
            console.log(`  [${job.bookId}] -> đã publish tiến độ (+${waiting} chương)`);
          } else {
            sincePublish.set(job.bookId, waiting);
          }
        }

        rotation.lastBookId = job.bookId;
        await storage.put(ROTATION_KEY, JSON.stringify(rotation)).catch(() => {});

        if (isDone(job.state)) {
          break;
        }

        if (result.quotaExhausted) {
          if (CONTINUOUS_MODE) {
            const earliestMs = result.earliestCooldown ? Math.max(5000, result.earliestCooldown - Date.now()) : 30000;
            const waitSec = Math.min(60, Math.max(5, Math.round(earliestMs / 1000)));
            console.log(`  -> [${bTitle}] Tạm thời các key đang chờ hồi phục quota. Nghỉ ${waitSec} giây và tiếp tục dịch dứt điểm bộ này...`);
            await new Promise((r) => setTimeout(r, waitSec * 1000));
          } else {
            stoppedForQuota = true;
            stop = true;
            console.log("  -> hết quota Groq AI, dừng để lượt sau tiếp tục từ đây");
            break;
          }
        } else if (!result.translated) {
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }

    // A full pass that translated nothing means every queue is finished or
    // waiting on a backoff.
    if (!translatedThisCycle) {
      if (CONTINUOUS_MODE) {
        console.log("  [24/7 Continuous Mode] Hàng đợi tạm thời không còn chương chờ. Nghỉ 30s trước vòng lặp tiếp theo...");
        await new Promise((r) => setTimeout(r, 30000));
        continue;
      }
      break;
    }
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
      ? `Tạm dừng: Hết quota Groq AI. Đã dịch ${translatedTotal} chương trong phiên.`
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

  const reason = stoppedForQuota
    ? " Dừng vì hết quota Groq AI trong ngày; lượt sau sẽ tiếp tục sau khi hồi phục hạn mức."
    : Date.now() >= deadlineAt
      ? " Dừng vì hết thời gian chạy."
      : " Hết việc trong hàng đợi.";
  console.log(`\nXong: dịch ${translatedTotal} chương, dùng ${spentTotal} lượt gọi.${reason}`);
}

async function listJobs(storage, onlyBook) {
  if (onlyBook) {
    const state = await readJson(storage, jobStateKey(onlyBook));
    if (!state || !Array.isArray(state.chapters)) return [];
    let healed = false;
    for (const entry of state.chapters) {
      if (entry.status !== "completed" && entry.attempts > 0) {
        entry.status = "pending";
        entry.attempts = 0;
        entry.lastError = "";
        entry.nextAttemptAt = 0;
        healed = true;
      }
    }
    if (healed) {
      storage.put(jobStateKey(onlyBook), JSON.stringify(state)).catch(() => {});
    }
    const counts = summarize(state);
    if (counts.completed === counts.total) return [];
    return [{
      bookId: state.bookId,
      revision: state.revision,
      state,
      total: counts.total,
      pending: counts.total - counts.completed,
      highPriority: counts.highPriority || 0
    }];
  }

  const objects = await storage.list("jobs/");
  const jobs = [];
  for (const object of objects) {
    if (!object.key.endsWith("/translation.json")) continue;
    const state = await readJson(storage, object.key);
    if (!state || !Array.isArray(state.chapters)) continue;

    // Auto-heal any chapters that were stalled by previous failed attempts or rate limits
    let healed = false;
    for (const entry of state.chapters) {
      if (entry.status !== "completed" && entry.attempts > 0) {
        entry.status = "pending";
        entry.attempts = 0;
        entry.lastError = "";
        entry.nextAttemptAt = 0;
        healed = true;
      }
    }
    if (healed) {
      storage.put(object.key, JSON.stringify(state)).catch(() => {});
    }

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
