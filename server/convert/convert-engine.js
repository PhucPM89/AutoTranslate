"use strict";

// Deterministic Chinese -> Vietnamese "convert" engine.
//
// This is the zero-cost coverage tier: no API, no quota, no network. It renders
// every chapter as a Hán-Việt convert the instant it is ingested, so no chapter
// is ever unreadable while the LLM tier catches up on the chapters people
// actually open. It is NOT a fluent translation — it is the QuickTranslator-style
// convert that Vietnamese web-novel readers have used for years: word order stays
// Chinese, terminology is exact and perfectly consistent across thousands of
// chapters.
//
// Two dictionaries drive it, both pluggable:
//   1. phrase dict  — multi-character phrases and terms (VietPhrase-style, meaning
//                     oriented: 修仙 -> "tu tiên", 出没 -> "qua lại"). Longest
//                     match wins, so a phrase overrides the per-character fallback.
//   2. hanviet chars — single-character Sino-Vietnamese phonetic fallback
//                     (ChinesePhienAmWords-style: 中 -> "trung", 叶 -> "diệp").
//                     Phonetic, not meaning, so a name character no dictionary
//                     covers still reads as a name (叶 -> "diệp", never "lá").
//
// After lookup it normalises full-width Chinese punctuation to Vietnamese
// spacing and capitalises sentence starts, which is most of what separates raw
// dictionary output from readable convert.

const HAN = /\p{Script=Han}/u;

function isHan(ch) {
  return HAN.test(ch);
}

// Aspect/mood particles that carry no lexical meaning. Convert renders them as
// dead phonetic syllables ("了"→"liễu", "着"→"trước") that break the reading;
// dropping a standalone one is safe because any real phrase containing it is
// matched by the trie first and wins before we reach this fallback.
const DROP_TOKENS = new Set([
  "了", "着", "呢", "吗", "吧", "啊", "呀", "嘛", "哦", "嗯",
  "唉", "呗", "咯", "喽", "啦", "哟", "喔", "唔", "呐", "哈"
]);

// Full-width Chinese punctuation -> { text, side }. `side` drives spacing:
//   "close" hugs the word on its left and takes a space after  (， 。 ！ ？)
//   "open"  takes a space before and hugs the word on its right (opening quote/bracket)
const PUNCT = {
  "，": { text: ",", side: "close" },
  "。": { text: ".", side: "close" },
  "！": { text: "!", side: "close" },
  "？": { text: "?", side: "close" },
  "；": { text: ";", side: "close" },
  "：": { text: ":", side: "close" },
  "、": { text: ",", side: "close" },
  "．": { text: ".", side: "close" },
  "…": { text: "…", side: "close" },
  "「": { text: "“", side: "open" },
  "」": { text: "”", side: "close" },
  "『": { text: "“", side: "open" },
  "』": { text: "”", side: "close" },
  "“": { text: "“", side: "open" },
  "”": { text: "”", side: "close" },
  "‘": { text: "‘", side: "open" },
  "’": { text: "’", side: "close" },
  "（": { text: "(", side: "open" },
  "）": { text: ")", side: "close" },
  "《": { text: "“", side: "open" },
  "》": { text: "”", side: "close" },
  "〈": { text: "“", side: "open" },
  "〉": { text: "”", side: "close" },
  "【": { text: "[", side: "open" },
  "】": { text: "]", side: "close" },
  "·": { text: "·", side: "close" },
  "—": { text: "—", side: "close" }
};

// A phrase dictionary can be huge (VietPhrase ships hundreds of thousands of
// entries). A trie keeps longest-match lookup at O(match length).
function buildTrie(phraseDict) {
  const root = new Map();
  for (const zh of Object.keys(phraseDict)) {
    if (!zh) continue;
    let node = root;
    for (const ch of zh) {
      let next = node.get(ch);
      if (!next) {
        next = new Map();
        node.set(ch, next);
      }
      node = next;
    }
    node.set("$", phraseDict[zh]); // terminal marker holds the Vietnamese
  }
  return { root };
}

// Longest phrase starting at chars[i]. Returns { vi, length } or null.
function matchPhrase(trie, chars, i) {
  let node = trie.root;
  let best = null;
  let j = i;
  while (j < chars.length) {
    const next = node.get(chars[j]);
    if (!next) break;
    node = next;
    j++;
    const terminal = node.get("$");
    if (terminal !== undefined) best = { vi: terminal, length: j - i };
  }
  return best;
}

function capitalizeFirst(text) {
  const m = /\p{L}/u.exec(text);
  if (!m) return text;
  const i = m.index;
  return text.slice(0, i) + text[i].toLocaleUpperCase("vi") + text.slice(i + 1);
}

function createConvertEngine({
  phraseDict = {},
  hanvietChars = {},
  normalizePunctuation = true,
  capitalizeSentences = true
} = {}) {
  const trie = buildTrie(phraseDict);

  // Turn a run of text into a token list, then join with spacing rules. Tokens:
  //   { t: "w", s }      a word (syllable or phrase or number/latin run)
  //   { t: "open", s }   punctuation that hugs the following word
  //   { t: "close", s }  punctuation that hugs the preceding word
  //   { t: "raw", s }    anything else, passed through with no spacing change
  function tokenize(line) {
    const chars = Array.from(line);
    const tokens = [];
    let i = 0;
    while (i < chars.length) {
      const ch = chars[i];

      // 1. Longest phrase match (terminology, exact and consistent).
      const m = matchPhrase(trie, chars, i);
      if (m) {
        tokens.push({ t: "w", s: m.vi });
        i += m.length;
        continue;
      }

      // 2. Grammatical particle with no lexical meaning -> drop it entirely.
      if (DROP_TOKENS.has(ch)) {
        i += 1;
        continue;
      }

      // 3. Single Han character -> phonetic fallback (unknown Han passes through).
      if (isHan(ch)) {
        const entry = hanvietChars[ch];
        tokens.push({ t: "w", s: entry ? entry.hv : ch });
        i += 1;
        continue;
      }

      // 3. Punctuation normalisation.
      if (normalizePunctuation && PUNCT[ch]) {
        const p = PUNCT[ch];
        tokens.push({ t: p.side, s: p.text });
        i += 1;
        continue;
      }

      // 4. Whitespace ends the current spacing run without emitting anything.
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }

      // 5. Numbers and Latin letters read as words so they get normal spacing.
      if (/[0-9A-Za-zÀ-ɏ]/.test(ch)) {
        let j = i;
        let run = "";
        while (j < chars.length && /[0-9A-Za-zÀ-ɏ.,]/.test(chars[j]) && !PUNCT[chars[j]]) {
          run += chars[j];
          j++;
        }
        tokens.push({ t: "w", s: run });
        i = j;
        continue;
      }

      // 6. Everything else (ASCII punctuation, symbols) passes through hugging left.
      tokens.push({ t: "close", s: ch });
      i += 1;
    }
    return tokens;
  }

  function joinTokens(tokens) {
    let out = "";
    let sentenceStart = true;
    let prev = null; // "w" | "open" | "close" | null
    for (const tok of tokens) {
      let piece = tok.s;
      if (tok.t === "w" && capitalizeSentences && sentenceStart) {
        piece = capitalizeFirst(piece);
      }

      let space = false;
      if (prev === null) space = false;
      else if (tok.t === "open") space = true; // space before an opening mark
      else if (tok.t === "close") space = false; // closing mark hugs the left
      else if (prev === "open") space = false; // word hugs an opening mark
      else space = true; // word/close followed by a word -> space

      out += (space ? " " : "") + piece;

      if (tok.t === "w") sentenceStart = false;
      else if (tok.t === "close" && /[.!?…]/.test(tok.s)) sentenceStart = true;
      prev = tok.t;
    }
    return out;
  }

  function convertLine(line) {
    return joinTokens(tokenize(line));
  }

  // Convert a whole chapter, preserving paragraph structure. Paragraph count must
  // match the source so the reader and the LLM tier stay aligned.
  function convert(text) {
    if (typeof text !== "string" || !text) return "";
    return text
      .replace(/\r\n/g, "\n")
      .split(/\n/)
      .map((line) => (line.trim() ? convertLine(line) : ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return { convert, convertLine };
}

module.exports = { createConvertEngine, isHan, buildTrie, matchPhrase, PUNCT };
