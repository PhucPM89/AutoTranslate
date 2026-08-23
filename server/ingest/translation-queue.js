"use strict";

// Persistent, resumable translation queue.
//
// The ordering here is the whole point: a chapter is translated, then uploaded,
// and only marked `completed` once the upload returned. If the worker dies in
// between, the chapter stays `processing` and the next run picks it up again, so
// a chapter can never be recorded as done while its file is missing from storage.
//
// State lives next to the book in object storage, which means it survives a
// worker restart without needing a database on the ingest path.

const STATES = ["pending", "processing", "completed", "failed", "retrying"];
const DEFAULT_MAX_ATTEMPTS = 15;
const DEFAULT_BACKOFF_MS = 2000;

function jobStateKey(bookId) {
  return `jobs/${bookId}/translation.json`;
}

function createJobState({ bookId, revision, chapters }) {
  return {
    schema: 1,
    bookId,
    revision,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    chapters: chapters.map((chapter) => ({
      n: chapter.chapterNumber,
      status: "pending",
      // "high" is reserved for chapters a later crawl added to a book that was
      // already ingested: an ongoing novel's newest chapters matter more than a
      // backlog that has been waiting anyway.
      priority: "normal",
      attempts: 0,
      lastError: "",
      nextAttemptAt: 0,
      completedAt: ""
    }))
  };
}

// Merging instead of replacing means re-running ingest on a book that is already
// half translated does not throw away finished work.
function mergeJobState(existing, fresh) {
  if (!existing || existing.revision !== fresh.revision) return fresh;
  const byNumber = new Map(existing.chapters.map((entry) => [entry.n, entry]));
  return {
    ...fresh,
    createdAt: existing.createdAt || fresh.createdAt,
    chapters: fresh.chapters.map((entry) => {
      const previous = byNumber.get(entry.n);
      // Keeping the previous entry preserves completed work, attempt counts and
      // backoff. Absent means a new crawl just discovered this chapter.
      if (previous) return previous;
      return { ...entry, priority: "high" };
    })
  };
}

function summarize(state) {
  const counts = Object.fromEntries(STATES.map((s) => [s, 0]));
  let high = 0;
  for (const entry of state.chapters) {
    counts[entry.status] = (counts[entry.status] || 0) + 1;
    if (entry.priority === "high" && entry.status !== "completed") high += 1;
  }
  return { total: state.chapters.length, ...counts, highPriority: high };
}

function isDone(state) {
  return state.chapters.every((entry) => entry.status === "completed");
}

// Newly crawled chapters lead so an ongoing book stays current. Every fairness
// interval gives the oldest normal-priority backlog a turn, so a long book still
// progresses toward 100% instead of being starved by updates.
function nextChapter(state, { now = Date.now(), maxAttempts = DEFAULT_MAX_ATTEMPTS, picked = 0, fairnessEvery = 4, strictSequential = false } = {}) {
  if (strictSequential) {
    const firstUnfinished = state.chapters
      .filter((entry) => entry.status !== "completed")
      .sort((a, b) => a.n - b.n)[0];
    return isEntryReady(firstUnfinished, { now, maxAttempts }) ? firstUnfinished : null;
  }
  const candidates = state.chapters
    .filter((entry) => isEntryReady(entry, { now, maxAttempts }))
    .sort((a, b) => a.n - b.n);
  if (!candidates.length) return null;
  const high = candidates.filter((entry) => entry.priority === "high");
  const normal = candidates.filter((entry) => entry.priority !== "high");
  const preferNormal = fairnessEvery > 0 && picked > 0 && picked % fairnessEvery === 0;
  return preferNormal ? (normal[0] || high[0]) : (high[0] || normal[0]);
}

function nextBatchChapters(state, { now = Date.now(), maxAttempts = DEFAULT_MAX_ATTEMPTS, batchSize = 2, picked = 0, strictSequential = false } = {}) {
  const first = nextChapter(state, { now, maxAttempts, picked, strictSequential });
  if (!first) return [];
  if (batchSize <= 1) return [first];

  const batch = [first];
  for (let i = 1; i < batchSize; i++) {
    const nextNum = first.n + i;
    const candidate = state.chapters.find(
      (entry) =>
        entry.n === nextNum &&
        isEntryReady(entry, { now, maxAttempts })
    );
    if (!candidate) break;
    batch.push(candidate);
  }
  return batch;
}

function isEntryReady(entry, { now, maxAttempts }) {
  if (!entry || entry.status === "completed") return false;
  if (Number(entry.attempts || 0) >= maxAttempts) return false;
  return Number(entry.nextAttemptAt || 0) <= now;
}

function backoffFor(attempts, base = DEFAULT_BACKOFF_MS) {
  return base * Math.pow(2, Math.max(0, attempts - 1));
}

/**
 * Drives the queue until it runs out of work, budget or time.
 *
 * translateChapter(chapter)  -> translated text  (throws on failure)
 * translateBatch(chapters)   -> [{ chapterNumber, translation }]
 * publishChapter(chapter, translation) -> uploads and returns when durable
 * loadChapter(n)             -> the source chapter for that number
 */
async function runTranslationJobs({
  state,
  loadChapter,
  translateChapter,
  translateBatch,
  publishChapter,
  saveState,
  now = () => Date.now(),
  sleep = defaultSleep,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  backoffBaseMs = DEFAULT_BACKOFF_MS,
  requestBudget = Infinity,
  deadlineAt = Infinity,
  spacingMs = 0,
  batchSize = 1,
  strictSequential = false,
  onProgress = null
}) {
  let translated = 0;
  let failed = 0;
  let quotaExhausted = false;
  let earliestCooldown = 0;
  let spent = 0;

  while (true) {
    if (spent >= requestBudget) break;
    if (now() >= deadlineAt) break;

    const entries = (batchSize > 1)
      ? nextBatchChapters(state, { now: now(), maxAttempts, batchSize, picked: spent, strictSequential })
      : [nextChapter(state, { now: now(), maxAttempts, picked: spent, strictSequential })].filter(Boolean);

    if (!entries.length) break;

    for (const entry of entries) {
      entry.status = "processing";
      entry.attempts += 1;
    }
    state.updatedAt = new Date(now()).toISOString();
    await saveState(state);

    if (typeof onProgress === "function") {
      try {
        const doneCount = state.chapters.filter((c) => c.status === "completed").length;
        await onProgress({
          chapter: entries[0]?.n || 0,
          chapters: entries.map((entry) => entry.n),
          status: "translating",
          completed: doneCount,
          total: state.chapters.length,
          sessionDelta: translated,
          spentDelta: spent
        });
      } catch {}
    }

    try {
      if (entries.length > 1 && typeof translateBatch === "function") {
        const chapters = await Promise.all(entries.map((e) => loadChapter(e.n)));
        const batchResults = await translateBatch(chapters);
        spent += 1;

        for (const res of batchResults) {
          const entry = entries.find((e) => e.n === res.chapterNumber);
          const ch = chapters.find((c) => c && c.chapterNumber === res.chapterNumber);
          if (entry && ch && res.translation) {
            await publishChapter(ch, res.translation);
            entry.status = "completed";
            entry.lastError = "";
            entry.nextAttemptAt = 0;
            entry.completedAt = new Date(now()).toISOString();
            translated += 1;
          }
        }
      } else if (entries.length > 1) {
        // Parallel concurrent translation across different API keys
        await Promise.all(
          entries.map(async (entry) => {
            try {
              const chapter = await loadChapter(entry.n);
              if (!chapter) throw new Error(`Không tìm thấy nội dung chương ${entry.n}.`);

              const translation = await translateChapter(chapter);
              await publishChapter(chapter, translation);

              entry.status = "completed";
              entry.lastError = "";
              entry.nextAttemptAt = 0;
              entry.completedAt = new Date(now()).toISOString();
              translated += 1;
              spent += 1;
            } catch (err) {
              spent += 1;
              const errMsg = String(err && err.message ? err.message : err).slice(0, 300);
              entry.lastError = errMsg;
              if (isQuotaError(err)) {
                quotaExhausted = true;
                if (err && err.earliestCooldown) {
                  earliestCooldown = earliestCooldown
                    ? Math.min(earliestCooldown, err.earliestCooldown)
                    : err.earliestCooldown;
                }
                entry.attempts = Math.max(0, entry.attempts - 1);
                entry.status = "pending";
                entry.nextAttemptAt = now() + backoffFor(1, backoffBaseMs);
              } else if (entry.attempts >= maxAttempts) {
                entry.status = "failed";
                failed += 1;
              } else {
                entry.status = "retrying";
                entry.nextAttemptAt = now() + backoffFor(entry.attempts, backoffBaseMs);
              }
            }
          })
        );
      } else {
        const entry = entries[0];
        const chapter = await loadChapter(entry.n);
        if (!chapter) throw new Error(`Không tìm thấy nội dung chương ${entry.n}.`);

        const translation = await translateChapter(chapter);
        spent += 1;

        // Upload first, mark completed second. Never the other way round.
        await publishChapter(chapter, translation);

        entry.status = "completed";
        entry.lastError = "";
        entry.nextAttemptAt = 0;
        entry.completedAt = new Date(now()).toISOString();
        translated += 1;
      }

    } catch (error) {
      spent += 1;
      const errMsg = String(error && error.message ? error.message : error).slice(0, 300);
      if (error && error.earliestCooldown) {
        earliestCooldown = error.earliestCooldown;
      }

      for (const entry of entries) {
        if (entry.status === "completed") continue;
        entry.lastError = errMsg;

        if (isQuotaError(error)) {
          entry.attempts = Math.max(0, entry.attempts - 1);
          entry.status = "pending";
          entry.nextAttemptAt = now() + backoffFor(1, backoffBaseMs);
          quotaExhausted = true;
        } else if (entry.attempts >= maxAttempts) {
          entry.status = "failed";
          failed += 1;
        } else {
          entry.status = "retrying";
          entry.nextAttemptAt = now() + backoffFor(entry.attempts, backoffBaseMs);
        }
      }

      if (quotaExhausted) {
        state.updatedAt = new Date(now()).toISOString();
        await saveState(state);
      }
    }

    state.updatedAt = new Date(now()).toISOString();
    await saveState(state);
    if (onProgress) {
      for (const entry of entries) {
        await onProgress({
          chapter: entry.n,
          chapters: entries.map((item) => item.n),
          status: entry.status,
          attempts: entry.attempts,
          lastError: entry.lastError,
          sessionDelta: translated,
          spentDelta: spent,
          ...summarize(state)
        });
      }
    }
    // translateChapter already rotates through the available key pool. A quota
    // error here means continuing with more chapters would create a retry storm.
    if (quotaExhausted) break;
    const currentSpacing = typeof spacingMs === "function" ? spacingMs() : spacingMs;
    if (currentSpacing) {
      const jitter = Math.floor(Math.random() * 300);
      await sleep(currentSpacing + jitter);
    }
  }

  return { translated, failed, quotaExhausted, earliestCooldown, spent, summary: summarize(state), done: isDone(state) };
}

function isQuotaError(error) {
  if (error?.code === "key_pool_slice_exhausted") return true;
  if (!error) return false;
  if (error.code === "quota_exceeded") return true;
  if (error.status === 429 || error.status === 503) return true;
  return /quota|rate limit|resource_exhausted|too many requests|TPD|TPM|tokens per day|tokens per minute|retry in/i.test(String(error.message || ""));
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTranslationBacklog(storage) {
  try {
    const objects = await storage.list("jobs/");
    const pendingBooks = [];
    let totalPendingChapters = 0;
    for (const obj of objects) {
      if (!obj.key.endsWith("/translation.json")) continue;
      const raw = await storage.get(obj.key);
      if (!raw) continue;
      let state = null;
      try {
        state = JSON.parse(raw.toString("utf8"));
      } catch {}
      if (!state || !Array.isArray(state.chapters)) continue;
      const counts = summarize(state);
      const pendingChapters = counts.total - counts.completed;
      if (pendingChapters > 0) {
        pendingBooks.push({
          bookId: state.bookId,
          revision: state.revision,
          total: counts.total,
          completed: counts.completed,
          pending: pendingChapters
        });
        totalPendingChapters += pendingChapters;
      }
    }
    return {
      pendingBooksCount: pendingBooks.length,
      totalPendingChapters,
      pendingBooks
    };
  } catch {
    return { pendingBooksCount: 0, totalPendingChapters: 0, pendingBooks: [] };
  }
}

module.exports = {
  STATES,
  DEFAULT_MAX_ATTEMPTS,
  jobStateKey,
  createJobState,
  mergeJobState,
  summarize,
  isDone,
  nextChapter,
  nextBatchChapters,
  backoffFor,
  runTranslationJobs,
  isQuotaError,
  getTranslationBacklog
};
