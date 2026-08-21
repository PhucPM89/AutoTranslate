"use strict";

// Trạm Chữ — Chapter title translation & formatting module.
// Converts raw Chinese chapter headings (e.g. 简介, 目录, 第1章 落地岛国) into
// clean, localized Vietnamese chapter labels and extracts translated titles.

const CHINESE_NUMS = {
  "零": 0, "〇": 0, "一": 1, "二": 2, "两": 2,
  "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
  "八": 8, "九": 9
};

const COMMON_SECTIONS = [
  { pattern: /^(简介|作品简介|内容简介)$/i, title: "Giới thiệu" },
  { pattern: /^(目录|章节目录)$/i, title: "Mục lục" },
  { pattern: /^(序|序言|序章|楔子|引子)$/i, title: "Lời mở đầu" },
  { pattern: /^(尾声|终章|大结局)$/i, title: "Đoạn kết" },
  { pattern: /^(后记|完本感言|结语)$/i, title: "Hậu ký" },
  { pattern: /^(番外|番外篇)(.*)$/i, title: "Ngoại truyện" },
  { pattern: /^(作品相关|相关设定)$/i, title: "Thông tin tác phẩm" },
  { pattern: /^(上架感言|作者的话)$/i, title: "Lời tác giả" }
];

function parseChineseNumber(str) {
  if (!str) return NaN;
  if (/^\d+$/.test(str)) return parseInt(str, 10);

  let total = 0;
  let current = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (CHINESE_NUMS[char] !== undefined) {
      current = CHINESE_NUMS[char];
    } else if (char === "十") {
      total += (current === 0 ? 1 : current) * 10;
      current = 0;
    } else if (char === "百") {
      total += current * 100;
      current = 0;
    } else if (char === "千") {
      total += current * 1000;
      current = 0;
    } else if (char === "万") {
      total = (total + current) * 10000;
      current = 0;
    }
  }
  return total + current;
}

/**
 * Extracts a translated chapter title if the first line of content contains one.
 */
function extractTitleFromContent(content) {
  if (!content || typeof content !== "string") return "";
  const lines = content.trim().split("\n");
  const firstLine = lines[0]?.trim().replace(/^[#*_\s]+|[#*_\s]+$/g, "") || "";

  if (!firstLine || firstLine.length > 120) return "";

  if (
    /^(chương|hồi|tiết|quyển|ngoại truyện|giới thiệu|mục lục|lời mở đầu|đoạn kết|hậu ký|phần)\b/i.test(firstLine)
  ) {
    return firstLine;
  }
  return "";
}

/**
 * Translates and formats raw chapter titles into clean Vietnamese.
 */
function formatVietnameseChapterTitle(rawTitle, fallbackNumber = 1) {
  const clean = String(rawTitle || "").trim();
  if (!clean) return `Chương ${fallbackNumber}`;

  // If already in Vietnamese format, return directly
  if (/^(chương|hồi|tiết|quyển|ngoại truyện|giới thiệu|mục lục|lời mở đầu|đoạn kết|hậu ký)\b/i.test(clean)) {
    return clean;
  }

  // Check common fixed sections
  for (const { pattern, title } of COMMON_SECTIONS) {
    if (pattern.test(clean)) {
      return title;
    }
  }

  // Match Chinese chapter patterns: 第1章, 第一章, 第12回, etc.
  const chapterMatch = clean.match(/^第\s*([0-9]+|[一二两三四五六七八九十百千万]+)\s*(章|回|节|卷)(.*)$/);
  if (chapterMatch) {
    const num = parseChineseNumber(chapterMatch[1]) || fallbackNumber;
    const type = chapterMatch[2] === "回" ? "Hồi" : chapterMatch[2] === "节" ? "Tiết" : chapterMatch[2] === "卷" ? "Quyển" : "Chương";
    return `${type} ${num}`;
  }

  // Pure number or fallback
  if (/^\d+$/.test(clean)) {
    return `Chương ${clean}`;
  }

  return `Chương ${fallbackNumber}`;
}

module.exports = {
  parseChineseNumber,
  extractTitleFromContent,
  formatVietnameseChapterTitle
};
