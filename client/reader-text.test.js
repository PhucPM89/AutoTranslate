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

test("splitReaderParagraphs separates glued system notifications into distinct lines", () => {
  const input = "Hiện lên:【Thắng giả có tất cả.】【Bại giả nghênh tiếp tử vong.】Trần Dịch xem xong.";
  const paragraphs = splitReaderParagraphs(input);
  assert.equal(paragraphs[0], "Hiện lên:");
  assert.equal(paragraphs[1], "【Thắng giả có tất cả.】");
  assert.equal(paragraphs[2], "【Bại giả nghênh tiếp tử vong.】");
  assert.equal(paragraphs[3], "Trần Dịch xem xong.");
});

test("splitReaderParagraphs unites broken attribute table lines and cleans quotes", () => {
  const input = [
    'Trần Dịch trừng mắt nhìn qua.【Tên gọi】:',
    'Huyết Nhãn Ô Quy【Chủng loại】:',
    'Tinh quái【Thực lực】:',
    '"Chưa nhập giai【Năng lực】:？？？"'
  ].join("\n");
  const paragraphs = splitReaderParagraphs(input);
  assert.equal(paragraphs[0], "Trần Dịch trừng mắt nhìn qua.");
  assert.equal(paragraphs[1], "【Tên gọi】: Huyết Nhãn Ô Quy");
  assert.equal(paragraphs[2], "【Chủng loại】: Tinh quái");
  assert.equal(paragraphs[3], "【Thực lực】: Chưa nhập giai");
  assert.equal(paragraphs[4], "【Năng lực】:？？？");
});

test("normalizeReaderText does not insert space after opening quote of dialogue", () => {
  const input = '"Oà — oà —" Một con búp bê kêu lên.';
  assert.equal(normalizeReaderText(input), '"Oà — oà —" Một con búp bê kêu lên.');
});

