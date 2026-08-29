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

test("semantic pipeline upgrade resets unfinished attempts but preserves approved chapters", () => {
  const candidates = [
    { revision: 1, chapterNumber: 1, translationVersion: "v2", content: "đã duyệt" },
    { revision: 1, chapterNumber: 2, translationVersion: "v2", content: "đang lỗi" }
  ];
  let queue = mergeReviewEntries(null, candidates, { bookId: "book", revision: 1, now: "2026-01-01T00:00:00.000Z" });
  queue.entries[0].state = "approved";
  queue.entries[0].attempts = 2;
  queue.entries[1].state = "batch_processing";
  queue.entries[1].attempts = 3;
  queue.entries[1].batchId = "old-batch";
  queue.reviewVersion = "semantic-v1";

  queue = mergeReviewEntries(queue, candidates, { bookId: "book", revision: 1, now: "2026-01-02T00:00:00.000Z" });
  assert.equal(queue.reviewVersion, "semantic-v2");
  assert.equal(queue.entries[0].state, "approved");
  assert.equal(queue.entries[0].attempts, 2);
  assert.equal(queue.entries[1].state, "pending");
  assert.equal(queue.entries[1].attempts, 0);
  assert.equal(queue.entries[1].batchId, undefined);
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

test("provider quota does not consume a chapter attempt", () => {
  const queue = mergeReviewEntries(null, [{ revision: 1, chapterNumber: 1, translationVersion: "v2", content: "draft" }], { bookId: "book", revision: 1 });
  const claimed = claimNextReview(queue, { owner: "worker", now: 1000 });
  assert.equal(claimed.attempts, 1);
  settleReview(queue, 1, { retryable: true, retryAfterMs: 60_000, error: "429 quota" }, { now: 2000, maxAttempts: 1 });
  assert.equal(queue.entries[0].state, "retrying");
  assert.equal(queue.entries[0].attempts, 0);
  assert.equal(queue.entries[0].availableAt, new Date(62_000).toISOString());
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

test("semantic parser accepts a short repair verdict without embedding the chapter in JSON", () => {
  const result = parseSemanticReview(JSON.stringify({
    decision: "repair",
    scores: { accuracy: 7, completeness: 9, fluency: 9, terminology: 9 },
    issues: [{ severity: "major", explanation: "Nhầm chủ thể" }],
    correctedTranslation: ""
  }), { source: "原文", draft: "Sai" });
  assert.equal(result.decision, "repair");
  assert.equal(result.correctedTranslation, "");
});
