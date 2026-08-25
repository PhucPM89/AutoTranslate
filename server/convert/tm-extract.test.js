"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { pairParagraph, isGenericClause, buildTM } = require("./tm-extract");

test("clauses pair 1:1 when the split counts match, and edges are trimmed", () => {
  const pairs = pairParagraph("他冷哼一声，转身离开。", "“Hắn lạnh lùng hừ một tiếng, xoay người rời đi.");
  assert.deepStrictEqual(pairs, [
    ["他冷哼一声", "Hắn lạnh lùng hừ một tiếng"],
    ["转身离开", "xoay người rời đi"]
  ]);
});

test("a paragraph whose clause counts disagree is skipped, not guessed", () => {
  assert.deepStrictEqual(pairParagraph("甲，乙，丙。", "một, hai."), []);
});

test("generic clause filter rejects digits, latin and bad lengths", () => {
  assert.ok(isGenericClause("话音刚落"));
  assert.ok(!isGenericClause("三十年后")); // a digit-bearing count
  assert.ok(!isGenericClause("走")); // too short
  assert.ok(!isGenericClause("A计划启动")); // latin
});

test("a clause is kept only when it recurs across at least two books", () => {
  const inOneBook = [
    { book: "b1", paras: [["秦禹皱眉。", "Tần Vũ nhíu mày."]] },
    { book: "b1", paras: [["秦禹皱眉。", "Tần Vũ nhíu mày."]] },
    { book: "b1", paras: [["秦禹皱眉。", "Tần Vũ nhíu mày."]] },
    { book: "b1", paras: [["秦禹皱眉。", "Tần Vũ nhíu mày."]] }
  ];
  assert.deepStrictEqual(buildTM(inOneBook, { minCount: 3, minBooks: 2 }), {});

  const acrossBooks = [
    { book: "b1", paras: [["与此同时。", "Cùng lúc đó."]] },
    { book: "b1", paras: [["与此同时。", "Cùng lúc đó."]] },
    { book: "b2", paras: [["与此同时。", "Cùng lúc đó."]] },
    { book: "b3", paras: [["与此同时。", "Cùng lúc đó."]] }
  ];
  assert.strictEqual(buildTM(acrossBooks, { minCount: 3, minBooks: 2 })["与此同时"], "cùng lúc đó");
});

test("the dominant translation wins, and disagreement below the floor is dropped", () => {
  const mk = (vi) => ({ book: Math.random() > 0.5 ? "b1" : "b2", paras: [["就在这时。", vi]] });
  // 4x "Đúng lúc này", 1x noise -> 80% agreement, kept.
  const chapters = [
    { book: "b1", paras: [["就在这时。", "Đúng lúc này"]] },
    { book: "b2", paras: [["就在这时。", "Đúng lúc này"]] },
    { book: "b3", paras: [["就在这时。", "Đúng lúc này"]] },
    { book: "b4", paras: [["就在这时。", "Đúng lúc này"]] },
    { book: "b5", paras: [["就在这时。", "Ngay khi đó"]] }
  ];
  assert.strictEqual(buildTM(chapters, { minCount: 3, minBooks: 2, minAgreement: 0.6 })["就在这时"], "đúng lúc này");
});
