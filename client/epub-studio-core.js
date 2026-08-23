"use strict";

const DEFAULT_STUDIO_MODEL = "gemini-3.6-flash";
const STUDIO_MODELS = new Set([
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite"
]);

function normalizeStudioModel(value) {
  const model = String(value || "").trim();
  return STUDIO_MODELS.has(model) ? model : DEFAULT_STUDIO_MODEL;
}

function normalizeStudioParagraph(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\f\v]+/g, " ")
    .trim();
}

// Use leaf-like semantic blocks only. Selecting div/section together with their
// child paragraphs duplicates whole chapters in many EPUBs.
function extractStudioDocumentText(doc) {
  if (!doc?.body) return "";
  doc.querySelectorAll?.("script, style, nav, header, footer, aside, noscript").forEach((node) => node.remove());
  const semanticBlocks = Array.from(doc.body.querySelectorAll?.("h1, h2, h3, h4, h5, h6, p, blockquote, li, pre") || [])
    .filter((node) => !node.querySelector?.("p, blockquote, li, pre"));
  const source = semanticBlocks.length
    ? semanticBlocks.map((node) => normalizeStudioParagraph(node.textContent))
    : [normalizeStudioParagraph(doc.body.textContent)];
  return source
    .filter(Boolean)
    .filter((paragraph, index, list) => paragraph !== list[index - 1])
    .join("\n\n");
}

function splitStudioText(text, maxChars = 12000) {
  const limit = Math.max(1000, Number(maxChars) || 12000);
  const paragraphs = String(text || "").split(/\n{2,}/).map(normalizeStudioParagraph).filter(Boolean);
  const chunks = [];
  let current = "";

  const flush = () => {
    if (current) chunks.push(current);
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > limit) {
      flush();
      for (let offset = 0; offset < paragraph.length; offset += limit) {
        chunks.push(paragraph.slice(offset, offset + limit));
      }
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > limit) flush();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  flush();
  return chunks;
}

function buildStudioTranslationPrompt({ bookTitle = "", chapterTitle = "", content = "", part = 1, totalParts = 1 }) {
  return [
    "Bạn là dịch giả tiểu thuyết Trung Quốc sang tiếng Việt chuyên nghiệp.",
    `Dịch đầy đủ phần ${part}/${totalParts} dưới đây sang tiếng Việt tự nhiên, thống nhất với toàn chương.`,
    "QUY TẮC BẮT BUỘC:",
    "- Chuyển tên người, địa danh, môn phái, chiêu thức và cảnh giới sang âm Hán-Việt phù hợp.",
    "- Không dùng Pinyin, không để sót chữ Hán.",
    "- Giữ nguyên số liệu, ý nghĩa, hội thoại và cấu trúc đoạn.",
    "- Không tóm tắt, không tự thêm tình tiết, không thêm lời dẫn hay Markdown.",
    "- Chỉ trả về nội dung tiếng Việt của đúng phần này.",
    bookTitle ? `Tác phẩm: ${bookTitle}` : "",
    chapterTitle ? `Chương: ${chapterTitle}` : "",
    "Nội dung:",
    content
  ].filter(Boolean).join("\n");
}

function cleanStudioTranslation(value) {
  return String(value || "")
    .replace(/^```[a-z-]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function countStudioTextUnits(value) {
  const text = String(value || "");
  const hanCount = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
  const nonHanWords = text
    .replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, " ")
    .match(/[\p{L}\p{N}]+/gu)?.length || 0;
  return hanCount + nonHanWords;
}

function assessStudioTranslation(source, translation, finishReason = "STOP") {
  const output = cleanStudioTranslation(translation);
  if (!output) return { ok: false, reason: "Gemini trả về bản dịch rỗng." };
  if (String(finishReason || "").toUpperCase() === "MAX_TOKENS") {
    return { ok: false, reason: "Bản dịch bị cắt do hết giới hạn output token." };
  }
  const minimumLength = Math.max(40, Math.floor(String(source || "").length * 0.3));
  if (output.length < minimumLength) {
    return { ok: false, reason: "Bản dịch ngắn bất thường so với văn bản gốc." };
  }
  const hanCount = (output.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
  if (hanCount > 2) {
    return { ok: false, reason: `Bản dịch còn sót ${hanCount} chữ Hán.` };
  }
  return { ok: true, output };
}

function mergeStoredStudioTranslations(chapters, storedChapters) {
  const stored = new Map((storedChapters || []).map((chapter) => [Number(chapter.chapterIndex), chapter]));
  return (chapters || []).map((chapter, index) => {
    const previous = stored.get(index);
    if (!previous || previous.originalText !== chapter.originalText || previous.title !== chapter.title) return chapter;
    return {
      ...chapter,
      translatedText: previous.translatedText || "",
      translatedAt: previous.translatedAt || null,
      model: previous.model || ""
    };
  });
}

module.exports = {
  DEFAULT_STUDIO_MODEL,
  STUDIO_MODELS,
  normalizeStudioModel,
  normalizeStudioParagraph,
  extractStudioDocumentText,
  splitStudioText,
  buildStudioTranslationPrompt,
  cleanStudioTranslation,
  countStudioTextUnits,
  assessStudioTranslation,
  mergeStoredStudioTranslations
};
