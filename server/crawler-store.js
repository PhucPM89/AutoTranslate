"use strict";


// Fanqie rank ids are `<scope>_<board>_<category>`. The `_1_` boards list new and
// rising novels, which top out around 200 chapters, so they can never satisfy a
// minChapterCount in the thousands. The `_2_` boards list established novels and
// are the only usable source once a chapter minimum is set.
const CATEGORY_DEFINITIONS = {
  xianxia: { label: "Tiên hiệp", categoryIds: [1140], ranks: ["1_1_1140"], longRanks: ["1_2_1140"] },
  fantasy: { label: "Huyền huyễn", categoryIds: [258, 257], ranks: ["1_1_258", "1_1_257"], longRanks: ["1_2_258", "1_2_257"] },
  horror: { label: "Linh dị / Kinh dị", categoryIds: [751], ranks: ["1_1_751"], longRanks: ["1_2_751"] },
  apocalypse: { label: "Mạt thế", categoryIds: [8], ranks: ["1_1_8"], longRanks: ["1_2_8"] },
  detective: { label: "Trinh thám", categoryIds: [539, 504], ranks: ["1_1_539", "1_1_504"], longRanks: ["1_2_539", "1_2_504"] }
};

// Fanqie's own 字数 filter, verified against real word counts. Selecting a bucket
// server-side is what makes long-novel discovery a single request instead of
// hundreds of per-book probes.
const WORD_COUNT_BUCKETS = [
  { value: -1, label: "Tất cả độ dài", minWords: 0 },
  { value: 0, label: "Dưới 300k chữ", minWords: 0 },
  { value: 1, label: "300k - 500k chữ", minWords: 300000 },
  { value: 2, label: "500k - 1 triệu chữ", minWords: 500000 },
  { value: 3, label: "1 - 2 triệu chữ", minWords: 1000000 },
  { value: 4, label: "Trên 2 triệu chữ", minWords: 2000000 }
];
const CREATION_STATUSES = [
  { value: -1, label: "Tất cả" },
  { value: 0, label: "Đã hoàn thành" },
  { value: 1, label: "Đang ra chương" }
];
const DEFAULT_CONFIG = {
  enabled: false,
  categories: Object.keys(CATEGORY_DEFINITIONS),
  maxNewBooksPerRun: 1,
  wordCountBucket: 4,
  creationStatus: -1,
  updateExisting: true,
  excludedSourceIds: []
};
const DEFAULT_STATUS = {
  state: "idle",
  message: "Crawler chưa chạy.",
  startedAt: "",
  finishedAt: "",
  // Written on every status update, so the admin can tell a run that is working
  // from one that died holding the "running" flag. "Started 40 minutes ago" says
  // nothing on its own; "last heartbeat 20 seconds ago" says it is alive.
  updatedAt: "",
  currentBookId: "",
  currentBookTitle: "",
  currentChapters: 0,
  currentTotalChapters: 0,
  resumeAttempts: 0,
  discovered: 0,
  published: 0,
  failed: 0,
  // What actually arrived, newest first. A count of one is not enough to know
  // whether the crawler is producing anything.
  recent: [],
  recentErrors: []
};
const MAX_RECENT = 8;

function sanitizeCrawlerConfig(value) {
  const categories = Array.isArray(value?.categories)
    ? value.categories.filter((key, index, list) => CATEGORY_DEFINITIONS[key] && list.indexOf(key) === index)
    : DEFAULT_CONFIG.categories;
  return {
    enabled: Boolean(value?.enabled),
    categories: categories.length ? categories : [...DEFAULT_CONFIG.categories],
    maxNewBooksPerRun: clampInteger(value?.maxNewBooksPerRun, 1, 3, DEFAULT_CONFIG.maxNewBooksPerRun),
    // The word-count bucket is the single length control; Fanqie applies it
    // server-side, so a separate chapter minimum is redundant.
    wordCountBucket: allowedChoice(value?.wordCountBucket, WORD_COUNT_BUCKETS, DEFAULT_CONFIG.wordCountBucket),
    creationStatus: allowedChoice(value?.creationStatus, CREATION_STATUSES, DEFAULT_CONFIG.creationStatus),
    updateExisting: value?.updateExisting !== false,
    excludedSourceIds: Array.isArray(value?.excludedSourceIds)
      ? Array.from(new Set(value.excludedSourceIds.map(String).filter((id) => /^\d{10,30}$/.test(id)))).slice(0, 500)
      : []
  };
}

function sanitizeCrawlerStatus(value) {
  return {
    state: allowedState(value?.state),
    message: clean(value?.message, 300) || DEFAULT_STATUS.message,
    startedAt: cleanDate(value?.startedAt),
    finishedAt: cleanDate(value?.finishedAt),
    updatedAt: cleanDate(value?.updatedAt),
    currentBookId: clean(value?.currentBookId, 30).replace(/\D/g, ""),
    currentBookTitle: clean(value?.currentBookTitle, 200),
    currentChapters: clampInteger(value?.currentChapters, 0, 100000, 0),
    currentTotalChapters: clampInteger(value?.currentTotalChapters, 0, 100000, 0),
    // How many runs have already tried to finish `currentBookId`, so a book that
    // can never download cannot block discovery forever.
    resumeAttempts: clampInteger(value?.resumeAttempts, 0, 10, 0),
    discovered: clampInteger(value?.discovered, 0, 1000, 0),
    published: clampInteger(value?.published, 0, 1000, 0),
    failed: clampInteger(value?.failed, 0, 1000, 0),
    recent: Array.isArray(value?.recent)
      ? value.recent
          .slice(0, MAX_RECENT)
          .map((entry) => ({
            title: clean(entry?.title, 200),
            chapters: clampInteger(entry?.chapters, 0, 100000, 0),
            at: cleanDate(entry?.at),
            sourceId: clean(entry?.sourceId, 30).replace(/\D/g, "")
          }))
          .filter((entry) => entry.title)
      : [],
    recentErrors: Array.isArray(value?.recentErrors)
      ? value.recentErrors
          .slice(0, 6)
          .map((entry) => ({
            sourceId: clean(entry?.sourceId, 30).replace(/\D/g, ""),
            title: clean(entry?.title, 200),
            error: clean(entry?.error, 300),
            at: cleanDate(entry?.at)
          }))
          .filter((entry) => entry.error)
      : []
  };
}

function allowedState(value) {
  return ["idle", "running", "success", "error", "disabled"].includes(value) ? value : "idle";
}

function clean(value, max) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanDate(value) {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function clampInteger(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function allowedChoice(value, choices, fallback) {
  const number = Number.parseInt(value, 10);
  return choices.some((choice) => choice.value === number) ? number : fallback;
}

// Fanqie is asked for categories by id but books carry the human label, so this
// maps a label back to its slug. Used when linking a book to a category row.
function categorySlugForLabel(label) {
  const wanted = String(label || "").trim().toLowerCase();
  if (!wanted) return "";
  for (const [slug, definition] of Object.entries(CATEGORY_DEFINITIONS)) {
    if (definition.label.toLowerCase() === wanted) return slug;
  }
  // "Linh dị" against "Linh dị / Kinh dị": accept either half of a compound label.
  for (const [slug, definition] of Object.entries(CATEGORY_DEFINITIONS)) {
    if (definition.label.toLowerCase().split("/").some((part) => part.trim() === wanted)) return slug;
  }
  return "";
}

module.exports = {
  CATEGORY_DEFINITIONS,
  WORD_COUNT_BUCKETS,
  CREATION_STATUSES,
  DEFAULT_CONFIG,
  DEFAULT_STATUS,
  sanitizeCrawlerConfig,
  sanitizeCrawlerStatus,
  categorySlugForLabel
};
