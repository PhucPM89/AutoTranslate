"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeStoryBible, appendStoryContext, mergeApprovedTranslationMemory } = require("./story-bible");

test("story bible merges aliases while preserving known gender", () => {
  const first = mergeStoryBible(null, { characters: [{ name: "Lý Minh", gender: "male", aliases: ["A Minh"] }] }, { bookId: "b", chapterNumber: 1, evidenceText: "Lý Minh xuất hiện" });
  const second = mergeStoryBible(first, { characters: [{ name: "Lý Minh", gender: "unknown", aliases: ["Minh ca"] }] }, { bookId: "b", chapterNumber: 2, evidenceText: "Minh ca chính là Lý Minh" });
  assert.equal(second.characters[0].gender, "male");
  assert.deepEqual(second.characters[0].aliases, ["A Minh", "Minh ca"]);
});

test("story context stays bounded", () => {
  let context = null;
  for (let chapterNumber = 1; chapterNumber <= 10; chapterNumber += 1) context = appendStoryContext(context, { chapterNumber, summary: `Chương ${chapterNumber}`, limit: 3 });
  assert.deepEqual(context.chapters.map((item) => item.chapterNumber), [8, 9, 10]);
});

test("book TM accepts only pairs evidenced by approved source and translation", () => {
  const tm = mergeApprovedTranslationMemory(null, [{ zh: "青云门", vi: "Thanh Vân Môn" }, { zh: "捏造", vi: "Không có" }], {
    chapterNumber: 2, source: "他来自青云门。", translation: "Hắn đến từ Thanh Vân Môn."
  });
  assert.equal(tm.entries.length, 1);
  assert.equal(tm.entries[0].approved, true);
});
