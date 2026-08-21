"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseChineseNumber,
  extractTitleFromContent,
  formatVietnameseChapterTitle
} = require("./chapter-title.js");

test("parseChineseNumber parses arabic and chinese numerals accurately", () => {
  assert.equal(parseChineseNumber("1"), 1);
  assert.equal(parseChineseNumber("2544"), 2544);
  assert.equal(parseChineseNumber("一"), 1);
  assert.equal(parseChineseNumber("十二"), 12);
  assert.equal(parseChineseNumber("九十九"), 99);
  assert.equal(parseChineseNumber("一百零五"), 105);
  assert.equal(parseChineseNumber("二千五百四十四"), 2544);
});

test("formatVietnameseChapterTitle formats sections and chapter numbers correctly", () => {
  assert.equal(formatVietnameseChapterTitle("简介", 1), "Giới thiệu");
  assert.equal(formatVietnameseChapterTitle("目录", 2), "Mục lục");
  assert.equal(formatVietnameseChapterTitle("序章", 1), "Lời mở đầu");
  assert.equal(formatVietnameseChapterTitle("第1章 落地岛国", 3), "Chương 1");
  assert.equal(formatVietnameseChapterTitle("第2章 无耻的掮客", 4), "Chương 2");
  assert.equal(formatVietnameseChapterTitle("第二千五百四十四章 大结局", 2544), "Chương 2544");
  assert.equal(formatVietnameseChapterTitle("第10回 激战", 10), "Hồi 10");
  assert.equal(formatVietnameseChapterTitle("番外 现代篇", 100), "Ngoại truyện");
});

test("extractTitleFromContent extracts translated title from first line of translation", () => {
  const textWithTitle = "Chương 1: Hạ cánh xuống đảo quốc\n\nLâm Phong mở mắt ra, nhìn xung quanh...";
  assert.equal(extractTitleFromContent(textWithTitle), "Chương 1: Hạ cánh xuống đảo quốc");

  const markdownHeader = "# Chương 2. Kẻ môi giới vô liêm sỉ\n\nTrời bắt đầu đổ tuyết lớn...";
  assert.equal(extractTitleFromContent(markdownHeader), "Chương 2. Kẻ môi giới vô liêm sỉ");

  const plainContent = "Không có tiêu đề ở dòng đầu tiên.\nChỉ là nội dung văn bản bình thường.";
  assert.equal(extractTitleFromContent(plainContent), "");
});
