"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildConvertEngineFromDisk } = require("../../convert");
const { detectCalquePatterns } = require("./calque-detector");

const engine = buildConvertEngineFromDisk(process.env);

// =========================================================================
// Phase R7-3.1 — Native Vietnamese Collocation & Calque Elimination Tests
// =========================================================================

test("Phase R7-3.1 - 1. Adversarial Case 1: 神魂却于毁灭之中浴火重生 (Classical Rebirth)", () => {
  const res = engine.convertSemantic("神魂却于毁灭之中浴火重生！");
  assert.ok(/thần hồn lại hồi sinh giữa biển lửa hủy diệt|thần hồn lại tái sinh/i.test(res), "Must synthesize natural rebirth prose");
  assert.ok(!/thế nhưng lại trong hủy diệt/i.test(res), "Must NOT use mechanical literal syntax");
  assert.ok(!/trùng sống/i.test(res), "Must NOT use 'trùng sống'");
  assert.ok(!/bên trong/i.test(res), "Must NOT have duplicate locative");

  const calqueCheck = detectCalquePatterns(res);
  assert.ok(calqueCheck.isCalqueFree, "Output must be 100% calque free");
});

test("Phase R7-3.1 - 2. Adversarial Case 2: 佳人依窗而立 (Posture without 'mà đứng')", () => {
  const res = engine.convertSemantic("佳人依窗而立。");
  assert.ok(/giai nhân tựa bên cửa sổ/i.test(res), "Must translate posture naturally");
  assert.ok(!/mà đứng/i.test(res), "Must NOT have stiff 'mà đứng'");

  const calqueCheck = detectCalquePatterns(res);
  assert.ok(calqueCheck.isCalqueFree, "Posture must be calque-free");
});

test("Phase R7-3.1 - 3. Adversarial Cases 3, 4, 5: Speech Acts (戏谑道, 干笑道, 沉声道)", () => {
  const teaseRes = engine.convertSemantic("胖道士戏谑道：「小友，你这又是何苦？」");
  assert.ok(/mập đạo sĩ trêu chọc:/i.test(teaseRes), "Must translate 戏谑道 as 'trêu chọc:' without redundant 'nói'");
  assert.ok(!/trêu chọc nói/i.test(teaseRes) && !/giễu giễu nói/i.test(teaseRes), "No calque in tease speech tag");

  const awkwardRes = engine.convertSemantic("胖道士擦了擦冷汗，干笑道：「道爷我不过是路过。」");
  assert.ok(/cười gượng:/i.test(awkwardRes), "Must translate 干笑道 as 'cười gượng:' without redundant 'nói'");
  assert.ok(!/cười khan nói/i.test(awkwardRes) && !/can tiếu đạo/i.test(awkwardRes), "No calque in awkward speech tag");

  const graveRes = engine.convertSemantic("太上长老沉声道：「不可大意。」");
  assert.ok(/trầm giọng:/i.test(graveRes), "Must translate 沉声道 as 'trầm giọng:' without redundant 'nói'");
  assert.ok(!/trầm giọng nói/i.test(graveRes), "No redundant 'nói' in grave speech tag");
});

test("Phase R7-3.1 - 4. Adversarial Case 6: 记载了秘密的书籍 (Head Noun 'Cuốn sách')", () => {
  const res = engine.convertSemantic("记载了秘密的书籍。");
  assert.ok(/cuốn sách ghi lại bí mật/i.test(res), "Must use natural head noun 'cuốn sách'");
  assert.ok(!/sách vở ghi lại/i.test(res), "Must NOT use school-term 'sách vở'");
  assert.ok(!/của bí mật/i.test(res), "Must NOT produce literal 'của'");
});

test("Phase R7-3.1 - 5. Adversarial Case 7: 这是逼宫的最佳时机 (Purpose Head & Court Term)", () => {
  const res = engine.convertSemantic("这是逼宫的最佳时机。");
  assert.ok(/thời cơ tốt nhất để bức cung/i.test(res), "Must translate court term and purpose glue naturally");
  assert.ok(!/bức vua thoái vị/i.test(res) && !/của/i.test(res), "Must NOT output clumsy gloss");
});

test("Phase R7-3.1 - 6. Adversarial Case 8: 他走过去，他拿起剑，他转身 (Narrative Cadence)", () => {
  const res = engine.convertSemantic("他走过去，他拿起剑，他转身。");
  assert.ok(/^Hắn (?:đi|bước) qua,\s*(?:cầm|cầm lấy) kiếm,\s*quay người/i.test(res), "Must eliminate coordinate pronoun stutter");
  assert.ok(!/,\s*Hắn/i.test(res), "Must NOT stutter 'Hắn'");
});

test("Phase R7-3.1 - 7. Adversarial Cases 9 & 10: 茶香幽幽 & 轰然劈下", () => {
  const teaRes = engine.convertSemantic("一壶茶香幽幽。");
  assert.ok(/trà hương thoang thoảng|hương trà thoang thoảng/i.test(teaRes), "Must use aroma sensory collocation");
  assert.ok(!/sâu kín/i.test(teaRes) && !/u u/i.test(teaRes), "Must NOT use inappropriate spatial/sound candidate");

  const strikeRes = engine.convertSemantic("巨剑轰然劈下。");
  assert.ok(/ầm ầm (?:đánh|bổ|chém) xuống/i.test(strikeRes), "Must translate kinetic onomatopoeia naturally");
  assert.ok(!/oanh nhiên/i.test(strikeRes), "Must NOT use raw Sino-Vietnamese 'oanh nhiên'");
});

test("Phase R7-3.1 - 8. Posture Stances: 负手而立, 昂首而立, 临风而立, 凌空而立", () => {
  assert.ok(/chắp tay sau lưng/i.test(engine.convertSemantic("白衣老者负手而立。")), "负手而立 -> chắp tay sau lưng");
  assert.ok(/hiên ngang ngẩng đầu/i.test(engine.convertSemantic("少年昂首而立。")), "昂首而立 -> hiên ngang ngẩng đầu");
  assert.ok(/đứng đón gió/i.test(engine.convertSemantic("道人临风而立。")), "临风而立 -> đứng đón gió");
  assert.ok(/lơ lửng giữa không trung/i.test(engine.convertSemantic("强者凌空而立。")), "凌空而立 -> lơ lửng giữa không trung");
});

test("Phase R7-3.1 - 9. Dialogue Speech Tags: 冷笑道, 厉声道, 淡淡道", () => {
  assert.ok(/cười lạnh:/i.test(engine.convertSemantic("黑袍人冷笑道：「找死！」")), "冷笑道 -> cười lạnh:");
  assert.ok(/quát lớn:/i.test(engine.convertSemantic("师尊厉声道：「住手！」")), "厉声道 -> quát lớn:");
  assert.ok(/thản nhiên nói:/i.test(engine.convertSemantic("白衣女子淡淡道：「不必多言。」")), "淡淡道 -> thản nhiên nói:");
});

test("Phase R7-3.1 - 10. Calque Detector Invariant: Zero Calques across R7-3.1 outputs", () => {
  const testCorpus = [
    "神魂却于毁灭之中浴火重生！",
    "佳人依窗而立。",
    "胖道士戏谑道：「小友，你这又是何苦？」",
    "记载了秘密的书籍。",
    "这是逼宫的最佳时机。",
    "他走过去，他拿起剑，他转身。",
    "一壶茶香幽幽。",
    "巨剑轰然劈下。"
  ];

  for (const sentence of testCorpus) {
    const out = engine.convertSemantic(sentence);
    const report = detectCalquePatterns(out);
    assert.equal(report.calqueCount, 0, `Sentence "${sentence}" produced calques: ${JSON.stringify(report.warnings)}`);
    assert.equal(report.calqueScore, 1.0, `Calque score must be 1.0, got ${report.calqueScore}`);
  }
});
