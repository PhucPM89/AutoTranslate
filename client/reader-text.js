"use strict";

const SENTENCE_END = ".!?;:…。！？；：";
const CLOSING_QUOTES = "\"'”’»）)]}";
const OPENING_QUOTES = "\"'“‘«（([{";

function normalizeReaderLine(value) {
  let text = String(value || "").normalize("NFC");
  if (!text.trim()) return "";

  text = text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/[ \t]+([,.;:!?…，。！？；：])/g, "$1")
    .replace(/([,.;:!?…，。！？；：])(?=[^\s\d,.;:!?…，。！？；："'”’»）)\]}])/g, "$1 ")
    .replace(/([.!?…])(["“‘«])(?=\p{L})/gu, "$1 $2")
    .replace(/([:：])[ \t]*(["“‘«])/g, "$1 $2")
    .replace(/(["“‘«])[ \t]+/g, "$1")
    .replace(/[ \t]+(["”’»])/g, "$1")
    .replace(/([?!。！？…])[ \t]*(["”’»])(?=\S)/g, "$1$2 ")
    .replace(/(["”’»])(?=[\p{L}\p{N}])/gu, "$1 ")
    .replace(/([:：])[ \t]*(["“‘«])[ \t]*/g, "$1 $2")
    .replace(/([.。])[ \t]*(["“‘«])[ \t]*(?=\p{L})/gu, "$1 $2")
    .replace(/([!?！？…])[ \t]*(["”’»])[ \t]*(?=\p{L})/gu, "$1$2 ")
    .replace(/[ \t]+([,.;:!?…])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return text.normalize("NFC");
}

function normalizeReaderText(value) {
  if (!value) return "";
  const lines = String(value).replace(/\r\n?/g, "\n").split(/\n+/);
  const normalizedLines = lines.map((line) => normalizeReaderLine(line)).filter(Boolean);
  return normalizedLines.join("\n\n");
}

function splitReaderParagraphs(value) {
  if (!value) return [];
  const lines = String(value).replace(/\r\n?/g, "\n").split(/\n+/);
  const out = [];

  for (const line of lines) {
    const normalized = normalizeReaderLine(line);
    if (!normalized) continue;
    out.push(...splitLongParagraph(normalized));
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
