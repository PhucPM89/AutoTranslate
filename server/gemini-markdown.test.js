"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { stripMarkdown } = require("./gemini");

// Gemini returns Markdown-decorated prose even when asked for plain text. The
// reader renders text nodes, so the asterisks were visible to readers.
test("removes the emphasis Gemini adds around chapter headings", () => {
  assert.equal(stripMarkdown("**Chương 7: Dấu vết nghi án**"), "Chương 7: Dấu vết nghi án");
  assert.equal(stripMarkdown("***rất mạnh***"), "rất mạnh");
  assert.equal(stripMarkdown("Anh ta *thì thầm* rất nhẹ."), "Anh ta thì thầm rất nhẹ.");
  assert.equal(stripMarkdown("Dùng dấu _gạch dưới_ ở đây."), "Dùng dấu gạch dưới ở đây.");
});

test("removes headings and code fences", () => {
  assert.equal(stripMarkdown("## Chương 1"), "Chương 1");
  assert.equal(stripMarkdown("###### Sâu nhất"), "Sâu nhất");
  assert.equal(stripMarkdown("```\nvăn bản\n```"), "văn bản");
});

test("leaves punctuation that only looks like Markdown", () => {
  // These are the false positives that make a naive replace() unsafe.
  assert.equal(stripMarkdown("Giá là 5 * 3 = 15."), "Giá là 5 * 3 = 15.");
  assert.equal(stripMarkdown("ten_bien_khong_doi"), "ten_bien_khong_doi");
  assert.equal(stripMarkdown("Dấu * đứng một mình."), "Dấu * đứng một mình.");
});

test("keeps paragraph breaks, which are what the reader splits on", () => {
  assert.equal(stripMarkdown("**Đoạn một**\n\n**Đoạn hai**"), "Đoạn một\n\nĐoạn hai");
  assert.equal(stripMarkdown("Một\n\nHai\n\nBa"), "Một\n\nHai\n\nBa");
});

test("handles empty and non-string input without throwing", () => {
  assert.equal(stripMarkdown(""), "");
  assert.equal(stripMarkdown(null), "");
  assert.equal(stripMarkdown(undefined), "");
});
