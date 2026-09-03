"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { evaluateTranslationQuality } = require("./translation-quality");

test("quality gate accepts a plausible complete translation", () => {
  const source = "他向前走去。".repeat(50);
  const translated = "Hắn bước về phía trước. ".repeat(30);
  const result = evaluateTranslationQuality(source, translated);
  assert.equal(result.qaRequired, false);
  assert.deepEqual(result.qaIssues, []);
});

test("quality gate flags truncated, untranslated and leaked placeholders", () => {
  const source = "这是很长的一段原文。".repeat(50);
  const result = evaluateTranslationQuality(source, "张三 __TC_NAME_0001__");
  assert.equal(result.qaRequired, true);
  assert.ok(result.qaIssues.some((issue) => issue.includes("chữ Hán")));
  assert.ok(result.qaIssues.some((issue) => issue.includes("token khóa tên")));
  assert.ok(result.qaIssues.some((issue) => issue.includes("bị cụt")));
});

test("quality gate flags raw Han-Viet pinyin-style output", () => {
  const source = "这是很长的一段原文。".repeat(50);
  const output = [
    "đệ nhất lượng cảnh xa nhất đầu trát hướng lộ biên bán cái xa thân đô trắc phiên liễu quá lai",
    "khẩn tùy kỳ hậu đích cảnh xa kiến trạng liên mang cấp đả phương hướng bàn tị khai xuất sự đích xa tử",
    "ngã môn dĩ hòa hiềm nghi xa lượng phát sinh giao hỏa, nhĩ môn vụ tất bất yếu nhượng ngạt đồ thoát ly thị tuyến",
    "vương côn luân tòng kim bôi xa hậu tọa bào đáo liễu xa sương lý, giá thứ tha dĩ kinh chuẩn bị tốt"
  ].join(" ");
  const result = evaluateTranslationQuality(source, output);
  assert.equal(result.qaRequired, true);
  assert.ok(result.qaIssues.some((issue) => issue.includes("pinyin thô")));
});
