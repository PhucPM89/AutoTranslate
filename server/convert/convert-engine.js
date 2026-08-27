"use strict";

// Deterministic Chinese -> Vietnamese "convert" engine.
//
// This is the zero-cost coverage tier: no API, no quota, no network. It renders
// every chapter the instant it is ingested, so no chapter is ever unreadable
// while the LLM tier catches up on the chapters people actually open. It is NOT
// a fluent translation — it is the QuickTranslator-style convert Vietnamese
// web-novel readers have used for years, where terminology is exact and
// perfectly consistent across thousands of chapters.
//
// Four layers, each one narrower than the last:
//
//   1. phrase dict    — multi-character phrases and terms (VietPhrase-style,
//                       meaning oriented: 修仙 -> "tu tiên"). Longest match wins.
//   2. proper nouns   — names read phonetically in Title Case, competing with the
//                       phrase dict so 苏落雪 is "Tô Lạc Tuyết", not "Tô tuyết
//                       rơi". See proper-nouns.js.
//   3. hanviet chars  — single-character Sino-Vietnamese phonetic fallback, so a
//                       name character no dictionary covers still reads as a name
//                       (叶 -> "diệp", never "lá").
//   4. grammar        — reorders the token stream into Vietnamese word order: 的
//                       possessives, postposed adjectives and demonstratives.
//                       See grammar.js.
//
// Then punctuation is normalised and sentence starts are capitalised.

const { applyGrammar } = require("./grammar");
const { createProperNounMatcher } = require("./proper-nouns");
const { polishLiteraryProse } = require("./literary-stylist");
const { createSemanticOrchestrator } = require("./semantic/semantic-orchestrator");

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

// Structural particles the grammar layer owns. 的 is tagged and rewritten there;
// 地 (adverbial) and 得 (resultative) are pure glue after an adverb, adjective or
// verb and read best dropped, exactly like the aspect particles above.
const DE = "的";
const ADVERBIAL = new Set(["地", "得"]);
const STRUCTURAL = new Set(["的", "地", "得"]);
const DEMONSTRATIVES = new Set(["这", "那"]);

// Aspect markers, the subset of DROP_TOKENS that only ever follows a verb. They
// are dropped like the rest, but on the way out they retag the word before them
// as a verb — free POS information the dictionaries cannot give us, and exactly
// what the 的 rule needs to tell 记载了…的秘密 (relative) from 时期的秘密
// (possessive).
const ASPECT = new Set(["了", "着", "过"]);

// Locatives that trail a proper noun. Vietnamese puts them in front, so
// "紫云殿内" is "trong Tử Vân điện", not "Tử Vân điện nội".
const LOCATIVES = {
  "上": "trên", "中": "trong", "内": "trong", "里": "trong",
  "外": "ngoài", "下": "dưới", "前": "trước", "后": "sau", "旁": "bên"
};

// Noun-forming characters. A two-character compound that ends in one is a noun
// even when it opens on a verb: 说法 is "cách nói", 喊声 is "tiếng la", 学院 is
// "học viện". The two-character verb heuristic below must not claim those, and
// the list is deliberately generous — guessing "noun" falls back to the
// possessive reading of 的, which is the safe default.
const NOUN_SUFFIX = new RegExp(
  "[法者子头手人物处所心力气意情度性化员师生家国声音响味光影貌样式类期位" +
  "界门派宗城山河海林谷峰岛洞天地道理事况质量形态势状景象风雨云雷电火水" +
  "土木石玉剑刀枪衣袍丹药符阵功诀经书卷册页字词句章节篇诗歌曲画图表面" +
  "点间方色身命运神魂魄血肉骨皮毛发眼耳鼻口舌牙脸容颜]"
);
const COLOUR_SUFFIX = /^.+色$/;

// Degree adverbs, for isGradedAdjective below.
const DEGREE = new Set([
  "最", "很", "太", "更", "极", "挺", "颇", "超", "巨", "特",
  "非常", "十分", "格外", "异常", "无比", "相当", "尤其", "分外", "越发"
]);

// Degree adverbs that essentially never begin a common noun, so a word starting
// with one is an adjective even when its tail is not in the adjective list
// (很难闻 -> adj, so 很难闻的味道 postposes instead of leaking "của"). The risky
// ones are left out on purpose: 太 opens 太阳/太子, 巨 opens 巨人, 超 opens 超市 —
// there the prefix is part of a noun, not a degree adverb.
const SAFE_DEGREE = new Set([
  "很", "非常", "十分", "格外", "异常", "无比", "相当", "尤其", "分外", "越发", "挺"
]);

// A numeral or a quantity expression: 三十, 三十年, 三年前. Used by the 的 rule,
// where a quantity modifier postposes without "của" ("khổ tu ba mươi năm").
const NUMERIC = /^[0-9０-９一二三四五六七八九十百千万亿零两半几数多]+$/;
const QUANTITY = /^[0-9０-９一二三四五六七八九十百千万亿零两半几数多]+[年月日天时辰分秒岁纪][前后余多]?$/;

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

// Punctuation after which the next word starts a sentence. An opening quote is
// included: dialogue is a new sentence ("nói ra: “Lúc còn chưa tới.”").
const SENTENCE_END = /[.!?…:]/;
const OPEN_QUOTE = new Set(["“", "‘", "["]);

// Terminal marker for the trie. A Symbol, not a character, because VietPhrase
// keys can contain any byte — an entry whose key held a literal "$" made a
// character terminal collide with a real child node, and node.get("$") returned
// that Map instead of a reading (it surfaced as "[object Map]" in output). A
// Symbol can never equal a phrase character, so the collision is impossible.
const TERMINAL = Symbol("terminal");

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
    node.set(TERMINAL, phraseDict[zh]); // holds the Vietnamese reading
  }
  return { root };
}

// Longest phrase starting at chars[i]. Returns { vi, length } or null.
//
// `reject` drops a candidate and keeps looking at shorter ones. VietPhrase ships
// entries that swallowed a following structural particle (上的 -> "lên", 在乎的
// -> "quan tâm", 轻轻地 -> "nhẹ nhàng mà"); matching those hides the particle
// from the grammar layer, which is the one token it most needs to see.
function matchPhrase(trie, chars, i, reject) {
  let node = trie.root;
  let best = null;
  let j = i;
  while (j < chars.length) {
    const next = node.get(chars[j]);
    if (!next) break;
    node = next;
    j++;
    const terminal = node.get(TERMINAL);
    if (terminal === undefined) continue;
    if (reject && reject(chars, i, j - i)) continue;
    best = { vi: terminal, length: j - i };
  }
  return best;
}

// Reject a phrase match that would hide a structural particle from the grammar
// layer. Three ways that happens, all of them common in VietPhrase:
//
//   contains 的   锋利的剑 ("kiếm sắc bén") wins over 锋利 + 的 + 剑气, and the
//                 real noun 剑气 is torn in half. Handing every 的 to the grammar
//                 layer instead gets "kiếm khí sắc bén" — and it reaches the
//                 cases no entry covers, which is most of them.
//   ends on 地/得 轻轻地 -> "nhẹ nhàng mà": the particle leaks into the output.
//   starts on 地/得 rejecting 冷冷地 only helps if 地问道 ("mà hỏi thăm") cannot
//                 pick the match up one character later.
//
// Words that genuinely contain 的 (真的, 目的, 的确) are exempt — see
// data/convert/pos/de-words.txt.
function particleBoundary(chars, i, length, afterModifier, deWords) {
  const zh = chars.slice(i, i + length).join("");
  if (deWords.has(zh)) return false;
  if (zh.length > 1 && zh.includes(DE)) return true;
  if (length > 1 && ADVERBIAL.has(chars[i + length - 1])) return true;
  return afterModifier && ADVERBIAL.has(chars[i]);
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
  lexicon = {},
  nameGlossary = null,
  normalizePunctuation = true,
  capitalizeSentences = true,
  applyGrammarRules = true
} = {}) {
  // A per-book name glossary reads inside the phrase dictionary (so the name
  // renders), and also seeds a separate trie used to lock segmentation: a
  // dictionary phrase may not cross the start of a name, so 对付宇茜 splits
  // 对 | 付宇茜 ("với Phó Vũ Yên") instead of 对付 | 宇茜 ("đối phó" + a fragment).
  const merged = nameGlossary ? { ...phraseDict, ...nameGlossary } : phraseDict;
  const trie = buildTrie(merged);
  const nameTrie = nameGlossary && Object.keys(nameGlossary).length ? buildTrie(nameGlossary) : null;
  const adjectives = lexicon.adjectives || new Set();
  const verbs = lexicon.verbs || new Set();
  const functionWords = lexicon.functionWords || new Set();
  const classifiers = lexicon.classifiers || {};
  const deWords = lexicon.deWords || new Set();

  const properNouns = createProperNounMatcher({
    surnames: lexicon.surnames,
    placeSuffixes: lexicon.placeSuffixes,
    classifiers,
    functionWords,
    verbs,
    adjectives,
    hanvietChars,
    phraseDict,
    dropTokens: DROP_TOKENS,
    longestPhraseAt: (chars, at) => matchPhrase(trie, chars, at),
    isHan
  });

  // A multi-character phrase whose head or tail is a known verb is a verb
  // phrase: 留给他 (留给), 刚才说话 (说话). The 的 rule needs this — a verb before
  // 的 marks a relative clause, not a possessive. Only two-character edges are
  // tested; single characters are far too ambiguous (期望 is not 望).
  function looksVerbal(zh) {
    if (verbs.has(zh)) return true;
    // A dictionary entry that swallowed an aspect marker (记载了, 死了) is a verb
    // phrase by construction — only a verb takes one.
    if (zh.length > 1 && ASPECT.has(zh.slice(-1))) return true;
    if (zh.length === 2) {
      // A verb plus its object or result: 用剑, 打伤. Listing every one of these
      // is hopeless, but the shape is recognisable — unless the second character
      // is a noun-forming suffix, where the compound is a noun instead (说法 is
      // "cách nói", not "nói pháp").
      return verbs.has(zh.charAt(0)) && !NOUN_SUFFIX.test(zh.charAt(1));
    }
    if (zh.length < 3) return false;
    return verbs.has(zh.slice(0, 2)) || verbs.has(zh.slice(-2));
  }

  // A degree adverb welded onto an adjective is still an adjective: 最年轻的内门
  // 弟子 has to read "đệ tử nội môn trẻ tuổi nhất", which needs 最年轻 to reach
  // the postposing rule rather than the possessive one.
  function isGradedAdjective(zh) {
    // Two-character degree prefixes (非常, 十分) before one-character (很, 太) so
    // the longer, unambiguous adverb wins.
    for (const n of [2, 1]) {
      if (zh.length <= n) continue;
      const prefix = zh.slice(0, n);
      // A safe adverb forces the reading; otherwise the tail must be a known
      // adjective, which is what keeps 太阳/巨人 out.
      if (SAFE_DEGREE.has(prefix)) return true;
      if (DEGREE.has(prefix) && adjectives.has(zh.slice(n))) return true;
    }
    return false;
  }

  // Tag a word token so grammar.js can reason about it. Order matters: function
  // words and verbs are checked before the numeral test, so 把 stays "đem".
  function classify(zh) {
    if (zh === DE) return "de";
    if (DEMONSTRATIVES.has(zh)) return "dem";
    if (LOCATIVES[zh]) return "loc";
    if (functionWords.has(zh)) return "fn";
    if (adjectives.has(zh) || COLOUR_SUFFIX.test(zh) || isGradedAdjective(zh)) return "adj";
    if (looksVerbal(zh)) return "verb";
    if (NUMERIC.test(zh) || QUANTITY.test(zh)) return "num";
    return "noun";
  }

  // Turn a run of text into a token list, then join with spacing rules. Tokens:
  //   { t: "w", s, zh, k }  a word (syllable, phrase, name, number or latin run)
  //   { t: "open", s }      punctuation that hugs the following word
  //   { t: "close", s }     punctuation that hugs the preceding word
  function tokenize(line) {
    const chars = Array.from(line);
    const tokens = [];
    let i = 0;

    // Positions where a glossary name begins. A phrase may not cross one, so a
    // verb that would swallow a surname (对付 over 付宇茜) is broken at the name.
    const nameStarts = new Set();
    if (nameTrie) {
      for (let p = 0; p < chars.length; p++) {
        if (matchPhrase(nameTrie, chars, p)) nameStarts.add(p);
      }
    }
    const crossesName = (start, len) => {
      for (let k = start + 1; k < start + len; k++) if (nameStarts.has(k)) return true;
      return false;
    };

    const lastWord = () => {
      for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].t === "w") return tokens[j];
      return null;
    };

    while (i < chars.length) {
      const ch = chars[i];

      // 1. An aspect marker right after a verb is grammar, not the start of a
      //    word. Without this the dictionary matches straight through it —
      //    "看着眼前" becomes 看 + 着眼前 ("nhìn" + "lên trước mắt") — and the
      //    clause boundary the marker signals is lost. Only after a verb, so
      //    "他了解" keeps 了解 and "整个过程" keeps 过程.
      if (ASPECT.has(ch)) {
        const prev = lastWord();
        if (prev && prev.k === "verb") {
          i += 1;
          continue;
        }
      }

      // 2. Longest phrase match, and the proper-noun matcher competing with it.
      //    A name only wins when it is strictly longer, so the dictionary keeps
      //    every tie: 苏醒 stays "tỉnh lại", 苏落雪 becomes "Tô Lạc Tuyết".
      const prevWord = lastWord();
      const postposed = !!prevWord && (prevWord.k === "adj" || prevWord.k === "fn" || prevWord.k === "verb");
      const phrase = matchPhrase(trie, chars, i, (c, at, len) =>
        particleBoundary(c, at, len, postposed, deWords) || crossesName(at, len));
      const name = properNouns.match(chars, i);
      if (name && (!phrase || name.length > phrase.length)) {
        tokens.push({ t: "w", s: name.vi, zh: chars.slice(i, i + name.length).join(""), k: "name" });
        i += name.length;
        continue;
      }
      if (phrase) {
        const zh = chars.slice(i, i + phrase.length).join("");
        tokens.push({ t: "w", s: phrase.vi, zh, k: classify(zh) });
        i += phrase.length;
        continue;
      }

      // 3. Grammatical particle with no lexical meaning -> drop it entirely.
      //    An aspect marker retags the word it followed: only a verb takes one,
      //    so 记载了 tells us 记载 is a verb even though no table lists it.
      // A particle with nothing in front of it is an interjection carrying the
      // whole utterance — 「嗯。」 must not convert to an empty pair of quotes.
      if (DROP_TOKENS.has(ch) && lastWord()) {
        if (ASPECT.has(ch)) {
          const prev = lastWord();
          if (prev.k === "noun") prev.k = "verb";
        }
        i += 1;
        continue;
      }

      // 4. 地/得 after an adverb, adjective or verb are pure glue ("轻轻地" ->
      //    "nhẹ nhàng"). Elsewhere 地 keeps its own meaning ("đất").
      if (ADVERBIAL.has(ch)) {
        const prev = lastWord();
        if (prev && (prev.k === "adj" || prev.k === "fn" || prev.k === "verb")) {
          i += 1;
          continue;
        }
      }

      // 5. A classifier reads as a classifier only after a numeral or a
      //    demonstrative ("一头" -> "một con"). Standalone it is a plain word, so
      //    "抬起头" keeps "đầu" instead of turning into "con".
      if (classifiers[ch]) {
        const prev = tokens[tokens.length - 1];
        if (prev && prev.t === "w" && (prev.k === "num" || prev.k === "dem")) {
          tokens.push({ t: "w", s: classifiers[ch], zh: ch, k: "cl" });
          i += 1;
          continue;
        }
      }

      // 6. Single Han character -> phonetic fallback (unknown Han passes through).
      //    A locative also carries `alt`, the reading it takes once the grammar
      //    layer moves it in front of a name (内 -> "nội" standing still,
      //    "trong" once it becomes a preposition).
      if (isHan(ch)) {
        const entry = hanvietChars[ch];
        const tok = { t: "w", s: entry ? entry.hv : ch, zh: ch, k: classify(ch) };
        if (tok.k === "loc") tok.alt = LOCATIVES[ch];
        tokens.push(tok);
        i += 1;
        continue;
      }

      // 7. Punctuation normalisation.
      if (normalizePunctuation && PUNCT[ch]) {
        const p = PUNCT[ch];
        tokens.push({ t: p.side, s: p.text });
        i += 1;
        continue;
      }

      // 8. Whitespace ends the current spacing run without emitting anything.
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }

      // 9. Numbers and Latin letters read as words so they get normal spacing.
      if (/[0-9A-Za-zÀ-ɏ]/.test(ch)) {
        let j = i;
        let run = "";
        while (j < chars.length && /[0-9A-Za-zÀ-ɏ.,]/.test(chars[j]) && !PUNCT[chars[j]]) {
          run += chars[j];
          j++;
        }
        tokens.push({ t: "w", s: run, zh: run, k: /^[0-9]+$/.test(run) ? "num" : "noun" });
        i = j;
        continue;
      }

      // 10. Everything else (ASCII punctuation, symbols) passes through hugging left.
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
      else if (tok.t === "close" && SENTENCE_END.test(tok.s)) sentenceStart = true;
      else if (tok.t === "open" && OPEN_QUOTE.has(tok.s)) sentenceStart = true;
      prev = tok.t;
    }
    return out;
  }

  function convertLine(line) {
    const tokens = tokenize(line);
    return joinTokens(applyGrammarRules ? applyGrammar(tokens) : tokens);
  }

  function convert(text) {
    if (typeof text !== "string" || !text) return "";
    const converted = text
      .replace(/\r\n/g, "\n")
      .split(/\n/)
      .map((line) => (line.trim() ? convertLine(line) : ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return polishLiteraryProse(converted);
  }

  // Semantic 1-Pass conversion orchestrated via the Symbolic NLP Engine
  const semanticOrchestrator = createSemanticOrchestrator({
    baseConvertFunction: (raw) => (raw.trim() ? convertLine(raw) : "")
  });

  function convertSemantic(text) {
    if (typeof text !== "string" || !text) return "";
    return semanticOrchestrator.translateChapter(text).text;
  }

  return { convert, convertSemantic, convertLine, tokenize, semanticOrchestrator };
}

module.exports = {
  createConvertEngine,
  createSemanticOrchestrator,
  isHan,
  buildTrie,
  matchPhrase,
  PUNCT,
  DROP_TOKENS
};
