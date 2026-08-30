"use strict";

const { loadBase, isHan } = require("./convert/index");

// Common realm suffixes and markers in Xianxia / Fantasy / Wuxia / Martial Arts
const REALM_PATTERNS = [
  /(?:炼气|筑基|金丹|元婴|化神|炼虚|合体|大乘|渡劫|地仙|天仙|真仙|金仙|太乙|大罗|准圣|圣人|道祖|斗者|斗师|大斗师|斗灵|斗王|斗皇|斗宗|斗尊|斗圣|斗帝|武徒|武者|武师|大武师|武灵|武王|武皇|武宗|武尊|武圣|武神|武帝|后天|先天|宗师|大宗师|半圣|亚圣|至尊|主宰|神王|神皇|神帝)(?:[一二三四五六七八九十]|初期|中期|后期|巅峰|圆满|大圆满|境|期|重|阶|层)?/u,
  /([一二三四五六七八九十百千万\p{Script=Han}]{2,4})(?:境|期)/u
];

// Organization & Sect suffixes
const SECT_SUFFIXES = ["宗", "门", "派", "阁", "宫", "殿", "圣地", "世家", "神朝", "帝国"];

// Martial arts, skills & techniques suffixes
const TECHNIQUE_SUFFIXES = ["神功", "心法", "真诀", "宝典", "剑诀", "刀诀", "剑法", "刀法", "枪法", "身法", "阵法", "秘术", "秘典", "神通", "绝技", "剑", "拳", "掌"];

// Artifacts, treasures & pills suffixes
const ARTIFACT_SUFFIXES = ["神剑", "飞剑", "宝剑", "仙剑", "宝刀", "神枪", "宝鼎", "灵塔", "古钟", "宝镜", "灵珠", "阵旗", "丹炉", "神琴", "宝甲", "灵丹", "仙丹", "灵草", "仙草", "灵果", "仙莲", "神印"];

const STOP_PREFIXES = [
  "在", "到", "从", "与", "和", "是", "有", "看", "见", "说", "道", "去", "来", "坐", "站",
  "飞", "走", "入", "出", "过", "将", "被", "把", "给", "这", "那", "个", "了", "的", "着",
  "于", "中", "内", "外", "上", "下", "前", "后", "左", "右", "又", "也", "就", "便", "都", "只"
];

const FORBIDDEN_ENTITY_CHARS = new Set(
  "的了着过在就都也还又才便却将把被给和与我你他她它们不没开关拿去来看见走进出转变帮教说道问答想觉要会能让向对跟同从到为以于上下里外回买卖店房舅爷爸妈媳妇儿怎么什么为什么哪里那里".split("")
);

const PERSON_ACTIONS = new Set(
  "说道问答喊叫笑哭看望听想点摇抬低转走来去退进出站坐跪起落冲追挡接握拿拔挥施运催皱挑瞪闭睁咬拍摸推拉抱扶杀打骂喝叹哼惊怒喜愣沉".split("")
);
const PERSON_SPEECH_ACTIONS = new Set("说道问答喊叫笑哭骂喝叹哼".split(""));
const INVALID_GIVEN_NAME_CHARS = new Set(
  "的了着过在就都也还又才便却将把被给和与或而很更最太直连忙已没可要会能让向对跟同从到为以于上下里外回出进看听说问答想觉走坐站伸点抬骂掏准备".split("")
);
const INVALID_GIVEN_NAMES = /^(?:兄弟|兄|弟|叔|父|母|大师|先生|小姐|老板|局长|警官|师父|师兄|师弟|师叔|爸爸|妈妈|爸|妈|哥|姐|胖子|老头|夫人|公子|姑娘)/u;

let cachedSurnames = null;

function loadSurnames() {
  if (cachedSurnames) return cachedSurnames;
  const result = [];
  const filename = require("path").join(process.cwd(), "data", "convert", "names", "surnames.txt");
  try {
    for (const line of require("fs").readFileSync(filename, "utf8").split(/\r?\n/)) {
      const match = line.match(/^([^#=\s]+)\s*=/);
      if (match && isAllHan(match[1])) result.push(match[1]);
    }
  } catch {
    return [];
  }
  // Compound surnames must be considered before their one-character prefixes.
  cachedSurnames = [...new Set(result)].sort((a, b) => b.length - a.length);
  return cachedSurnames;
}

function isLikelyNameBoundary(text, start, end) {
  const before = text[start - 1] || "";
  const after = text[end] || "";
  const leftBoundary = !before || /[，。！？、：；“”"'（）\s]/u.test(before) || /[叫称让向对同跟见找救杀问答]/u.test(before);
  const rightBoundary = !after || PERSON_ACTIONS.has(after) || /[，。！？、：；“”"'（）\s]/u.test(after);
  return leftBoundary && rightBoundary;
}

/**
 * Mines Chinese personal names conservatively. A candidate must start with a
 * known surname and occur at a grammatical boundary/action position. This is
 * deliberately stricter than generic proper-noun mining: a missed name can be
 * learned in a later chapter, while a false name corrupts ordinary prose.
 */
function mineCharacterNames(chapterTexts, env = process.env) {
  const texts = Array.isArray(chapterTexts) ? chapterTexts : [chapterTexts];
  const combined = texts.filter(Boolean).join("\n");
  if (!combined) return {};

  const base = loadBase(env);
  const candidates = new Map();
  const surnames = loadSurnames();
  const singleSurnames = new Set(surnames.filter((surname) => surname.length === 1));
  const compoundSurnames = new Set(surnames.filter((surname) => surname.length === 2));
  for (let from = 0; from < combined.length; from += 1) {
    const compound = combined.slice(from, from + 2);
    const surname = compoundSurnames.has(compound)
      ? compound
      : singleSurnames.has(combined[from]) ? combined[from] : "";
    if (!surname) continue;

    for (const givenLength of [2, 1]) {
      const end = from + surname.length + givenLength;
      const candidate = combined.slice(from, end);
      const givenName = candidate.slice(surname.length);
      if (
        !isAllHan(candidate) ||
        INVALID_GIVEN_NAMES.test(givenName) ||
        [...givenName].some((ch) => INVALID_GIVEN_NAME_CHARS.has(ch) || PERSON_ACTIONS.has(ch)) ||
        !isLikelyNameBoundary(combined, from, end)
      ) continue;

      // Prefer the longest candidate whose final character is followed by an
      // action/boundary. This avoids truncating 李子夜 to 李子.
      candidates.set(candidate, (candidates.get(candidate) || 0) + 1);
      break;
    }
  }

  const glossary = {};
  for (const [zh, count] of candidates) {
    // One strong subject/action occurrence is enough; punctuation-only guesses
    // need repetition in the sampled text.
    let strong = false;
    let pos = combined.indexOf(zh);
    while (pos !== -1) {
      const before = combined[pos - 1] || "";
      const after = combined[pos + zh.length] || "";
      if (PERSON_SPEECH_ACTIONS.has(after) || /[叫称谓名]/u.test(before)) {
        strong = true;
        break;
      }
      pos = combined.indexOf(zh, pos + zh.length);
    }
    if (count < 2 || (!strong && count < 4)) continue;
    const vi = convertEntityToVietnamese(zh, base);
    if (vi && vi !== zh) glossary[zh] = vi;
  }
  return glossary;
}

function cleanEntity(term) {
  if (!term || typeof term !== "string") return "";
  let s = term.trim();
  while (s.length >= 3 && STOP_PREFIXES.includes(s[0])) {
    s = s.slice(1);
  }
  if (!isAllHan(s) || [...s].some((ch) => FORBIDDEN_ENTITY_CHARS.has(ch))) {
    return "";
  }
  return s;
}

function toTitleCase(str) {
  if (!str) return "";
  return str
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

/**
 * Converts a Chinese entity phrase to standard capitalized Sino-Vietnamese.
 * @param {string} zh
 * @param {Object} base
 * @returns {string}
 */
function convertEntityToVietnamese(zh, base) {
  if (!zh || typeof zh !== "string") return "";
  const { phraseDict, hanvietChars } = base;

  // Segment character-by-character with Han-Viet phonetic dictionary
  // so entity names are strictly Sino-Vietnamese (e.g. 太 -> "Thái", not "quá")
  let words = [];
  for (const ch of zh) {
    if (hanvietChars && hanvietChars[ch]) {
      words.push(hanvietChars[ch].hv || ch);
    } else if (phraseDict && phraseDict[ch]) {
      words.push(phraseDict[ch]);
    } else {
      words.push(ch);
    }
  }

  return toTitleCase(words.join(" "));
}

function isAllHan(str) {
  return typeof str === "string" && /^[\p{Script=Han}]+$/u.test(str);
}

function extractTermsWithSuffixes(text, suffixes, minLen = 3, maxLen = 4) {
  const terms = new Set();
  for (const suffix of suffixes) {
    let pos = 0;
    while ((pos = text.indexOf(suffix, pos)) !== -1) {
      for (let len = minLen; len <= maxLen; len++) {
        const start = pos + suffix.length - len;
        if (start >= 0) {
          const cand = text.slice(start, pos + suffix.length);
          if (cand.length === len && isAllHan(cand)) {
            const cleaned = cleanEntity(cand);
            if (cleaned.length >= minLen && cleaned.endsWith(suffix)) {
              terms.add(cleaned);
            }
          }
        }
      }
      pos += suffix.length;
    }
  }
  return terms;
}

/**
 * Mines domain-specific entities (realms, sects, techniques, artifacts) from chapter texts.
 * @param {string|string[]} chapterTexts
 * @param {Object} [env]
 * @returns {Object<string, string>} Mapping from Chinese entity to Vietnamese translation
 */
function mineNovelGlossary(chapterTexts, env = process.env) {
  const base = loadBase(env);
  if (!base) return {};

  const texts = Array.isArray(chapterTexts) ? chapterTexts : [chapterTexts];
  const combined = texts.filter(Boolean).join("\n");
  if (!combined) return {};

  const entities = new Set();

  // 1. Mine Cultivation Realms
  for (const regex of REALM_PATTERNS) {
    const globalRegex = new RegExp(regex.source, "gu");
    let match;
    while ((match = globalRegex.exec(combined)) !== null) {
      const term = cleanEntity(match[0]);
      if (term.length >= 2 && term.length <= 6) {
        entities.add(term);
      }
    }
  }

  // 2. Mine Sects & Organizations (3-4 chars ending in sect suffix)
  for (const term of extractTermsWithSuffixes(combined, SECT_SUFFIXES, 3, 4)) {
    entities.add(term);
  }

  // 3. Mine Martial Arts / Techniques (3-5 chars ending in technique suffix)
  for (const term of extractTermsWithSuffixes(combined, TECHNIQUE_SUFFIXES, 3, 5)) {
    entities.add(term);
  }

  // 4. Mine Artifacts & Treasures (3-4 chars ending in artifact suffix)
  for (const term of extractTermsWithSuffixes(combined, ARTIFACT_SUFFIXES, 3, 4)) {
    entities.add(term);
  }

  // Build the glossary mapping
  const glossary = mineCharacterNames(texts, env);
  for (const zh of entities) {
    const vi = convertEntityToVietnamese(zh, base);
    if (vi && vi !== zh) {
      glossary[zh] = vi;
    }
  }

  return glossary;
}

module.exports = {
  mineNovelGlossary,
  mineCharacterNames,
  convertEntityToVietnamese,
  toTitleCase
};
