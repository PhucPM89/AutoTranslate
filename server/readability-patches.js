"use strict";
const crypto = require("node:crypto");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");

function applyReadabilityPatches(document, original, patches) {
  let content = document.content;
  if (typeof content !== "string" || !original?.content) throw new Error("Missing content/source");
  for (const patch of patches) {
    if (!patch.source || !original.content.includes(patch.source)) throw new Error("Source evidence missing");
    if (!patch.before || !patch.after || !patch.reason) throw new Error("Incomplete patch");
    if (content.split(patch.before).length !== 2) throw new Error("Patch must match exactly once");
    content = content.replace(patch.before, () => patch.after);
  }
  if (!patches.length) throw new Error("Empty patches");
  const next = { ...document, content, characters: content.length, updatedAt: new Date().toISOString() };
  if (Array.isArray(document.paragraphs)) next.paragraphs = content.split(/\n+/).map(s => s.trim()).filter(Boolean);
  next.qaReviewed = false;
  next.qaRequired = true;
  next.qaStatus = "readability_spot_fixed";
  delete next.qualityScore;
  if (next.semanticReview) { next.previousSemanticReview = next.semanticReview; delete next.semanticReview; }
  next.readabilityRepair = { version: "readability-v1", scope: "selected_passages", fullChapterReviewed: false,
    contentHash: hash(content), patches, previousContentHash: hash(document.content), updatedAt: next.updatedAt };
  return next;
}
module.exports = { hash, applyReadabilityPatches };
