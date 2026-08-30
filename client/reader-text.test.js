"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeReaderText, splitReaderParagraphs } = require("./reader-text.js");

test("normalizeReaderText adds professional spacing after punctuation and quotes", () => {
  const input = 'Tôi dừng xe:"Sao anh lại đi?"Tôi chưa kịp trả lời.Nàng nói tiếp:"Không sao!"Rồi quay đi.';
  assert.equal(
    normalizeReaderText(input),
    'Tôi dừng xe: "Sao anh lại đi?" Tôi chưa kịp trả lời. Nàng nói tiếp: "Không sao!" Rồi quay đi.'
  );
});

test("normalizeReaderText trims spaces inside quotes without breaking Vietnamese words", () => {
  const input = 'Anh nói: "  Đừng sợ ! "Tôi gật đầu."Đi thôi!"nàng đáp.Tiếng gió rít lên!Lạnh quá?Đúng vậy.';
  assert.equal(
    normalizeReaderText(input),
    'Anh nói: "Đừng sợ!" Tôi gật đầu. "Đi thôi!" nàng đáp. Tiếng gió rít lên! Lạnh quá? Đúng vậy.'
  );
});

test("splitReaderParagraphs preserves explicit breaks and splits very long stuck paragraphs", () => {
  const input = [
    "Đoạn một.Rất ngắn.",
    "",
    "Đây là một câu khá dài được lặp lại để mô phỏng bản dịch bị dính trong một dòng. ".repeat(8) +
      "Câu kết thúc ở đây. Một câu mới bắt đầu sau dấu chấm."
  ].join("\n");
  const paragraphs = splitReaderParagraphs(input);
  assert.equal(paragraphs[0], "Đoạn một. Rất ngắn.");
  assert.ok(paragraphs.length > 2);
});
