"use strict";

// The proper-noun matcher is the one layer that overrules the dictionary, so
// these tests are as much about what it refuses as what it matches. Every
// "stays out of" case here is a real failure the guards were written for.

const { test } = require("node:test");
const assert = require("node:assert");
const { createProperNounMatcher } = require("./proper-nouns");

const HAN = /\p{Script=Han}/u;
const isHan = (ch) => HAN.test(ch);

// Just enough of each table to exercise the rules.
const READINGS = {
  叶: "diệp", 辰: "thần", 苏: "tô", 落: "lạc", 雪: "tuyết", 醒: "tỉnh",
  林: "lâm", 动: "động", 中: "trung", 看: "khán", 白: "bạch", 衣: "y",
  胜: "thắng", 青: "thanh", 云: "vân", 城: "thành", 天: "thiên", 玄: "huyền",
  宗: "tông", 世: "thế", 界: "giới", 家: "gia", 族: "tộc", 欧: "âu",
  阳: "dương", 锋: "phong", 的: "đích", 那: "na", 场: "trường", 三: "tam"
};
const hanvietChars = Object.fromEntries(
  Object.entries(READINGS).map(([ch, hv]) => [ch, { hv }])
);

function matcher(overrides = {}) {
  return createProperNounMatcher({
    surnames: { 叶: "Diệp", 苏: "Tô", 林: "Lâm", 白: "Bạch", 欧阳: "Âu Dương" },
    placeSuffixes: { 城: "thành", 宗: "tông", 界: "giới", 家: "gia", 族: "tộc" },
    classifiers: { 场: "trận" },
    functionWords: new Set(["那", "之"]),
    verbs: new Set(["看", "醒"]),
    adjectives: new Set(["白"]),
    hanvietChars,
    phraseDict: { 苏醒: "tỉnh lại", 林中: "trong rừng", 白衣: "áo trắng", 世界: "thế giới" },
    dropTokens: new Set(["了", "着"]),
    isHan,
    ...overrides
  });
}

const at = (m, text, i = 0) => m.match(Array.from(text), i);

test("a surname plus one character reads as a person in Title Case", () => {
  assert.deepStrictEqual(at(matcher(), "叶辰"), { vi: "Diệp Thần", length: 2, kind: "name" });
});

test("a surname plus two characters wins over a shorter meaning phrase", () => {
  // 落雪 alone is "tuyết rơi"; inside 苏落雪 it is half a given name.
  assert.deepStrictEqual(at(matcher(), "苏落雪"), { vi: "Tô Lạc Tuyết", length: 3, kind: "name" });
});

test("a compound surname is tried before its first character", () => {
  assert.deepStrictEqual(at(matcher(), "欧阳锋"), { vi: "Âu Dương Phong", length: 3, kind: "name" });
});

test("a given name never ends on a verb", () => {
  // 林动看着 is 林动 followed by 看, not a three-character "Lâm Động Nhìn".
  assert.strictEqual(at(matcher(), "林动看着").length, 2);
});

test("a given name never contains a particle", () => {
  // 林动的父亲 — without this guard 的 joins the name as "Lâm Động Của".
  assert.strictEqual(at(matcher(), "林动的父亲").length, 2);
});

test("a two-character given name may not be built on a real word", () => {
  // 白衣 is "áo trắng", so 白衣胜雪 must not become a person called 白衣胜. The
  // one-character fallback 白衣 still matches, and ties go to the dictionary in
  // the engine — see the integration test in convert-engine.test.js.
  assert.strictEqual(at(matcher(), "白衣胜雪").length, 2);
});

test("a name never wins a tie against the dictionary", () => {
  // 苏醒 is "tỉnh lại". The matcher may return a 2-char candidate; the engine
  // keeps the dictionary on a tie, so what matters is that it is not longer.
  const m = at(matcher(), "苏醒了");
  assert.ok(!m || m.length <= 2, "a 3-char name would beat 苏醒 in the engine");
});

test("two name characters plus a suffix read as a place", () => {
  assert.deepStrictEqual(at(matcher(), "青云城"), { vi: "Thanh Vân thành", length: 3, kind: "name" });
  assert.deepStrictEqual(at(matcher(), "天玄宗"), { vi: "Thiên Huyền tông", length: 3, kind: "name" });
});

test("a place is refused when the second character is itself a suffix", () => {
  // 世界上, 家族, 大家族 — the run is a common noun, not a name.
  assert.strictEqual(at(matcher(), "世界上"), null);
  assert.strictEqual(at(matcher(), "家族中"), null);
});

test("a place is refused when the dictionary knows the whole run", () => {
  const m = matcher({ phraseDict: { 青云城: "thành Thanh Vân" } });
  assert.strictEqual(at(m, "青云城"), null);
});

test("a place is refused when a function word or particle leads it", () => {
  // 的那场 was matched as a place before the particle guard.
  assert.strictEqual(at(matcher(), "的那场"), null);
  assert.strictEqual(at(matcher(), "那三城"), null);
});

test("place beats person when both match at the same length", () => {
  // 白衣城: 白 is a surname, but the run is a city.
  const m = matcher({ placeSuffixes: { 城: "thành" }, phraseDict: {} });
  assert.deepStrictEqual(at(m, "白衣城"), { vi: "Bạch Y thành", length: 3, kind: "name" });
});

test("no match at all when the position starts nothing", () => {
  assert.strictEqual(at(matcher(), "中天"), null);
});

test("a character with no phonetic reading cannot be part of a name", () => {
  assert.strictEqual(at(matcher(), "叶龘"), null);
});
