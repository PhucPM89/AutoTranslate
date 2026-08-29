"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isApprovedChapter, applyPublicationProgress } = require("./publication-progress");

test("publication progress counts protected Gemini and semantic-approved chapters only", () => {
  const index = {
    status: "Hoàn thành",
    chapters: [
      { n: 1, provider: "gemini" },
      { n: 2, provider: "hachimi", qaStatus: "approved" },
      { n: 3, provider: "hachimi", qaStatus: "review_pending" },
      { n: 4, translationStatus: "convert" }
    ]
  };
  assert.equal(isApprovedChapter(index.chapters[0]), true);
  assert.equal(isApprovedChapter(index.chapters[2]), false);
  assert.deepEqual(applyPublicationProgress(index, "2026-01-01T00:00:00.000Z"), { approved: 2, total: 4, complete: false });
  assert.equal(index.translatedChapters, 2);
  assert.equal(index.status, "Đang cập nhật");
});
