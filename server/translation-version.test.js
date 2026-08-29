"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TRANSLATION_VERSION,
  needsTranslationVersion,
  stampTranslationVersion,
  isProtectedGeminiDocument
} = require("./translation-version");

test("name-lock campaign selects legacy chapters and skips completed checkpoints", () => {
  const legacy = { n: 1, status: "completed" };
  const rebuilt = { n: 2, status: "completed", translationVersion: TRANSLATION_VERSION };
  assert.equal(needsTranslationVersion(legacy), true);
  assert.equal(needsTranslationVersion(rebuilt), false);
});

test("Hachimi campaigns protect every supported Gemini marker", () => {
  assert.equal(isProtectedGeminiDocument({ provider: "gemini" }), true);
  assert.equal(isProtectedGeminiDocument({ model: "gemini-3.6-flash" }), true);
  assert.equal(isProtectedGeminiDocument({ qaReviewed: true }), true);
  assert.equal(isProtectedGeminiDocument({ provider: "hachimi", model: "HachimiMT" }), false);
});

test("name-lock checkpoint survives a serialized queue restart", () => {
  const entry = stampTranslationVersion({ n: 1, status: "completed" });
  const reloaded = JSON.parse(JSON.stringify(entry));
  assert.equal(reloaded.translationVersion, TRANSLATION_VERSION);
  assert.equal(needsTranslationVersion(reloaded), false);
});
