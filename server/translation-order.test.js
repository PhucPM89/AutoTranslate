"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { orderTranslationJobs } = require("./translation-order");

test("finishes the focused novel before shorter novels", () => {
  const jobs = [
    { bookId: "short", total: 100 },
    { bookId: "ac-mong", total: 1956 },
    { bookId: "medium", total: 500 }
  ];
  assert.deepEqual(orderTranslationJobs(jobs, "ac-mong").map(j => j.bookId),
    ["ac-mong", "short", "medium"]);
  assert.deepEqual(orderTranslationJobs(jobs.filter(j => j.bookId !== "ac-mong")).map(j => j.bookId),
    ["short", "medium"]);
});

test("total chapter count wins over progress and chapter priority", () => {
  const jobs = [
    { bookId: "long-almost-done", total: 2000, pending: 1, highPriority: 10 },
    { bookId: "short-new", total: 100, pending: 100, highPriority: 0 },
    { bookId: "medium", total: 500, pending: 20 }
  ];
  assert.deepEqual(orderTranslationJobs(jobs).map(j => j.bookId),
    ["short-new", "medium", "long-almost-done"]);
  assert.equal(jobs[0].bookId, "long-almost-done");
});

test("ties use stable ids and unknown totals go last", () => {
  const jobs = [
    { bookId: "unknown" }, { bookId: "b", total: 100 },
    { bookId: "a", total: "100" }, { bookId: "empty", total: 0 }
  ];
  assert.deepEqual(orderTranslationJobs(jobs).map(j => j.bookId),
    ["a", "b", "empty", "unknown"]);
});
