"use strict";

// Corpus tests — the real dictionaries, the real tables, the real sample files.
//
// The unit tests pin the rules; these pin the *outcome* on prose, which is where
// a data edit does its damage. Two kinds of assertion, deliberately not a full
// output snapshot: a snapshot of 100 lines would fail on every dictionary tweak
// and teach everyone to regenerate it without reading it.
//
//   1. Invariants over data/convert/samples/negatives.txt — ordinary prose that
//      must come out untouched. The important one is capitalisation: a
//      Title-Cased word mid-sentence means the proper-noun layer fired on a
//      common noun, which is the failure mode with the widest blast radius.
//   2. Anchors on data/convert/samples/samples.txt — one assertion per grammar
//      rule, phrased as "this fragment must appear", so an unrelated dictionary
//      change cannot break it.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { buildConvertEngineFromDisk } = require("./index");

const SAMPLES = path.join("data", "convert", "samples", "samples.txt");
const NEGATIVES = path.join("data", "convert", "samples", "negatives.txt");

// Proper nouns the *dictionary* supplies. They are correct, and they are
// Title-Cased before the proper-noun layer ever sees them, so the false-positive
// check has to let them through.
const DICTIONARY_NAMES = new Set(["Ma", "Nguyên", "Kim", "Đan", "Điền", "Tiên", "Tử"]);

const engine = buildConvertEngineFromDisk();

function corpus(file) {
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

// Words that open a sentence are supposed to be capitalised; everything else
// is a proper noun, correct or not.
function midSentenceCapitals(line) {
  const words = line.split(/\s+/);
  return words.filter((word, i) => {
    if (i === 0) return false;
    if (/[.!?:…“‘]$/.test(words[i - 1])) return false;
    return /^\p{Lu}/u.test(word) && !DICTIONARY_NAMES.has(word);
  });
}

test("the shipped dictionaries build an engine", () => {
  assert.ok(engine, "no convert engine — run scripts/build-convert-dicts.js");
});

test("ordinary prose gets no invented proper nouns", () => {
  const offenders = [];
  for (const zh of corpus(NEGATIVES)) {
    const vi = engine.convert(zh);
    for (const word of midSentenceCapitals(vi)) offenders.push(`${word} — ${zh} -> ${vi}`);
  }
  assert.deepStrictEqual(offenders, [], "proper-noun layer fired on a common noun");
});

test("no sample produces a doubled or dangling link word", () => {
  const offenders = [];
  for (const zh of [...corpus(SAMPLES), ...corpus(NEGATIVES)]) {
    const vi = engine.convert(zh);
    if (/\b(của|mà)\s+(của|mà)\b/.test(vi)) offenders.push(`doubled: ${vi}`);
    if (/\b(của|mà)\s*[.,!?…]/.test(vi)) offenders.push(`dangling: ${vi}`);
    if (/\s{2,}/.test(vi)) offenders.push(`double space: ${vi}`);
  }
  assert.deepStrictEqual(offenders, []);
});

test("every sample converts to non-empty Vietnamese with no Han left over", () => {
  const offenders = [];
  for (const zh of [...corpus(SAMPLES), ...corpus(NEGATIVES)]) {
    const vi = engine.convert(zh);
    if (!vi) offenders.push(`empty: ${zh}`);
    // A stray Han character means no table covered it — worth knowing about.
    if (/\p{Script=Han}/u.test(vi)) offenders.push(`untranslated: ${zh} -> ${vi}`);
  }
  assert.deepStrictEqual(offenders, []);
});

test("paragraph structure survives a multi-paragraph chapter", () => {
  const chapter = corpus(SAMPLES).slice(0, 6).join("\n\n");
  const out = engine.convert(chapter);
  assert.strictEqual(out.split("\n\n").length, 6);
});

// --- Anchors, one per grammar rule -------------------------------------------

const ANCHORS = [
  // possessive 的 -> "head của modifier"
  ["天玄宗的弟子们脸色大变。", "các đệ tử của Thiên Huyền tông"],
  ["东荒域的强者纷纷赶来。", "cường giả của Đông Hoang vực"],
  ["这本书记载了上古时期的秘密。", "bí mật của thời kỳ thượng cổ"],
  // relative clause 的 -> "head mà clause"
  ["我要变强，强到没有人可以伤害我在乎的人。", "người mà ta quan tâm"],
  ["那是他母亲留下的东西。", "mà mẫu thân hắn lưu lại"],
  // a governed clause keeps convert order instead
  ["他从怀里掏出的丹药散发着淡淡的香气。", "hắn từ trong lòng ngực móc ra đan dược"],
  // attributive 的 -> postposed adjective
  ["锋利的剑气瞬间撕裂了空气。", "kiếm khí sắc bén"],
  ["他的丹田之中凝聚出了一颗金色的丹药。", "đan dược màu vàng"],
  // quantity 的 -> postposed, no "của"
  ["突破到金丹期需要至少三十年的苦修。", "khổ tu ít nhất ba mươi năm"],
  // demonstrative postposes past its classifier
  ["韩立默默地收起了那枚储物袋。", "cái túi đựng đồ kia"],
  // locative fronts a proper noun
  ["紫云殿内一片寂静。", "Trong Tử Vân điện"],
  ["落霞山上的桃花开了。", "Trên Lạc Hà sơn"],
  // proper nouns: phonetic, Title Case, and not read for meaning
  ["苏落雪站在山巅，白衣胜雪。", "Tô Lạc Tuyết"],
  ["叶辰盘膝而坐，闭目调息。", "Diệp Thần"],
  ["三天之后，整个青云城都知道了这件事。", "Thanh Vân thành"],
  ["他一路向北，穿过了幽冥谷。", "U Minh cốc"],
  // dialogue opens a sentence
  ["她小声说：「我怕。」", "“Ta sợ.”"],
  // adverbial 地 is glue, not "đất"
  ["她轻轻地叹了一口气，转身走出了房间。", "nhẹ nhàng thở dài"]
];

// An anchor that lands at the start of the sentence gets its first letter
// capitalised, so both spellings count. Only the first letter — the rest of the
// fragment stays case-sensitive, which is what makes the Title-Case anchors
// ("Tô Lạc Tuyết", "Trong Tử Vân điện") worth asserting.
function contains(vi, fragment) {
  const capitalised = fragment.charAt(0).toLocaleUpperCase("vi") + fragment.slice(1);
  return vi.includes(fragment) || vi.includes(capitalised);
}

for (const [zh, expected] of ANCHORS) {
  test(`anchor: ${expected}`, () => {
    const vi = engine.convert(zh);
    assert.ok(contains(vi, expected), `expected "${expected}" in:\n  ${vi}`);
  });
}
