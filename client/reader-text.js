"use strict";

const SENTENCE_END = ".!?;:…。！？；：";
const CLOSING_QUOTES = "\"'”’»）)]}";
const OPENING_QUOTES = "\"'“‘«（([{";

function normalizeReaderText(value) {
  let text = String(value || "").normalize("NFC");
  if (!text.trim()) return "";

  text = text
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([,.;:!?…，。！？；：])/g, "$1")
    .replace(/([,.;:!?…，。！？；：])(?=[^\s\d,.;:!?…，。！？；："'”’»）)\]}])/g, "$1 ")
    .replace(/([:：])\s*(["“‘«])/g, "$1 $2")
    .replace(/([?!。！？…])\s*(["”’»])(?=\S)/g, "$1$2 ")
    .replace(/\s+([,.;:!?…])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return text.normalize("NFC");
}

function splitReaderParagraphs(value) {
  const text = normalizeReaderText(value);
  if (!text) return [];
  const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const out = [];

  for (const paragraph of paragraphs) {
    out.push(...splitLongParagraph(paragraph));
  }
  return out;
}

function splitLongParagraph(paragraph) {
  if (paragraph.length <= 700) return [paragraph];
  const parts = [];
  let start = 0;

  for (let i = 0; i < paragraph.length; i += 1) {
    const ch = paragraph[i];
    if (!SENTENCE_END.includes(ch)) continue;

    let end = i + 1;
    while (end < paragraph.length && CLOSING_QUOTES.includes(paragraph[end])) end += 1;
    const next = paragraph[end];
    const currentLength = end - start;
    if (currentLength >= 320 && (!next || next === " " || OPENING_QUOTES.includes(next) || isLikelySentenceStart(next))) {
      parts.push(paragraph.slice(start, end).trim());
      while (paragraph[end] === " ") end += 1;
      start = end;
      i = end;
    }
  }

  const tail = paragraph.slice(start).trim();
  if (tail) parts.push(tail);
  return parts.length ? parts : [paragraph];
}

function isLikelySentenceStart(ch) {
  return /[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠ-Ỵ0-9]/.test(ch || "");
}

module.exports = {
  normalizeReaderText,
  splitReaderParagraphs
};
