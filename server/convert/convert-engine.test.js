"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { createConvertEngine, matchPhrase, buildTrie } = require("./convert-engine");
const { loadPhraseDict, loadHanvietChars, parseTxt } = require("./load-dictionaries");

const HV = {
  中: { hv: "trung" }, 国: { hv: "quốc" }, 人: { hv: "nhân" },
  修: { hv: "tu" }, 仙: { hv: "tiên" }, 之: { hv: "chi" }, 路: { hv: "lộ" },
  叶: { hv: "diệp" }, 辰: { hv: "thần" }
};

// Raw-mechanics engine: no punctuation/caps, so spacing and lookup are isolated.
function raw(opts) {
  return createConvertEngine({ normalizePunctuation: false, capitalizeSentences: false, ...opts });
}

test("longest phrase match wins over single-char fallback", () => {
  const e = raw({ phraseDict: { 修仙: "TU-TIEN" }, hanvietChars: HV });
  assert.strictEqual(e.convert("修仙之路"), "TU-TIEN chi lộ");
});

test("syllables are space-separated, unknown Han passes through", () => {
  const e = raw({ hanvietChars: HV });
  assert.strictEqual(e.convert("中国人"), "trung quốc nhân");
  assert.strictEqual(e.convert("中龘国"), "trung 龘 quốc");
});

test("numbers and latin read as their own spaced word", () => {
  const e = raw({ hanvietChars: HV });
  assert.strictEqual(e.convert("中国123"), "trung quốc 123");
});

test("paragraph structure and blank lines are preserved", () => {
  const e = raw({ hanvietChars: HV });
  assert.strictEqual(e.convert("中国\n\n人"), "trung quốc\n\nnhân");
});

test("empty and non-string input is safe", () => {
  const e = raw({ hanvietChars: HV });
  assert.strictEqual(e.convert(""), "");
  assert.strictEqual(e.convert(null), "");
  assert.strictEqual(e.convert(undefined), "");
});

test("Chinese punctuation is normalised with Vietnamese spacing", () => {
  const e = createConvertEngine({ hanvietChars: HV, capitalizeSentences: false });
  // comma hugs left + space right; full stop likewise
  assert.strictEqual(e.convert("中国，人。"), "trung quốc, nhân.");
});

test("opening and closing quotes hug the correct side", () => {
  const e = createConvertEngine({ hanvietChars: HV, capitalizeSentences: false });
  assert.strictEqual(e.convert("人「中国」"), "nhân “trung quốc”");
});

test("sentence starts are capitalised, including after a full stop", () => {
  const e = createConvertEngine({ hanvietChars: HV });
  assert.strictEqual(e.convert("中国。人"), "Trung quốc. Nhân");
});

test("names read phonetically, not by meaning, and capitalise at sentence start", () => {
  const e = createConvertEngine({ hanvietChars: HV });
  assert.strictEqual(e.convert("叶辰"), "Diệp thần");
});

test("a name glossary locks segmentation so a verb cannot eat its surname", () => {
  const HVN = { ...FULL_HV, 对: { hv: "đối" }, 付: { hv: "phó" }, 宇: { hv: "vũ" }, 茜: { hv: "thiến" } };
  const gloss = { 付宇茜: "Phó Vũ Yên" };
  const e = createConvertEngine({
    phraseDict: { 对付: "đối phó" }, hanvietChars: HVN, nameGlossary: gloss, capitalizeSentences: false
  });
  // 对付 must break so 付宇茜 reads as the name, not "đối phó" + a fragment.
  assert.strictEqual(e.convert("对付宇茜"), "đối Phó Vũ Yên");
  // Without the name in the glossary, 对付 stays intact.
  const plain = createConvertEngine({ phraseDict: { 对付: "đối phó" }, hanvietChars: HVN, capitalizeSentences: false });
  assert.strictEqual(plain.convert("对付"), "đối phó");
});

test("trie matchPhrase returns the longest terminal", () => {
  const trie = buildTrie({ 天: "X", 天玄: "Y", 天玄宗: "Z" });
  const m = matchPhrase(trie, Array.from("天玄宗门"), 0);
  assert.deepStrictEqual(m, { vi: "Z", length: 3 });
});

test("trie returns null when the first char does not start any phrase", () => {
  const trie = buildTrie({ 修仙: "tu tiên" });
  assert.strictEqual(matchPhrase(trie, Array.from("你好"), 0), null);
});

test("a phrase key containing $ does not collide with the terminal marker", () => {
  // Regression: "$" was the terminal marker, so a VietPhrase key holding a
  // literal "$" made node.get("$") return a child Map — it surfaced as
  // "[object Map]" and crashed capitalisation. A Symbol marker can't collide.
  const trie = buildTrie({ "千$x": "X", 千万: "nghìn vạn" });
  assert.strictEqual(matchPhrase(trie, Array.from("千"), 0), null);
  const e = raw({ phraseDict: { "千$x": "X" }, hanvietChars: { 千: { hv: "thiên" } } });
  assert.strictEqual(e.convert("千"), "thiên");
});

test("parseTxt ignores comments, blanks, empty values and strips BOM", () => {
  const dict = parseTxt("﻿修仙=tu tiên\n# comment\n\n空=\n天玄宗=Thiên Huyền Tông\n");
  assert.deepStrictEqual(dict, { 修仙: "tu tiên", 天玄宗: "Thiên Huyền Tông" });
});

test("loaders read txt, gz and json and apply override precedence", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "convert-"));
  const base = path.join(dir, "base.txt");
  const gz = path.join(dir, "more.txt.gz");
  const override = path.join(dir, "override.json");
  fs.writeFileSync(base, "修仙=tu tien base\n天玄宗=Thien Huyen Tong\n");
  fs.writeFileSync(gz, zlib.gzipSync(Buffer.from("出没=qua lại\n", "utf8")));
  fs.writeFileSync(override, JSON.stringify({ 修仙: "tu tiên override" }));
  const dict = loadPhraseDict([base, gz, override]);
  assert.strictEqual(dict["修仙"], "tu tiên override"); // later file wins
  assert.strictEqual(dict["天玄宗"], "Thien Huyen Tong");
  assert.strictEqual(dict["出没"], "qua lại"); // gz decoded
  fs.rmSync(dir, { recursive: true, force: true });
});

test("single-char loader tags source and later files override", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "convert-"));
  const a = path.join(dir, "a.txt");
  const b = path.join(dir, "b.txt");
  fs.writeFileSync(a, "们=món\n"); // a wrong reading
  fs.writeFileSync(b, "们=môn\n"); // corrected later
  const chars = loadHanvietChars([a, b]);
  assert.strictEqual(chars["们"].hv, "môn");
  assert.strictEqual(chars["们"].source, "curated");
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- Integration: dictionary, proper nouns and grammar together ---------------
//
// These use a small hand-built lexicon rather than the shipped tables, so a
// failure points at the engine rather than at a data edit. `full()` wires up the
// same four layers production does.

const { loadLexicon } = require("./lexicon");

const FULL_HV = {
  ...HV,
  天: { hv: "thiên" }, 玄: { hv: "huyền" }, 宗: { hv: "tông" },
  弟: { hv: "đệ" }, 们: { hv: "môn" }, 的: { hv: "của" },
  白: { hv: "bạch" }, 衣: { hv: "y" }, 胜: { hv: "thắng" }, 雪: { hv: "tuyết" },
  苏: { hv: "tô" }, 落: { hv: "lạc" }, 内: { hv: "nội" }, 紫: { hv: "tử" },
  云: { hv: "vân" }, 殿: { hv: "điện" }, 古: { hv: "cổ" }, 老: { hv: "lão" },
  书: { hv: "thư" }, 籍: { hv: "tịch" }, 那: { hv: "kia" }, 枚: { hv: "mai" },
  玉: { hv: "ngọc" }, 佩: { hv: "bội" }, 时: { hv: "thời" }, 候: { hv: "hậu" },
  看: { hv: "nhìn" }, 眼: { hv: "nhãn" }, 前: { hv: "tiền" }, 少: { hv: "thiếu" },
  女: { hv: "nữ" }
};

function full(extra = {}) {
  return createConvertEngine({
    hanvietChars: FULL_HV,
    lexicon: {
      adjectives: new Set(["古老"]),
      verbs: new Set(["看"]),
      functionWords: new Set(["是"]),
      classifiers: { 枚: "cái" },
      surnames: { 叶: "Diệp", 苏: "Tô", 白: "Bạch" },
      placeSuffixes: { 宗: "tông", 殿: "điện" }
    },
    ...extra
  });
}

test("a name reads phonetically in Title Case, not by meaning", () => {
  const e = full({ phraseDict: { 落雪: "tuyết rơi" } });
  assert.strictEqual(e.convert("苏落雪"), "Tô Lạc Tuyết");
});

test("the dictionary keeps every tie against a name", () => {
  // 白衣 is a real word, so 白衣胜雪 must not read as a person.
  const e = full({ phraseDict: { 白衣: "áo trắng", 胜雪: "trắng như tuyết" } });
  assert.strictEqual(e.convert("白衣胜雪"), "Áo trắng trắng như tuyết");
});

test("a place name beats a shorter meaning phrase", () => {
  const e = full({ phraseDict: { 天玄: "trời huyền" } });
  assert.strictEqual(e.convert("天玄宗"), "Thiên Huyền tông");
});

test("的 is rewritten to của and the phrase order is reversed", () => {
  const e = full({ phraseDict: { 弟子们: "các đệ tử" } });
  assert.strictEqual(e.convert("天玄宗的弟子们"), "Các đệ tử của Thiên Huyền tông");
});

test("an adjective before 的 postposes instead of leaking của", () => {
  const e = full({ phraseDict: { 古老: "cổ xưa", 书籍: "sách vở" } });
  assert.strictEqual(e.convert("古老的书籍"), "Sách vở cổ xưa");
});

test("a dictionary entry may not swallow 的", () => {
  // 古老的书 would otherwise win on length and tear 书籍 in half.
  const e = full({ phraseDict: { 古老的书: "sách cổ", 古老: "cổ xưa", 书籍: "sách vở" } });
  assert.strictEqual(e.convert("古老的书籍"), "Sách vở cổ xưa");
});

test("a demonstrative and its classifier postpose around the noun", () => {
  const e = full({ phraseDict: { 玉佩: "ngọc bội" } });
  assert.strictEqual(e.convert("那枚玉佩"), "Cái ngọc bội kia");
});

test("a locative after a place name becomes a leading preposition", () => {
  const e = full({ phraseDict: {} });
  assert.strictEqual(e.convert("紫云殿内"), "Trong Tử Vân điện");
});

test("an aspect marker is dropped and marks the word before it as a verb", () => {
  // 看着眼前的少女: 着 must not let the dictionary match straight through it.
  const e = full({ phraseDict: { 眼前: "trước mắt", 少女: "thiếu nữ", 着眼前: "lên trước mắt" } });
  assert.strictEqual(e.convert("看着眼前"), "Nhìn trước mắt");
});

test("dialogue after a colon or an opening quote starts a sentence", () => {
  const e = full({ phraseDict: { 时候: "lúc" } });
  assert.strictEqual(e.convert("叶辰：「时候」"), "Diệp Thần: “Lúc”");
});

test("grammar rules can be switched off for raw dictionary order", () => {
  const e = full({ phraseDict: { 弟子们: "các đệ tử" }, applyGrammarRules: false });
  assert.strictEqual(e.convert("天玄宗的弟子们"), "Thiên Huyền tông của các đệ tử");
});

test("the 的 rule needs no tables, but the table-driven rules go quiet", () => {
  // No lexicon: no proper nouns, no postposing, no classifiers — but 的 is still
  // rewritten, because recognising it takes no word list. This is the floor a
  // partial checkout degrades to.
  const e = createConvertEngine({ hanvietChars: FULL_HV, phraseDict: { 弟子们: "các đệ tử" } });
  assert.strictEqual(e.convert("天玄宗的弟子们"), "Thiên huyền các đệ tử của tông");
  assert.strictEqual(e.convert("苏落雪"), "Tô lạc tuyết"); // phonetic, but not a name
});

test("the shipped lexicon tables all load with entries", () => {
  const lexicon = loadLexicon();
  assert.ok(lexicon.adjectives.size > 100, "adjectives");
  assert.ok(lexicon.verbs.size > 100, "verbs");
  assert.ok(lexicon.functionWords.size > 50, "function words");
  assert.ok(Object.keys(lexicon.classifiers).length > 20, "classifiers");
  assert.ok(Object.keys(lexicon.surnames).length > 100, "surnames");
  assert.ok(Object.keys(lexicon.placeSuffixes).length > 20, "place suffixes");
});
