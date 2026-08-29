"use strict";

// Increment this when a future translation invariant requires a new
// library-wide rebuild. Existing checkpoints remain intact and the next
// campaign will select only chapters carrying an older stamp.
const TRANSLATION_VERSION = "hachimi-quality-v2";

function needsTranslationVersion(entry, version = TRANSLATION_VERSION) {
  return Boolean(entry && entry.translationVersion !== version);
}

function stampTranslationVersion(entry, version = TRANSLATION_VERSION) {
  if (entry) entry.translationVersion = version;
  return entry;
}

function isProtectedGeminiDocument(document) {
  if (!document) return false;
  const provider = String(document.provider || document.translationProvider || "").toLowerCase();
  const model = String(document.model || "").toLowerCase();
  // qaReviewed is only a quality flag, not reliable provider provenance. Some
  // legacy Hachimi chapters were stamped true by the old broad audit and must
  // remain eligible for the quality-v2 rebuild.
  return provider === "gemini" || model.includes("gemini");
}

module.exports = {
  TRANSLATION_VERSION,
  needsTranslationVersion,
  stampTranslationVersion,
  isProtectedGeminiDocument
};
