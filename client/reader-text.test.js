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
  assert.equal(paragraphs[4], "【Năng lực】: ???");
});

test("normalizeReaderText does not insert space after opening quote of dialogue", () => {
  const input = '"Oà — oà —" Một con búp bê kêu lên.';
  assert.equal(normalizeReaderText(input), '"Oà — oà —" Một con búp bê kêu lên.');
});

test("splitReaderParagraphs reconnects broken parentheticals like (Mã số:\\n2998...)", () => {
  const input = [
    "【Họ tên】: Trần Dịch (Mã số:",
    "2998-633-4228)",
    "【Thể chất】: Tam giai viên mãn ("
  ].join("\n");
  const paragraphs = splitReaderParagraphs(input);
  assert.equal(paragraphs[0], "【Họ tên】: Trần Dịch (Mã số: 2998-633-4228)");
  assert.equal(paragraphs[1], "【Thể chất】: Tam giai viên mãn");
});

test("splitReaderParagraphs normalizes awkward phrases and separates evaluation blocks", () => {
  const input = [
    '【Năng lượng】: 10(Đánh giá:',
    '"Giao diện tân thủ hoàn toàn vô dụng...")',
    'Trong lòng thầm niệm: "Sát khí bám sát khí!"',
    'Nội dung tâm can của Trần Dịch lúc này hoàn toàn sụp đổ.'
  ].join("\n");
  const paragraphs = splitReaderParagraphs(input);
  assert.equal(paragraphs[0], "【Năng lượng】: 10");
  assert.equal(paragraphs[1], "【Đánh giá】: Giao diện tân thủ hoàn toàn vô dụng...");
  assert.equal(paragraphs[2], 'Trong lòng thầm niệm: "Yểm Sát Khí!"');
  assert.equal(paragraphs[3], "Nội tâm Trần Dịch lúc này gần như sụp đổ.");
});

test("splitReaderParagraphs converts Chinese punctuation and separates glued attribute cards", () => {
  const input = [
    "【Thực lực】:？？？ 【Năng lực】:？？？",
    'Người ta không Nã Xuất Lai bán.',
    '"Bốp ——"Cành cây đang bén lửa bay tới.'
  ].join("\n");
  const paragraphs = splitReaderParagraphs(input);
  assert.equal(paragraphs[0], "【Thực lực】: ???");
  assert.equal(paragraphs[1], "【Năng lực】: ???");
  assert.equal(paragraphs[2], "Người ta không mang ra bán.");
  assert.equal(paragraphs[3], '"Bốp ——" Cành cây đang bén lửa bay tới.');
});

test("splitReaderParagraphs handles quoted clauses with commas and glued dialogues", () => {
  const input = [
    'nghe đến câu"Người ta có gì, muội cũng phải có cái đó", liền không kìm được',
    'thông báo"Giao dịch thành công, đá +1"hiện lên.',
    '"Bùa_nhẹ_thân. jpg"Hàng ngon đấy, ngươi vớ ở đâu ra thế?',
    '【Năng lực】: Thạch hóa độc dịch"Tổng cộng có ba con, thực lực không mạnh'
  ].join("\n");
  const paragraphs = splitReaderParagraphs(input);
  assert.equal(paragraphs[0], 'nghe đến câu "Người ta có gì, muội cũng phải có cái đó", liền không kìm được');
  assert.equal(paragraphs[1], 'thông báo "Giao dịch thành công, đá +1" hiện lên.');
  assert.equal(paragraphs[2], '"Bùa_nhẹ_thân. jpg" Hàng ngon đấy, ngươi vớ ở đâu ra thế?');
  assert.equal(paragraphs[3], '【Năng lực】: Thạch hóa độc dịch');
  assert.equal(paragraphs[4], '"Tổng cộng có ba con, thực lực không mạnh');
});
