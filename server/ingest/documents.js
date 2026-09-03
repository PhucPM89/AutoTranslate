"use strict";

const { LAYOUT } = require("../storage/keys");
const { loadBase } = require("../convert");
const { formatNovelDialogueAndQuotes } = require("../reflection-engine");
const { repairTranslationTextArtifacts } = require("../translation-artifacts");

// Shapes of the two JSON documents the reader fetches straight from the CDN.
// Kept deliberately small: no HTML, no EPUB metadata the reader never reads.

const SCHEMA_VERSION = 1;

function cleanChapterTitle(title, chapterNumber) {
  const fallback = `Chương ${chapterNumber}`;
  let clean = String(title || "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;

  clean = convertChineseChapterTitle(clean, chapterNumber);

  const quotedBody = clean.match(/^(Chương\s+\d+\s*[:：]\s*[^"“”]{2,80}\p{L}[^"“”]{0,80})\s*["“]/iu);
  if (quotedBody) clean = quotedBody[1].trim();

  if (clean.length > 160 && !/^Chương\s+\d+\s*[:：]/iu.test(clean)) {
    return fallback;
  }

  if (clean.length > 160) {
    const chapterMatch = clean.match(/^(Chương\s+\d+\s*[:：]\s*[^"“”.!?。！？]{1,80})/iu);
    if (chapterMatch) {
      clean = chapterMatch[1].trim();
    } else {
      clean = clean.slice(0, 140).replace(/\s+\S*$/, "").trim();
    }
  }
  return clean || fallback;
}

function titleCaseHanViet(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toLocaleLowerCase("vi-VN").replace(/\p{L}/u, (char) => char.toLocaleUpperCase("vi-VN")))
    .join(" ");
}

function convertHanSuffix(value) {
  const text = String(value || "")
    .replace(/[《》「」『』]/g, "")
    .replace(/[“”]/g, '"')
    .trim();
  if (!text) return "";
  const { hanvietChars } = loadBase();
  return text
    .replace(/\p{Script=Han}+/gu, (match) => match.split("").map((ch) => hanvietChars[ch]?.hv || ch).join(" "))
    .replace(/"/g, ' " ')
    .replace(/\s*([,.;:!?，。；：！？])\s*/g, " $1 ")
    .replace(/\s+/g, " ")
    .replace(/"\s+([^"]*?)\s+"/g, '"$1"')
    .trim();
}

function convertChineseChapterTitle(title, chapterNumber) {
  const clean = String(title || "").replace(/\s+/g, " ").trim();
  if (!/[\u4e00-\u9fa5]/u.test(clean)) return clean;
  if (/^(Chương|Hồi|Tiết|Quyển)\s+\d+\b/iu.test(clean)) return clean;

  for (const item of [
    [/^(简介|作品简介|内容简介)$/iu, "Giới thiệu"],
    [/^(目录|章节目录)$/iu, "Mục lục"],
    [/^(正文|作品正文|正文开始|开始阅读)$/iu, "Nội dung chính"],
    [/^(序|序言|序章|楔子|引子)$/iu, "Lời mở đầu"],
    [/^(尾声|终章|大结局)$/iu, "Đoạn kết"],
    [/^(后记|完本感言|结语)$/iu, "Hậu ký"]
  ]) {
    if (item[0].test(clean)) return item[1];
  }

  const chapterMatch = clean.match(/^第\s*([0-9]+|[一二两三四五六七八九十百千万零〇]+)\s*(章|回|节|卷)\s*(.*)$/u);
  const bareChapterMatch = clean.match(/^([0-9]+)\s*(章|回|节|卷)\s*(.*)$/u);
  const matchedChapter = chapterMatch || bareChapterMatch;
  if (matchedChapter) {
    const label = matchedChapter[2] === "回" ? "Hồi" : matchedChapter[2] === "节" ? "Tiết" : matchedChapter[2] === "卷" ? "Quyển" : "Chương";
    const n = parseChineseNumber(matchedChapter[1]) || chapterNumber;
    const suffix = titleCaseHanViet(convertHanSuffix(matchedChapter[3]));
    return suffix ? `${label} ${n}: ${suffix}` : `${label} ${n}`;
  }

  const converted = titleCaseHanViet(convertHanSuffix(clean));
  return converted || clean;
}

function parseChineseNumber(str) {
  const value = String(str || "");
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  const digits = { "零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
  let total = 0;
  let current = 0;
  for (const ch of value) {
    if (digits[ch] !== undefined) {
      current = digits[ch];
    } else if (ch === "十") {
      total += (current || 1) * 10;
      current = 0;
    } else if (ch === "百") {
      total += (current || 1) * 100;
      current = 0;
    } else if (ch === "千") {
      total += (current || 1) * 1000;
      current = 0;
    } else if (ch === "万") {
      total = (total + current) * 10000;
      current = 0;
    }
  }
  return total + current;
}

function extractLeadingContentTitle(content) {
  const lines = String(content || "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .split("\n")
    .map((line) => line.trim().replace(/^[#*_\s]+|[#*_\s]+$/g, ""))
    .filter(Boolean);
  if (lines.length < 2) return "";
  const first = lines[0];
  if (!first || first.length > 100 || /[\u4e00-\u9fa5]/u.test(first)) return "";
  if (/^(chương|hồi|tiết|quyển|ngoại truyện|giới thiệu|mục lục|lời mở đầu|đoạn kết|hậu ký|phần)\b/i.test(first)) {
    return first;
  }
  const words = first.split(/\s+/).filter(Boolean).length;
  if (words <= 9 && !/[,.!?;，。！？；]$/.test(first)) return first;
  return "";
}

function titleNeedsRescue(title, chapterNumber) {
  const clean = String(title || "").trim();
  return !clean || /^Chương\s+\d+$/iu.test(clean) || /[\u4e00-\u9fa5]/u.test(clean) || clean === `Chương ${chapterNumber}`;
}

function deriveChapterTitle(title, chapterNumber, content = "") {
  const clean = cleanChapterTitle(title, chapterNumber);
  if (!titleNeedsRescue(clean, chapterNumber)) return clean;
  const leadingTitle = extractLeadingContentTitle(content);
  if (!leadingTitle) return clean;
  if (/^(chương|hồi|tiết|quyển|ngoại truyện|giới thiệu|mục lục|lời mở đầu|đoạn kết|hậu ký|phần)\b/i.test(leadingTitle)) {
    return cleanChapterTitle(leadingTitle, chapterNumber);
  }
  const prefix = clean.match(/^(Chương\s+\d+\s*[:：])\s*/iu)?.[1] || `Chương ${chapterNumber}:`;
  return cleanChapterTitle(`${prefix} ${leadingTitle}`, chapterNumber);
}

function stripTitleFromContent(content, title, chapterNumber) {
  let clean = String(content || "").replace(/\r\n?/g, "\n").trim();
  if (!clean) return clean;

  const leadingTitle = extractLeadingContentTitle(clean);
  const candidates = [
    String(title || "").trim(),
    cleanChapterTitle(title, chapterNumber),
    deriveChapterTitle(title, chapterNumber, clean),
    leadingTitle,
    `Chương ${chapterNumber}`
  ]
    .filter(Boolean)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .sort((a, b) => b.length - a.length);

  for (const candidate of candidates) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^\\s*${escaped}\\s*(?:\\n+|(?=[A-Z\"'“‘]))`, "iu");
    clean = clean.replace(re, "").trim();
  }

  clean = clean.replace(/^\s*Chương\s+\d+\s*[:：][^\n]{1,140}\n+/iu, "").trim();

  clean = clean
    .replace(/^\s*(?:python|py|javascript|typescript|json|markdown|text)\s*=?\s*(?=["'“]|Chương\s+\d+)/iu, "")
    .trim();
  return clean;
}

// translationStatus values, weakest to strongest content:
//   pending   — not yet processed; reader sees the raw source text.
//   convert   — offline Hán-Việt convert; readable Vietnamese, exact terminology,
//               produced instantly at ingest so no chapter is ever unreadable.
//   completed — LLM translation; the fluent tier that upgrades convert on demand.
// `convert` and `completed` both supply a `translation`; `pending` does not.
function buildChapterDocument({
  bookId,
  revision,
  chapter,
  translation,
  translationStatus,
  convertVersion,
  provider,
  model,
  translationVersion,
  qaReviewed,
  qaStatus,
  qaIssuesFixed,
  qaRequired,
  qaIssues,
  qualityScore
}) {
  if (!bookId) throw new Error("Chapter document cần bookId.");
  const status = translationStatus || (translation ? "completed" : "pending");
  const hasRendered = translation && (status === "completed" || status === "convert");
  const rawContent = hasRendered ? translation : chapter.content;
  const title = hasRendered
    ? deriveChapterTitle(chapter.title, chapter.chapterNumber, rawContent)
    : cleanChapterTitle(chapter.title, chapter.chapterNumber);
  const stripped = hasRendered ? stripTitleFromContent(rawContent, title, chapter.chapterNumber) : rawContent;
  const repaired = hasRendered ? repairTranslationTextArtifacts(stripped, { title }) : { text: stripped };
  const content = hasRendered ? formatNovelDialogueAndQuotes(repaired.text) : repaired.text;
  const doc = {
    schema: SCHEMA_VERSION,
    bookId,
    revision,
    chapterNumber: chapter.chapterNumber,
    title,
    // `content` is always what the reader should display. A not-yet-translated
    // chapter still gets readable text (source or convert) plus a status, so the
    // page is never empty and never has to call an API to find out why.
    content,
    translationStatus: status,
    characters: content ? content.length : 0,
    updatedAt: new Date().toISOString()
  };
  if (provider) doc.provider = provider;
  if (model) doc.model = model;
  if (translationVersion) doc.translationVersion = translationVersion;
  if (qaReviewed !== undefined) doc.qaReviewed = qaReviewed;
  if (qaStatus) doc.qaStatus = qaStatus;
  if (qaIssuesFixed) doc.qaIssuesFixed = qaIssuesFixed;
  if (qaRequired !== undefined) doc.qaRequired = qaRequired;
  if (Array.isArray(qaIssues) && qaIssues.length) doc.qaIssues = qaIssues;
  if (qualityScore !== undefined) doc.qualityScore = qualityScore;
  // Stamp convert output with the engine version, so a later backfill can tell a
  // stale convert from a current one and re-render only what changed.
  if (status === "convert" && convertVersion != null) doc.convertVersion = convertVersion;
  return doc;
}

function buildOriginalDocument({ bookId, revision, chapter }) {
  return {
    schema: SCHEMA_VERSION,
    bookId,
    revision,
    chapterNumber: chapter.chapterNumber,
    title: cleanChapterTitle(chapter.title, chapter.chapterNumber),
    content: chapter.content,
    characters: chapter.content.length
  };
}

// The index is the only mutable reader-facing document, so it stays small and is
// purged on publish. It carries just enough for the table of contents and for the
// reader to build a chapter URL without another round trip.
function buildBookIndex({ book, revision, chapters, publicUrlFor }) {
  // A per-chapter URL string would dominate this file (about 40% of it for a
  // 1,400-chapter novel) and it is fully derivable, so the index ships one
  // template and the reader substitutes the chapter number.
  const template = publicUrlFor
    ? publicUrlFor(LAYOUT.chapter(book.id, revision, 1)).replace(/\/1\.json$/, "/{n}.json")
    : LAYOUT.chapter(book.id, revision, 1).replace(/\/1\.json$/, "/{n}.json");
  return {
    schema: SCHEMA_VERSION,
    bookId: book.id,
    revision,
    chapterUrlTemplate: template,
    title: book.title,
    author: book.author || "",
    genre: book.genre || "",
    status: book.status || "",
    description: book.description || "",
    cover: book.cover || "",
    // Provenance travels with the index because index.json is the canonical
    // per-book document. Leaving it out meant anything rebuilding a database row
    // from the index - the translation worker's safety net, the storage fallback -
    // recreated the book as an admin upload with no source id, and the crawler
    // then stopped recognising its own novels.
    source: book.source || "admin",
    sourceId: book.sourceId ? String(book.sourceId) : "",
    sourceUrl: book.sourceUrl || "",
    totalChapters: chapters.length,
    translatedChapters: chapters.filter((c) => c.translationStatus === "completed").length,
    updatedAt: new Date().toISOString(),
    chapters: chapters.map((chapter) => ({
      n: chapter.chapterNumber != null ? chapter.chapterNumber : chapter.n,
      title: cleanChapterTitle(chapter.title, chapter.chapterNumber != null ? chapter.chapterNumber : chapter.n),
      status: chapter.translationStatus || chapter.status || "pending",
      ...(chapter.provider ? { provider: chapter.provider } : {}),
      ...(chapter.model ? { model: chapter.model } : {}),
      ...(chapter.qaReviewed !== undefined ? { qaReviewed: chapter.qaReviewed } : {}),
      ...(chapter.qaStatus ? { qaStatus: chapter.qaStatus } : {}),
      ...(chapter.qaRequired !== undefined ? { qaRequired: chapter.qaRequired } : {}),
      ...(chapter.qualityScore !== undefined ? { qualityScore: chapter.qualityScore } : {})
    }))
  };
}

function chapterKey(bookId, revision, chapterNumber) {
  return LAYOUT.chapter(bookId, revision, chapterNumber);
}

function originalKey(bookId, revision, chapterNumber) {
  return LAYOUT.chapterOriginal(bookId, revision, chapterNumber);
}

function indexKey(bookId) {
  return LAYOUT.bookIndex(bookId);
}

// Mirrors chapterUrlTemplate so the reader and the ingest agree on one rule.
function chapterUrlFromTemplate(template, chapterNumber) {
  return String(template || "").replace("{n}", String(chapterNumber));
}

module.exports = {
  SCHEMA_VERSION,
  buildChapterDocument,
  buildOriginalDocument,
  buildBookIndex,
  chapterKey,
  originalKey,
  indexKey,
  chapterUrlFromTemplate,
  cleanChapterTitle,
  deriveChapterTitle,
  extractLeadingContentTitle,
  convertChineseChapterTitle,
  stripTitleFromContent
};
