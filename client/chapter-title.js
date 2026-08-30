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
  { pattern: /^(正文|作品正文|正文开始|开始阅读)$/i, title: "Nội dung chính" },
  { pattern: /^(序|序言|序章|楔子|引子)$/i, title: "Lời mở đầu" },
  { pattern: /^(尾声|终章|大结局)$/i, title: "Đoạn kết" },
  { pattern: /^(后记|完本感言|结语)$/i, title: "Hậu ký" },
  { pattern: /^(番外|番外篇)(.*)$/i, title: "Ngoại truyện" },
  { pattern: /^(作品相关|相关设定)$/i, title: "Thông tin tác phẩm" },
  { pattern: /^(上架感言|作者的话)$/i, title: "Lời tác giả" }
];

const VI_SECTION_PATTERNS = [
  { pattern: /^giới thiệu(?:\s+(?:truyện|tác phẩm|nội dung))?$/i, title: "Giới thiệu", badge: "GT" },
  { pattern: /^mục lục$/i, title: "Mục lục", badge: "ML" },
  { pattern: /^(?:tác phẩm chính văn|nội dung chính(?: của tác phẩm)?|chính văn)$/i, title: "Nội dung chính", badge: "ND" },
  { pattern: /^(?:lời mở đầu|mở đầu|lời tựa|tựa|dẫn nhập)$/i, title: "Lời mở đầu", badge: "MĐ" },
  { pattern: /^lời tác giả$/i, title: "Lời tác giả", badge: "TG" },
  { pattern: /^thông tin tác phẩm$/i, title: "Thông tin tác phẩm", badge: "TT" },
  { pattern: /^hậu ký$/i, title: "Hậu ký", badge: "HK" },
  { pattern: /^đoạn kết$/i, title: "Đoạn kết", badge: "K" }
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

function normalizeDisplayTitle(title) {
  const clean = String(title || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  for (const section of VI_SECTION_PATTERNS) {
    if (section.pattern.test(clean)) return section.title;
  }
  return clean;
}

function getSectionInfo(rawTitle, content = "") {
  const candidates = [
    String(rawTitle || "").trim(),
    extractTitleFromContent(content),
    String(content || "").trim().split(/\n+/)[0] || ""
  ].filter(Boolean);

  for (const candidate of candidates) {
    const clean = normalizeDisplayTitle(candidate);
    for (const section of VI_SECTION_PATTERNS) {
      if (section.pattern.test(clean)) return { title: section.title, badge: section.badge, isStoryChapter: false };
    }
    for (const section of COMMON_SECTIONS) {
      if (section.pattern.test(candidate)) return { title: section.title, badge: badgeForSection(section.title), isStoryChapter: false };
    }
  }
  return null;
}

function badgeForSection(title) {
  const section = VI_SECTION_PATTERNS.find((item) => item.title === title);
  return section?.badge || "•";
}

function displayIndexLabel({ rawTitle = "", content = "", fallbackNumber = 1 } = {}) {
  const section = getSectionInfo(rawTitle, content);
  return section ? section.badge : String(fallbackNumber);
}

/**
 * Translates and formats raw chapter titles into clean Vietnamese.
 */
function formatVietnameseChapterTitle(rawTitle, fallbackNumber = 1, content = "") {
  const clean = String(rawTitle || "").trim();
  const sectionInfo = getSectionInfo(clean, content);
  if (sectionInfo) return sectionInfo.title;
  if (!clean) return `Chương ${fallbackNumber}`;

  // If already in Vietnamese format, return directly
  if (/^(chương|hồi|tiết|quyển|ngoại truyện|giới thiệu|mục lục|lời mở đầu|đoạn kết|hậu ký)\b/i.test(clean)) {
    return normalizeDisplayTitle(clean);
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

function isFrontmatterSection(rawTitle, content = "") {
  const section = getSectionInfo(rawTitle, content);
  return Boolean(section && section.isStoryChapter === false);
}

function extractStoryChapterNumber(title) {
  if (!title) return null;
  const str = String(title).trim();
  const matchVi = str.match(/(?:chương|hồi|tiết|quyển)\s*(\d+)/i);
  if (matchVi) return parseInt(matchVi[1], 10);
  const matchZh = str.match(/^第\s*([0-9]+|[一二两三四五六七八九十百千万]+)\s*(章|回|节|卷)/);
  if (matchZh) return parseChineseNumber(matchZh[1]);
  return null;
}

module.exports = {
  parseChineseNumber,
  extractTitleFromContent,
  formatVietnameseChapterTitle,
  displayIndexLabel,
  getSectionInfo,
  normalizeDisplayTitle,
  isFrontmatterSection,
  extractStoryChapterNumber
};
