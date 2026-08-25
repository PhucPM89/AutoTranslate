"use strict";

// The grammar layer decides word order, so these tests are written against token
// streams directly: no dictionary, no phonetics, no guessing what VietPhrase
// happens to contain. Each token is what tokenize() would have produced —
// { t, s, zh, k } — and the assertion is on the order that comes back out.

const { test } = require("node:test");
const assert = require("node:assert");
const { applyGrammar, de, adjective, demonstrative, locative } = require("./grammar");

function w(s, zh, k = "noun") {
  return { t: "w", s, zh, k };
}
const DE = () => w("của", "的", "de");
const stop = () => ({ t: "close", s: "." });
const text = (tokens) => tokens.map((t) => t.s).join(" ");

test("noun 的 noun becomes head + của + modifier", () => {
  const out = de([w("Thiên Huyền tông", "天玄宗", "name"), DE(), w("các đệ tử", "弟子们")]);
  assert.strictEqual(text(out), "các đệ tử của Thiên Huyền tông");
});

test("a possessor keeps its pronoun but nothing else", () => {
  // 他父亲的剑 — the pronoun joins, so "kiếm của phụ thân hắn".
  const out = de([w("hắn", "他"), w("phụ thân", "父亲"), DE(), w("kiếm", "剑")]);
  assert.strictEqual(text(out), "kiếm của hắn phụ thân");
});

test("a verb before 的 is not swallowed into the possessor", () => {
  // 辜负您的期望 — the classic failure: "kỳ vọng của phụ lòng ngài".
  const out = de([w("phụ lòng", "辜负", "verb"), w("ngài", "您"), DE(), w("kỳ vọng", "期望")]);
  assert.strictEqual(text(out), "phụ lòng kỳ vọng của ngài");
});

test("a quantity modifier postposes with no của", () => {
  const out = de([w("ba mươi năm", "三十年", "num"), DE(), w("khổ tu", "苦修")]);
  assert.strictEqual(text(out), "khổ tu ba mươi năm");
});

test("a quantity adverb travels with the quantity", () => {
  const out = de([w("ít nhất", "至少", "fn"), w("ba mươi năm", "三十年", "num"), DE(), w("khổ tu", "苦修")]);
  assert.strictEqual(text(out), "khổ tu ít nhất ba mươi năm");
});

test("a locative possessor takes no của", () => {
  // 传说中的神鸟 -> "thần điểu trong truyền thuyết", not "của trong truyền thuyết".
  const out = de([w("trong truyền thuyết", "传说中"), DE(), w("thần điểu", "神鸟")]);
  assert.strictEqual(text(out), "thần điểu trong truyền thuyết");
});

test("a relative clause with a subject reorders with mà", () => {
  const out = de([w("ta", "我"), w("quan tâm", "在乎", "verb"), DE(), w("người", "人")]);
  assert.strictEqual(text(out), "người mà ta quan tâm");
});

test("a bare verb clause reorders without mà", () => {
  const out = de([w("chết đi", "死去", "verb"), DE(), w("người", "人")]);
  assert.strictEqual(text(out), "người chết đi");
});

test("a clause governed by a preposition keeps convert order", () => {
  // 从怀里掏出的丹药 — 从 would be stranded, so only 的 is dropped.
  const out = de([
    w("từ trong lòng ngực", "从怀里"), w("móc ra", "掏出", "verb"), DE(), w("đan dược", "丹药")
  ]);
  assert.strictEqual(text(out), "từ trong lòng ngực móc ra đan dược");
});

test("a passive marker joins the clause instead of blocking it", () => {
  const out = de([
    w("bị", "被", "fn"), w("hắn", "他"), w("đả thương", "打伤", "verb"), DE(), w("người", "人")
  ]);
  assert.strictEqual(text(out), "người mà bị hắn đả thương");
});

test("a modal joins a subjectless clause", () => {
  const out = de([w("không thể", "不可", "fn"), w("vãn hồi", "挽回", "verb"), DE(), w("tình trạng", "地步")]);
  assert.strictEqual(text(out), "tình trạng mà không thể vãn hồi");
});

test("a modal governing the main verb is left alone", () => {
  // 可以伤害我在乎的人 — 可以 belongs to 伤害, not to the relative clause.
  const out = de([
    w("có thể", "可以", "fn"), w("tổn thương", "伤害", "verb"),
    w("ta", "我"), w("quan tâm", "在乎", "verb"), DE(), w("người", "人")
  ]);
  assert.strictEqual(text(out), "có thể tổn thương người mà ta quan tâm");
});

test("的 is dropped when what follows is not a noun phrase", () => {
  const out = de([w("nắm", "握着", "verb"), DE(), w("là", "是", "fn"), w("ngọc bội", "玉佩")]);
  assert.strictEqual(text(out), "nắm là ngọc bội");
});

test("an adjective before 的 drops it and then postposes", () => {
  const out = applyGrammar([w("cổ xưa", "古老", "adj"), DE(), w("sách vở", "书籍")]);
  assert.strictEqual(text(out), "sách vở cổ xưa");
});

test("adjective postposing does not cross a predicate entry", () => {
  // 父亲是 -> "phụ thân là" already contains the copula; swapping breaks it.
  const out = adjective([w("cổ xưa", "古老", "adj"), w("phụ thân là", "父亲是")]);
  assert.strictEqual(text(out), "cổ xưa phụ thân là");
});

test("a totality quantifier stays in front of its noun", () => {
  const out = adjective([w("toàn bộ", "全部", "adj"), w("nội tình", "内情")]);
  assert.strictEqual(text(out), "toàn bộ nội tình");
});

test("a demonstrative moves past its classifier and noun", () => {
  const out = demonstrative([w("kia", "那", "dem"), w("cái", "枚", "cl"), w("ngọc bội", "玉佩")]);
  assert.strictEqual(text(out), "cái ngọc bội kia");
});

test("a demonstrative with nothing nominal after it stays put", () => {
  const out = demonstrative([w("kia", "那", "dem"), w("là", "是", "fn"), w("hắn", "他")]);
  assert.strictEqual(text(out), "kia là hắn");
});

test("a locative after a proper noun becomes a leading preposition", () => {
  const loc = { t: "w", s: "nội", zh: "内", k: "loc", alt: "trong" };
  const out = locative([w("Tử Vân điện", "紫云殿", "name"), loc, w("yên tĩnh", "寂静")]);
  assert.strictEqual(text(out), "trong Tử Vân điện yên tĩnh");
});

test("a locative belonging to a rewritten head noun is left alone", () => {
  // "sơn môn của Thiên Huyền tông" + 前: moving 前 would attach it to the name.
  const loc = { t: "w", s: "trước", zh: "前", k: "loc", alt: "trước" };
  const out = locative([
    w("sơn môn", "山门"), w("của", "的", "fn"), w("Thiên Huyền tông", "天玄宗", "name"), loc
  ]);
  assert.strictEqual(text(out), "sơn môn của Thiên Huyền tông trước");
});

test("a locative after a common noun is left to the dictionary", () => {
  const loc = { t: "w", s: "thượng", zh: "上", k: "loc", alt: "trên" };
  const out = locative([w("sách vở", "书籍"), loc]);
  assert.strictEqual(text(out), "sách vở thượng");
});

test("punctuation ends every walk", () => {
  const out = de([w("hắn", "他"), stop(), w("kiếm", "剑"), DE(), w("mũi nhọn", "锋芒")]);
  assert.strictEqual(out.map((t) => t.s).join(" "), "hắn . mũi nhọn của kiếm");
});

test("two 的 in one sentence are rewritten independently", () => {
  const out = de([
    w("Lâm Động", "林动", "name"), DE(), w("phụ thân", "父亲"), w("là", "是", "fn"),
    w("Thanh Vân thành", "青云城", "name"), DE(), w("thành chủ", "城主")
  ]);
  assert.strictEqual(text(out), "phụ thân của Lâm Động là thành chủ của Thanh Vân thành");
});
