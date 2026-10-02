"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { selectTranslationRanking, translationProgress } = require("./book-ranking");

test("book ranking excludes books with no published translation", () => {
  const ranked = selectTranslationRanking([
    { id: "raw-long", chapterCount: 5000, translatedChapters: 0 },
    { id: "translated", chapterCount: 100, translatedChapters: 1 }
  ]);
  assert.deepEqual(ranked.map((book) => book.id), ["translated"]);
});

test("book ranking is ordered by published chapters with explicit deterministic tie breakers", () => {
  const ranked = selectTranslationRanking([
    { id: "half", title: "B", chapterCount: 200, translatedChapters: 100, updatedAt: "2026-10-02" },
    { id: "quarter", title: "A", chapterCount: 400, translatedChapters: 100, updatedAt: "2026-10-03" },
    { id: "leader", chapterCount: 1000, translatedChapters: 101 }
  ]);
  assert.deepEqual(ranked.map((book) => book.id), ["leader", "half", "quarter"]);
});

test("translation progress is numeric and bounded for display", () => {
  assert.deepEqual(translationProgress({ chapterCount: 10, translatedChapters: 12 }), {
    total: 10,
    translated: 12,
    percent: 100
  });
});
