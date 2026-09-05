"use strict";

const SENTENCE_END = ".!?;…。！？；";
const CLOSING_QUOTES = "\"'”’»）)]}】」』";
const OPENING_QUOTES = "\"'“‘«（([{【「『";

function normalizeReaderLine(value) {
  let text = String(value || "").normalize("NFC");
  if (!text.trim()) return "";

  text = text
    .replace(/[\u00a0\u3000\u2000-\u200b\u2028\u2029]/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/[ \t]+([,.;:!?…，。！？；：])/g, "$1")
    .replace(/([】」』)\]}])[ \t]+([,.;:!?…，。！？；：])/gu, "$1$2")
    .replace(/([,.;:!?…，。！？；：])(?=[^\s\d,.;:!?…，。！？；："'”’»）)\]}】」』])/g, "$1 ")
    .replace(/([.!?…])(["“‘«【「『])(?=\p{L})/gu, "$1 $2")
    .replace(/([:：])[ \t]*(["“‘«【「『])/g, "$1 $2")
    .replace(/(["“‘«【「『])[ \t]+/g, "$1")
    .replace(/[ \t]+(["”’»】」』])/g, "$1")
    .replace(/([?!。！？…])[ \t]*(["”’»】」』])(?=\S)/g, "$1$2 ")
    .replace(/(?<=[.!?…，。！？；：\p{L}\p{N}—\-])(["”’»])(?=[\p{L}\p{N}])/gu, "$1 ")
    .replace(/([:：])[ \t]*(["“‘«【「『])[ \t]*/g, "$1 $2")
    .replace(/([.。])[ \t]*(["“‘«【「『])[ \t]*(?=\p{L})/gu, "$1 $2")
    .replace(/([!?！？…])[ \t]*(["”’»】」』])[ \t]*(?=\p{L})/gu, "$1$2 ")
    .replace(/[ \t]+([,.;:!?…])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  // Strip orphaned closing brackets at start of line
  text = text.replace(/^[】」』)\]}]+[ \t]*/, "");

  // Clean quote spacing: remove space after opening quote and before closing quote
  text = text.replace(/(^|[\s(])(["“‘«【「『])\s+([^\s])/gu, "$1$2$3");
  text = text.replace(/([^\s])\s+(["”’»】」』])(?=[\s.,;:!?…。！？；：)]|$)/gu, "$1$2");

  // Strip extraneous quotes around attribute values like 【Thực lực】: "Chưa nhập giai..."
  text = text.replace(/^(【[^】]+】[:：]?)[ \t]*["“]([^"”]+)["”]?$/, "$1 $2");
  text = text.replace(/^(【[^】]+】[:：]?.*?)[ \t]*["”]+$/, "$1");

  // Clean unclosed/mismatched quote inside brackets: 【Gợi ý: "Khuyến khích...】 -> 【Gợi ý: Khuyến khích...】
  text = text.replace(/^(【[^】\n]+[:：])[ \t]*["“]([^"”]+)["”]?[ \t]*】$/, "$1 $2】");

  // Fix dialogue + narrative trailing quote: "Oà — oà —" Một con búp bê... của Trần Dịch."
  const dialogueNarrativeQuote = text.match(/^("[^"]+")[ \t]+([^"]+)"$/);
  if (dialogueNarrativeQuote) {
    text = dialogueNarrativeQuote[1] + " " + dialogueNarrativeQuote[2];
  }

  // Fix stray closing quote at end of narrative line that has no opening quote
  const quoteChars = text.match(/["“”]/g) || [];
  if (quoteChars.length % 2 === 1 && /["”]$/.test(text) && !/^[“"]/.test(text)) {
    text = text.replace(/([.!?…])[ \t]*["”]+$/u, "$1");
  }

  // Strip trailing unclosed parenthesis at end of stat or title line
  text = text.replace(/([a-zA-Z0-9à-ỹÀ-Ỹ])[ \t]*[(（][ \t]*$/gu, "$1");

  return text.normalize("NFC");
}

function preprocessSystemBlocks(raw) {
  let text = String(raw || "").replace(/\r\n?/g, "\n");

  // Reconnect split parenthetical values like (Mã số:\n2998-633-4228)
  text = text.replace(/([(（][^)\uff09\n]*[:：])[\s\n]+([0-9a-zA-ZÀ-ỹ-]+[)\uff09])/gu, "$1 $2");

  // Separate evaluation blocks attached to end of stat: ...) (Đánh giá:\n"...")
  text = text.replace(/([^\n])[ \t]*[(（]Đánh giá[:：][\s\n]*/gu, "$1\n\n【Đánh giá】: ");
  text = text.replace(/^[ \t]*[(（]Đánh giá[:：][\s\n]*/gmu, "【Đánh giá】: ");
  text = text.replace(/(["”])\)[ \t]*$/gmu, "$1");

  // Normalize specific awkward phrasing
  text = text.replace(/Sát Khí Bám Sát Khí/g, "Yểm Sát Khí");
  text = text.replace(/Sát khí bám sát khí/g, "Yểm Sát Khí");
  text = text.replace(/sát khí bám sát khí/g, "yểm sát khí");
  text = text.replace(/Sát Khí Phụ Trám/g, "Yểm Sát Khí");
  text = text.replace(/Sát khí phụ trám/g, "Yểm Sát Khí");
  text = text.replace(/sát khí phụ trám/g, "yểm sát khí");
  text = text.replace(/bám sát khí lên vũ khí/gi, "phủ sát khí lên vũ khí");
  text = text.replace(/Nội dung tâm can của Trần Dịch lúc này hoàn toàn sụp đổ/gi, "Nội tâm Trần Dịch lúc này gần như sụp đổ");

  // 1. Separate glued system prompts 【...】【...】 or colon/period before 【
  text = text
    .replace(/(】)[ \t]*(【)/g, "$1\n\n$2")
    .replace(/([:：.!?…])[ \t]*(【)/g, "$1\n\n$2")
    .replace(/(】)[ \t]*([^\s\d,.;:!?…，。！？；："'”’»）)\]}】])/gu, "$1\n\n$2");

  // 2. Reconnect unclosed bracket headers like 【Gợi ý: \n "Khuyến khích...】
  let lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const reconnected = [];
  for (let i = 0; i < lines.length; i++) {
    let curr = lines[i];
    if (/^【[^】\n]+[:：]?$/.test(curr) && i + 1 < lines.length && !lines[i + 1].startsWith("【")) {
      const next = lines[i + 1].trim();
      if (next.includes("】")) {
        // Line i was an unclosed bracket header like 【Gợi ý:
        curr = curr + " " + next;
        i++;
      }
    } else if (/[(（][^)\uff09]*$/.test(curr) && i + 1 < lines.length && !lines[i + 1].startsWith("【")) {
      const next = lines[i + 1].trim();
      if (/[)\uff09]/.test(next)) {
        curr = curr + " " + next;
        i++;
      }
    }
    if (curr.startsWith("【Đánh giá】:") && /["”]\)$/.test(curr)) {
      curr = curr.replace(/["”]\)$/, '"');
    }
    reconnected.push(curr);
  }
  lines = reconnected;

  // 3. Fix offset table lines where label was split from value
  const fixed = [];
  for (let i = 0; i < lines.length; i++) {
    let curr = lines[i];

    // If line ends with a label like "Trần Dịch... 【Tên gọi】:"
    const labelAtEndMatch = curr.match(/^(.*?)[ \t]*(【[^】\n]+】[:：]?)$/);
    if (labelAtEndMatch && labelAtEndMatch[1]) {
      fixed.push(labelAtEndMatch[1].trim());
      curr = labelAtEndMatch[2].trim();
    }

    // If curr is a label like "【Tên gọi】:"
    if (/^【[^】]+】[:：]?$/.test(curr)) {
      if (i + 1 < lines.length && !lines[i + 1].startsWith("【")) {
        let nextVal = lines[i + 1].trim();
        const nextLabelMatch = nextVal.match(/^(.*?)[ \t]*(【[^】\n]+】[:：]?.*)$/);
        if (nextLabelMatch) {
          fixed.push(curr + " " + nextLabelMatch[1].trim());
          lines[i + 1] = nextLabelMatch[2].trim();
        } else {
          fixed.push(curr + " " + nextVal);
          i++;
        }
        continue;
      }
    }

    fixed.push(curr);
  }

  // Again separate any trailing narrative that was reconnected with a bracket
  return fixed.join("\n\n").replace(/(】)[ \t]*([^\s\d,.;:!?…，。！？；："'”’»）)\]}】])/gu, "$1\n\n$2");
}

function normalizeReaderText(value) {
  if (!value) return "";
  const preprocessed = preprocessSystemBlocks(value);
  const lines = preprocessed.replace(/\r\n?/g, "\n").split(/\n+/);
  const normalizedLines = lines.map((line) => normalizeReaderLine(line)).filter(Boolean);
  return normalizedLines.join("\n\n");
}

function splitReaderParagraphs(value) {
  if (!value) return [];
  const preprocessed = preprocessSystemBlocks(value);
  const lines = preprocessed.replace(/\r\n?/g, "\n").split(/\n+/);
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
  normalizeReaderLine,
  normalizeReaderText,
  preprocessSystemBlocks,
  splitReaderParagraphs
};
