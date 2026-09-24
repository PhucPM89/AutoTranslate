"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyReadabilityPatches } = require("./readability-patches");
const patch = { source: "保底", before: "bảo hiểm", after: "phần thưởng tối thiểu", reason: "Mở rương" };
test("patch preserves surrounding text and manual provenance, invalidates old score", () => {
  const doc = { content: "Chỉ được bảo hiểm!", manualEdited: true, qualityScore: 10, qaReviewed: true, semanticReview: { scores: { accuracy: 10 } } };
  const next = applyReadabilityPatches(doc, { content: "保底" }, [patch]);
  assert.equal(next.content, "Chỉ được phần thưởng tối thiểu!");
  assert.equal(next.manualEdited, true);
  assert.equal(next.qaReviewed, false);
  assert.equal(next.qualityScore, undefined);
  assert.equal(next.readabilityRepair.fullChapterReviewed, false);
  assert.equal(doc.content, "Chỉ được bảo hiểm!");
});
test("rejects missing source evidence or ambiguous target", () => {
  assert.throws(() => applyReadabilityPatches({content:"bảo hiểm"}, {content:"khác"}, [patch]), /evidence/);
  assert.throws(() => applyReadabilityPatches({content:"bảo hiểm bảo hiểm"}, {content:"保底"}, [patch]), /exactly once/);
});
