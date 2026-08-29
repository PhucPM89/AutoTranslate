"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mergeReviewEntries,
  claimNextReview,
  settleReview,
  buildSemanticReviewPrompt,
  parseSemanticReview
} = require("./semantic-review");

test("semantic queue preserves approved checkpoint for identical content", () => {
  let queue = mergeReviewEntries(null, [{ revision: 1, chapterNumber: 1, translationVersion: "v2", content: "bản dịch" }], { bookId: "book", revision: 1 });
  const claimed = claimNextReview(queue, { owner: "worker", now: 1000 });
  settleReview(queue, claimed.chapterNumber, { approved: true, decision: "pass", model: "gemini", scores: {}, issues: [] }, { now: 2000 });
  queue = mergeReviewEntries(queue, [{ revision: 1, chapterNumber: 1, translationVersion: "v2", content: "bản dịch" }], { bookId: "book", revision: 1 });
  assert.equal(queue.entries[0].state, "approved");
});

test("semantic queue reopens when chapter content changes and reclaims expired leases", () => {
  let queue = mergeReviewEntries(null, [{ revision: 1, chapterNumber: 1, translationVersion: "v2", content: "cũ" }], { bookId: "book", revision: 1 });
  claimNextReview(queue, { owner: "dead", now: 1000, leaseMs: 100 });
  assert.equal(claimNextReview(queue, { owner: "live", now: 1050 }), null);
  assert.equal(claimNextReview(queue, { owner: "live", now: 1200 }).leaseOwner, "live");
  queue = mergeReviewEntries(queue, [{ revision: 1, chapterNumber: 1, translationVersion: "v2", content: "mới" }], { bookId: "book", revision: 1 });
  assert.equal(queue.entries[0].state, "pending");
  assert.equal(queue.entries[0].attempts, 0);
});

test("semantic parser rejects a contradictory pass", () => {
  assert.throws(() => parseSemanticReview(JSON.stringify({
    decision: "pass",
    scores: { accuracy: 8, completeness: 10, fluency: 10, terminology: 10 },
    issues: [],
    correctedTranslation: ""
  }), { source: "原文", draft: "Bản nháp" }), /tự mâu thuẫn/);
});

test("semantic parser accepts a complete repair and prompt includes glossary", () => {
  const source = "李明 đi đến nơi này".repeat(30);
  const repaired = "Lý Minh đi đến nơi này một cách cẩn thận. ".repeat(20);
  const result = parseSemanticReview(JSON.stringify({
    decision: "repair",
    scores: { accuracy: 8, completeness: 9, fluency: 9, terminology: 10 },
    issues: [{ type: "subject", severity: "major", explanation: "Nhầm chủ thể" }],
    correctedTranslation: repaired
  }), { source, draft: "Sai" });
  assert.equal(result.decision, "repair");
  assert.match(result.correctedTranslation, /Lý Minh/);
  assert.match(buildSemanticReviewPrompt({ source, draft: "Sai", glossary: { "李明": "Lý Minh" } }), /Lý Minh/);
});
