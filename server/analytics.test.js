"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { applyEvent, summarizeAnalytics, normalizeAnalytics, cleanBookId } = require("./analytics-store");

test("counts visits and book opens into the right day bucket", () => {
  let value = { days: {} };
  value = applyEvent(value, { type: "visit", date: "2026-08-20" });
  value = applyEvent(value, { type: "visit", date: "2026-08-20" });
  value = applyEvent(value, { type: "read", bookId: "fanqie-123", date: "2026-08-20" });
  value = applyEvent(value, { type: "read", bookId: "fanqie-123", date: "2026-08-20" });
  value = applyEvent(value, { type: "read", bookId: "fanqie-999", date: "2026-08-19" });

  assert.deepEqual(value.days["2026-08-20"], { visits: 2, reads: 2, books: { "fanqie-123": 2 } });
  assert.deepEqual(value.days["2026-08-19"], { visits: 0, reads: 1, books: { "fanqie-999": 1 } });
});

test("keeps only the most recent 60 days", () => {
  let value = { days: {} };
  for (let day = 1; day <= 70; day += 1) {
    value = applyEvent(value, { type: "visit", date: `2026-01-${String(day).padStart(2, "0")}` });
  }
  const dates = Object.keys(value.days).sort();
  assert.equal(dates.length, 60);
  assert.equal(dates[0], "2026-01-11", "oldest days are pruned first");
});

test("summarises today, rolling windows, all-time and top books", () => {
  let value = { days: {} };
  const record = (date, visits, reads, bookId) => {
    for (let i = 0; i < visits; i += 1) value = applyEvent(value, { type: "visit", date });
    for (let i = 0; i < reads; i += 1) value = applyEvent(value, { type: "read", bookId, date });
  };
  record("2026-08-20", 5, 3, "a");
  record("2026-08-18", 4, 2, "b");
  record("2026-07-01", 7, 1, "a");

  const summary = summarizeAnalytics(value, { today: "2026-08-20" });
  assert.deepEqual(summary.today, { visits: 5, reads: 3 });
  assert.deepEqual(summary.last7Days, { visits: 9, reads: 5 }, "20th and 18th only");
  assert.deepEqual(summary.last30Days, { visits: 9, reads: 5 }, "July 1st is outside 30 days");
  assert.deepEqual(summary.allTime, { visits: 16, reads: 6 });
  assert.equal(summary.firstDay, "2026-07-01");
  assert.deepEqual(summary.topBooks, [{ bookId: "a", reads: 4 }, { bookId: "b", reads: 2 }]);
});

test("rejects malformed stored analytics without throwing", () => {
  const cleaned = normalizeAnalytics({
    days: {
      "2026-08-20": { visits: "3", reads: -2, books: { "ok-id": 4, "bad id!": 9 } },
      "not-a-date": { visits: 5 },
      "2026-08-21": "nonsense"
    }
  });

  assert.deepEqual(Object.keys(cleaned.days), ["2026-08-20"]);
  assert.equal(cleaned.days["2026-08-20"].visits, 3, "numeric strings are accepted");
  assert.equal(cleaned.days["2026-08-20"].reads, 0, "negative counters reset to 0");
  assert.deepEqual(cleaned.days["2026-08-20"].books, { "ok-id": 4 });
  assert.deepEqual(normalizeAnalytics(null), { days: {} });
  assert.deepEqual(normalizeAnalytics({ days: [] }), { days: {} });
});

test("only accepts book ids that look like catalog ids", () => {
  assert.equal(cleanBookId("fanqie-7143038691944959011"), "fanqie-7143038691944959011");
  assert.equal(cleanBookId("library:abc:2026-01-01"), "library:abc:2026-01-01");
  assert.equal(cleanBookId("../../etc/passwd"), "");
  assert.equal(cleanBookId("a".repeat(200)), "");
  assert.equal(cleanBookId(42), "");
  assert.equal(cleanBookId(undefined), "");
});

test("ignores event types it does not know", () => {
  const value = applyEvent({ days: {} }, { type: "visit", date: "2026-08-20" });
  const after = applyEvent(value, { type: "hack", date: "2026-08-20" });
  assert.deepEqual(after.days["2026-08-20"], { visits: 1, reads: 0, books: {} });
});
