"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { splitText } = require("./generate-drive-audio");

test("audio generator splits only for synthesis and preserves chapter text", () => {
  const text = Array.from({ length: 80 }, (_, i) => `Đoạn ${i}. ${"Nội dung dài. ".repeat(8)}`).join("\n\n");
  const chunks = splitText(text, 500);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 500));
  assert.equal(chunks.join(" ").replace(/\s+/g, " ").trim(), text.replace(/\s+/g, " ").trim());
});
