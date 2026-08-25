"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { mineNames } = require("./name-mining");

// A controlled setup so a failure points at the miner, not at shipped data.
const surnames = { 张: "Trương", 郑: "Trịnh", 秦: "Tần" };
const hanviet = {
  张: { hv: "trương" }, 灵: { hv: "linh" }, 峰: { hv: "phong" },
  郑: { hv: "trịnh" }, 海: { hv: "hải" }, 冰: { hv: "băng" },
  秦: { hv: "tần" }, 楚: { hv: "sở" },
  惨: { hv: "thảm" }, 白: { hv: "bạch" }, 铁: { hv: "thiết" }, 站: { hv: "trạm" }
};
const isName = (c) => !!hanviet[c];
const titleCase = (s) => s.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
// 郑海 is the shadowing junk bigram; 惨白 is a real adjective word.
const phraseDict = { 郑海: "trịnh hải", 惨白: "trắng bệch", 高铁: "đường sắt" };

function opts(extra) {
  return { surnames, hanviet, isName, titleCase, phraseDict, minCount: 3, ...extra };
}

// A repeated name, in varied contexts, is mined; a rare mention is not.
test("a frequent name is mined, a one-off is not", () => {
  const texts = ["张灵峰说。张灵峰走了。张灵峰笑。张灵峰来。 秦楚只出现一次。"];
  const g = mineNames(texts, opts());
  assert.strictEqual(g["张灵峰"], "Trương Linh Phong");
  assert.ok(!g["秦楚"], "a single mention is below the threshold");
});

// The whole point: a 3-char name beats a shadowing 2-char dictionary bigram.
test("a name is mined past a shadowing dictionary bigram", () => {
  const texts = ["郑海冰说。郑海冰看。郑海冰走。郑海冰笑了。"];
  const g = mineNames(texts, opts());
  assert.strictEqual(g["郑海冰"], "Trịnh Hải Băng");
  assert.ok(!g["郑海"], "the junk bigram is not promoted");
});

// A surname in front of an adjective word (张惨白 = 张 + 惨白) is not a person.
test("a surname before a dictionary word is not mined", () => {
  const texts = Array(6).fill("他张惨白的脸。").join("");
  const g = mineNames(texts, opts());
  assert.ok(!g["张惨白"], "given half is the word 惨白");
});

// A fixed compound (高铁 -> 站) has low right-neighbour variety and is filtered.
test("a fixed compound is filtered by branching diversity", () => {
  const texts = [Array(8).fill("高铁站").join("，")];
  const g = mineNames(texts, opts());
  assert.ok(!g["高铁"], "高铁 is always followed by 站");
});

test("the longest name wins, no truncated prefix leaks", () => {
  const texts = ["张灵峰说。张灵峰走。张灵峰笑。张灵峰来。"];
  const g = mineNames(texts, opts());
  assert.ok(g["张灵峰"], "full name kept");
  assert.ok(!g["张灵"], "2-char prefix not emitted separately");
});
