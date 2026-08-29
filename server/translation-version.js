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
  return provider === "gemini" || Boolean(document.qaReviewed) || model.includes("gemini");
}

module.exports = {
  TRANSLATION_VERSION,
  needsTranslationVersion,
  stampTranslationVersion,
  isProtectedGeminiDocument
};
