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
const DEFAULT_MAX_ATTEMPTS = 4;
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
      return previous && previous.status === "completed" ? previous : previous || entry;
    })
  };
}

function summarize(state) {
  const counts = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const entry of state.chapters) counts[entry.status] = (counts[entry.status] || 0) + 1;
  return { total: state.chapters.length, ...counts };
}

function isDone(state) {
  return state.chapters.every((entry) => entry.status === "completed");
}

// Chapters are handed out lowest-number-first so the opening chapters of a book
// become readable long before a 4,000-chapter novel finishes.
function nextChapter(state, { now = Date.now(), maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
  const candidates = state.chapters
    .filter((entry) => entry.status !== "completed")
    .filter((entry) => entry.status !== "failed" || entry.attempts < maxAttempts)
    .filter((entry) => (entry.nextAttemptAt || 0) <= now)
    .sort((a, b) => a.n - b.n);
  return candidates[0] || null;
}

function backoffFor(attempts, base = DEFAULT_BACKOFF_MS) {
  return base * Math.pow(2, Math.max(0, attempts - 1));
}

/**
 * Drives the queue until it runs out of work, budget or time.
 *
 * translateChapter(chapter)  -> translated text  (throws on failure)
 * publishChapter(chapter, translation) -> uploads and returns when durable
 * loadChapter(n)             -> the source chapter for that number
 */
async function runTranslationJobs({
  state,
  loadChapter,
  translateChapter,
  publishChapter,
  saveState,
  now = () => Date.now(),
  sleep = defaultSleep,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  backoffBaseMs = DEFAULT_BACKOFF_MS,
  requestBudget = Infinity,
  deadlineAt = Infinity,
  spacingMs = 0,
  onProgress = null
}) {
  let translated = 0;
  let failed = 0;
  let quotaExhausted = false;
  let spent = 0;

  while (true) {
    if (spent >= requestBudget) break;
    if (now() >= deadlineAt) break;

    const entry = nextChapter(state, { now: now(), maxAttempts });
    if (!entry) break;

    entry.status = "processing";
    entry.attempts += 1;
    state.updatedAt = new Date(now()).toISOString();
    await saveState(state);

    try {
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
    } catch (error) {
      spent += 1;
      entry.lastError = String(error && error.message ? error.message : error).slice(0, 300);

      if (isQuotaError(error)) {
        // Quota is not this chapter's fault: put it back without burning an
        // attempt, and stop the run instead of hammering a closed door.
        entry.attempts = Math.max(0, entry.attempts - 1);
        entry.status = "pending";
        entry.nextAttemptAt = now() + backoffFor(1, backoffBaseMs);
        quotaExhausted = true;
        state.updatedAt = new Date(now()).toISOString();
        await saveState(state);
        break;
      }

      if (entry.attempts >= maxAttempts) {
        entry.status = "failed";
        failed += 1;
      } else {
        entry.status = "retrying";
        entry.nextAttemptAt = now() + backoffFor(entry.attempts, backoffBaseMs);
      }
    }

    state.updatedAt = new Date(now()).toISOString();
    await saveState(state);
    if (onProgress) await onProgress({ chapter: entry.n, status: entry.status, ...summarize(state) });
    if (spacingMs) await sleep(spacingMs);
  }

  return { translated, failed, quotaExhausted, spent, summary: summarize(state), done: isDone(state) };
}

function isQuotaError(error) {
  if (!error) return false;
  if (error.code === "quota_exceeded") return true;
  if (error.status === 429) return true;
  return /quota|rate limit|resource_exhausted|too many requests/i.test(String(error.message || ""));
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  backoffFor,
  runTranslationJobs,
  isQuotaError
};
