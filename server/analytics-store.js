"use strict";

const { updateWithRetry } = require("./blob-concurrency");

const ANALYTICS_PATH = "library/analytics.json";
const RETENTION_DAYS = 60;
const MAX_BOOKS_PER_DAY = 200;
// Counters are per browser session, not per pageview: the client only beacons
// once per session and once per book opened. That keeps a busy day at a few dozen
// Blob writes instead of one per page, which is what the free tier can afford.
const MAX_COUNTER = 10_000_000;

const EMPTY_ANALYTICS = { days: {} };

async function readAnalytics() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return structuredClone(EMPTY_ANALYTICS);
  try {
    return (await readSnapshot()).value;
  } catch (error) {
    console.error("Unable to read analytics:", error.message);
    return structuredClone(EMPTY_ANALYTICS);
  }
}

async function recordEvent({ type, bookId, date = todayKey() }) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  if (!["visit", "read"].includes(type)) return;

  await updateWithRetry({
    maxAttempts: 5,
    read: readSnapshot,
    mutate: (value) => applyEvent(value, { type, bookId, date }),
    write: async (value, etag) => {
      const { put } = require("@vercel/blob");
      await put(ANALYTICS_PATH, JSON.stringify(value), {
        access: "public",
        contentType: "application/json; charset=utf-8",
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
        cacheControlMaxAge: 0
      });
      return value;
    }
  });
}

function applyEvent(value, { type, bookId, date }) {
  const analytics = normalizeAnalytics(value);
  const day = analytics.days[date] || { visits: 0, reads: 0, books: {} };

  if (type === "visit") day.visits = bump(day.visits);
  if (type === "read") {
    day.reads = bump(day.reads);
    // Already-tracked books keep counting; the cap only stops new keys being added.
    const tracked = day.books[bookId] !== undefined;
    if (bookId && (tracked || Object.keys(day.books).length < MAX_BOOKS_PER_DAY)) {
      day.books[bookId] = bump(day.books[bookId]);
    }
  }

  analytics.days[date] = day;
  return pruneOldDays(analytics);
}

function pruneOldDays(analytics) {
  const keys = Object.keys(analytics.days).sort();
  while (keys.length > RETENTION_DAYS) delete analytics.days[keys.shift()];
  return analytics;
}

// Rolls the raw day buckets into the figures the admin panel shows.
function summarizeAnalytics(value, { today = todayKey() } = {}) {
  const analytics = normalizeAnalytics(value);
  const days = Object.entries(analytics.days).sort(([a], [b]) => a.localeCompare(b));

  const totals = { visits: 0, reads: 0 };
  const bookReads = new Map();
  for (const [, day] of days) {
    totals.visits += day.visits;
    totals.reads += day.reads;
    for (const [bookId, count] of Object.entries(day.books)) {
      bookReads.set(bookId, (bookReads.get(bookId) || 0) + count);
    }
  }

  return {
    today: dayTotals(analytics, [today]),
    last7Days: dayTotals(analytics, recentKeys(today, 7)),
    last30Days: dayTotals(analytics, recentKeys(today, 30)),
    allTime: totals,
    trackedDays: days.length,
    firstDay: days[0]?.[0] || "",
    daily: days.slice(-30).map(([date, day]) => ({ date, visits: day.visits, reads: day.reads })),
    topBooks: [...bookReads.entries()]
      .map(([bookId, reads]) => ({ bookId, reads }))
      .sort((a, b) => b.reads - a.reads)
      .slice(0, 10)
  };
}

function dayTotals(analytics, keys) {
  return keys.reduce(
    (totals, key) => {
      const day = analytics.days[key];
      if (day) {
        totals.visits += day.visits;
        totals.reads += day.reads;
      }
      return totals;
    },
    { visits: 0, reads: 0 }
  );
}

function recentKeys(today, count) {
  const base = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(base)) return [today];
  return Array.from({ length: count }, (_, index) =>
    new Date(base - index * 86400000).toISOString().slice(0, 10)
  );
}

function normalizeAnalytics(value) {
  const days = {};
  const source = value?.days && typeof value.days === "object" ? value.days : {};
  for (const [date, day] of Object.entries(source)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day || typeof day !== "object") continue;
    const books = {};
    const bookSource = day.books && typeof day.books === "object" ? day.books : {};
    for (const [bookId, count] of Object.entries(bookSource)) {
      const clean = cleanBookId(bookId);
      if (clean) books[clean] = counter(count);
    }
    days[date] = { visits: counter(day.visits), reads: counter(day.reads), books };
  }
  return { days };
}

function cleanBookId(value) {
  return typeof value === "string" && /^[\w:-]{1,80}$/.test(value) ? value : "";
}

function counter(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? Math.min(number, MAX_COUNTER) : 0;
}

function bump(value) {
  return Math.min(counter(value) + 1, MAX_COUNTER);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function readSnapshot() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { value: structuredClone(EMPTY_ANALYTICS), etag: "" };
  const { list } = require("@vercel/blob");
  const result = await list({ prefix: ANALYTICS_PATH, limit: 10 });
  const blob = result.blobs.find((item) => item.pathname === ANALYTICS_PATH);
  if (!blob) return { value: structuredClone(EMPTY_ANALYTICS), etag: "" };

  const response = await fetch(`${blob.url}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${ANALYTICS_PATH} trả HTTP ${response.status}.`);
  return { value: normalizeAnalytics(await response.json()), etag: blob.etag };
}

module.exports = {
  ANALYTICS_PATH,
  readAnalytics,
  recordEvent,
  summarizeAnalytics,
  normalizeAnalytics,
  applyEvent,
  cleanBookId,
  todayKey
};
