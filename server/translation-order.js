"use strict";

function chapterCount(job) {
  const total = Number(job.total);
  return Number.isFinite(total) && total > 0 ? total : Infinity;
}

function orderTranslationJobs(jobs, focusBookId = "") {
  return [...jobs].sort((a, b) => {
    const aFocused = a.bookId === focusBookId;
    const bFocused = b.bookId === focusBookId;
    if (aFocused !== bFocused) return aFocused ? -1 : 1;
    const aTotal = chapterCount(a);
    const bTotal = chapterCount(b);
    if (aTotal !== bTotal) return aTotal < bTotal ? -1 : 1;
    return a.bookId.localeCompare(b.bookId);
  });
}

module.exports = { orderTranslationJobs };
