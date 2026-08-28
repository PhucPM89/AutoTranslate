"use strict";

const { loadBase, isHan } = require("./convert/index");

// Common realm suffixes and markers in Xianxia / Fantasy / Wuxia / Martial Arts
const REALM_PATTERNS = [
  /([一二三四五六七八九十百千万\p{Script=Han}]{2,4})(?:境|期|重|阶|层|转|变)/u,
  /(炼气|筑基|金丹|元婴|化神|炼虚|合体|大乘|渡劫|地仙|天仙|真仙|金仙|太乙|大罗|准圣|圣人|道祖)(?:[一二三四五六七八九十]|初期|中期|后期|巅峰|圆满|大圆满)?/u,
  /(斗者|斗师|大斗师|斗灵|斗王|斗皇|斗宗|斗尊|斗圣|斗帝)(?:[一二三四五六七八九十]|星)?/u,
  /(武徒|武者|武师|大武师|武灵|武王|武皇|武宗|武尊|武圣|武神|武帝)(?:[一二三四五六七八九十]|重)?/u,
  /(后天|先天|宗师|大宗师|半圣|亚圣|至尊|主宰|神王|神皇|神帝)(?:[一二三四五六七八九十]|重|阶)?/u
];

// Organization & Sect suffixes
const SECT_SUFFIXES = ["宗", "门", "派", "阁", "宫", "殿", "峰", "谷", "府", "洞", "庄", "帮", "教", "圣地", "世家", "家族", "商会", "神朝", "帝国"];

// Martial arts, skills & techniques suffixes
const TECHNIQUE_SUFFIXES = ["诀", "功", "法", "经", "典", "拳", "掌", "指", "腿", "步", "剑法", "刀法", "枪法", "阵", "神通", "秘术", "秘典", "心法", "真诀", "宝典", "神功", "秘法"];

// Artifacts, treasures & pills suffixes
const ARTIFACT_SUFFIXES = ["剑", "刀", "枪", "戟", "弓", "鼎", "塔", "钟", "镜", "印", "珠", "旗", "扇", "炉", "琴", "笔", "甲", "环", "丹", "草", "果", "莲"];

const STOP_PREFIXES = [
  "在", "到", "从", "与", "和", "是", "有", "看", "见", "说", "道", "去", "来", "坐", "站",
  "飞", "走", "入", "出", "过", "将", "被", "把", "给", "这", "那", "个", "了", "的", "着",
  "于", "中", "内", "外", "上", "下", "前", "后", "左", "右", "又", "也", "就", "便", "都", "只"
];

function cleanEntity(term) {
  if (!term || typeof term !== "string") return "";
  let s = term.trim();
  while (s.length >= 3 && STOP_PREFIXES.includes(s[0])) {
    s = s.slice(1);
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
  const glossary = {};
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
  convertEntityToVietnamese,
  toTitleCase
};
