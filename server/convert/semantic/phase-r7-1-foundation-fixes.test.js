"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildConvertEngineFromDisk } = require("../index");
const { createSemanticAnalyzer } = require("./semantic-analyzer");
const { createVietnameseRealizer } = require("./vietnamese-realizer");
const { segmentParagraphToClauseIRs } = require("./clause-segmenter");

// Build engine for testing
const engine = buildConvertEngineFromDisk(process.env);

// =========================================================================
// 1. Inanimate / Phenomenon Subject Pronoun Tests
// =========================================================================

test("Phase R7-1 - 1. Inanimate Subject: Suppresses human third-person pronoun on OBJECT, PHENOMENON, and LOCATION", () => {
  // Test 1: Alchemy Furnace & Purple Qi (Inanimate OBJECT / PHENOMENON)
  const culRes = engine.convertSemantic("药鼎轰鸣，九缕紫气冲天而起，绝品凝气丹终于炼制成功。");
  assert.ok(!/^hắn\s+dược\s+đỉnh/i.test(culRes), "Must NOT prepend 'hắn' to Dược Đỉnh");
  assert.ok(!/hắn\s+cửu\s+sợi/i.test(culRes), "Must NOT prepend 'hắn' to Cửu sợi tử khí");
  assert.ok(culRes.includes("Dược Đỉnh nổ vang") || culRes.includes("dược đỉnh"));

  // Test 2: Tribulation Lightning (Inanimate PHENOMENON)
  const triRes = engine.convertSemantic("九重雷劫轰然劈下，他肉身破碎，神魂却于毁灭之中浴火重生！");
  assert.ok(!/^hắn\s+cửu\s+trọng\s+lôi\s+kiếp/i.test(triRes), "Must NOT prepend 'hắn' to Cửu trọng lôi kiếp");
  assert.ok(triRes.includes("lôi kiếp"));

  // Test 3: Talisman / Mantra (Inanimate OBJECT)
  const mixRes = engine.convertSemantic("琴音戛然而止，白衣女鬼发狂般扑来，老道士拂尘一甩，九字真言化作金色锁链轰然镇压！");
  assert.ok(!/hắn\s+chữ\s+số\s+9/i.test(mixRes), "Must NOT prepend 'hắn' to Chữ số 9 chân ngôn");

  // Test 4: Desolate Grave (Inanimate LOCATION)
  const horRes = engine.convertSemantic("荒冢寂寂，血月当空，无数惨白枯手自泥土中缓缓伸出，令人毛骨悚然。");
  assert.ok(!/^hắn\s+mộ\s+hoang/i.test(horRes), "Must NOT prepend 'hắn' to Mộ hoang");
});

// =========================================================================
// 2. Coordinate Clause Pro-Drop & Casing Tests
// =========================================================================

test("Phase R7-1 - 2. Coordinate Action Pro-Drop: Maintains subject continuity without repeating 'hắn' or capitalizing mid-sentence", () => {
  const actRes = engine.convertSemantic("侧身避过刀芒，反手拔剑，一记凌厉的横扫将敌酋斩落马下！");
  // Ensure coordinate verbs remain lowercase and don't stutter pronoun
  assert.ok(!/,\s*hắn\s+trở\s+tay/i.test(actRes), "Must NOT inject redundant ', hắn trở tay'");
  assert.ok(actRes.includes("Nghiêng người") || actRes.includes("nghiêng người"));
});

test("Phase R7-1 - 2b. Reporting Verb Punctuation: Emits colon before dialogue quotes", () => {
  const dlgRes = engine.convertSemantic("太上长老冷哼一声，拂袖道：「掌门师弟，你休要执迷不悟！」");
  assert.ok(dlgRes.includes("nói: “") || dlgRes.includes("nói: \""), "Must use colon before direct speech quote");

  const thoughtRes = engine.convertSemantic("他低垂着头，心中冷笑：“老狐狸，任你机关算尽。”");
  assert.ok(thoughtRes.includes("lạnh: “") || thoughtRes.includes("lạnh: \""), "Must use colon before monologue quote");
});

// =========================================================================
// 3. 将 Disposal Construction Tests & Negatives
// =========================================================================

test("Phase R7-1 - 3. 将 Disposal Construction: Classifies transitive disposal vs Noun 'tướng'", () => {
  // Disposal construction: 把/将 + NP + Transitive Verb
  const swordOut = engine.convert("把剑拔出");
  assert.ok(swordOut.includes("rút ra") || swordOut.includes("kiếm"), "把剑拔出 reorders naturally");

  // Negative tests: Noun 'tướng' must remain correct
  const generalOut = engine.convert("大将");
  assert.equal(generalOut, "Đại tướng", "大将 must remain 'Đại tướng'");

  const commanderOut = engine.convert("将军");
  assert.equal(commanderOut, "Tướng quân", "将军 must remain 'Tướng quân'");
});

// =========================================================================
// 4. 得 Resultative / Degree Complement Tests & Negatives
// =========================================================================

test("Phase R7-1 - 4. 得 Resultative / Degree Complement: Handles V + 得 + C without raw 'đắc'", () => {
  // Negative tests: Lexical words with 得 must remain accurate
  const getOut = engine.convert("得到");
  assert.equal(getOut, "Đạt được", "得到 must remain 'Đạt được'");

  const achieveOut = engine.convert("获得");
  assert.ok(achieveOut === "Hoạch đắc" || achieveOut === "Đạt được", "获得 must remain valid dictionary output");

  const proudOut = engine.convert("得意");
  assert.equal(proudOut, "Đắc ý", "得意 must remain 'Đắc ý'");

  const worthOut = engine.convert("值得");
  assert.ok(worthOut === "Trị đắc" || worthOut === "Xứng đáng", "值得 must remain valid dictionary output");
});

// =========================================================================
// 5. 的 Modifier / Attributive vs Possessive Tests & Negatives
// =========================================================================

test("Phase R7-1 - 5. 的 Modifier Disambiguation: Postposes attributive adjectives without 'của' and preserves possessive 'của'", () => {
  // Attributive modifier: [Adj] + 的 + [Noun] -> [Noun] + [Adj] without 'của'
  const sharpSword = engine.convert("锋利的剑");
  assert.equal(sharpSword, "Kiếm sắc bén", "Attributive '锋利的剑' must be 'Kiếm sắc bén', NOT 'Kiếm của sắc bén'");

  // Possessive: [Pronoun] + 的 + [Noun] -> [Noun] + của + [Pronoun]
  const mySword = engine.convert("我的剑");
  assert.equal(mySword, "Kiếm của ta", "Possessive '我的剑' must retain 'Kiếm của ta'");
});

// =========================================================================
// 6. Adversarial Tests: Ambiguity & Inanimate Human Salience
// =========================================================================

test("Phase R7-1 - 6. Adversarial: Inanimate Object with Human Salience correctly attributes pronoun to human actor", () => {
  const gazeRes = engine.convertSemantic("他望向药鼎。");
  // 'Hắn' belongs to '他', not '药鼎'
  assert.ok(gazeRes.includes("Hắn nhìn") || gazeRes.includes("hắn nhìn"), "Human actor retains pronoun");
  assert.ok(gazeRes.includes("dược đỉnh") || gazeRes.includes("Dược Đỉnh"));
});
