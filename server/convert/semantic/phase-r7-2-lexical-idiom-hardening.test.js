"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildConvertEngineFromDisk } = require("../index");
const { createLexicalCandidateGenerator } = require("./lexical-candidate-generator");
const { createLexicalResolver } = require("./lexical-resolver");

// Build engine for end-to-end testing
const engine = buildConvertEngineFromDisk(process.env);

// =========================================================================
// 1. Golden Tests (Idiom & Construction Hardening)
// =========================================================================

test("Phase R7-2 - 1. Golden Test: 这事包在我身上 (Idiomatic Colloquial Assurance)", () => {
  const res = engine.convertSemantic("张伟拍着胸脯保证道：「哥们，这事包在我身上，绝对稳妥！」");
  assert.ok(res.includes("cứ để tôi lo") || res.includes("giao cho tôi"), "Must translate as idiomatic assurance, not literal 'quấn trên người'");
  assert.ok(!res.includes("quấn"), "Must NOT calque 'quấn'");
});

test("Phase R7-2 - 2. Golden Test: 舞刀弄枪 (Martial Display Idiom)", () => {
  const res = engine.convertSemantic("胖道士擦了擦额头冷汗，干笑道：「无量天尊，道爷我不过是路过，各位何必舞刀弄枪？」");
  assert.ok(res.includes("múa đao múa kiếm") || res.includes("động đao"), "Must translate as 'múa đao múa kiếm', not raw 'vũ đao lộng thương'");
  assert.ok(!res.includes("vũ đao lộng thương"), "Must NOT output Sino-Vietnamese calque");
});

test("Phase R7-2 - 3. Golden Test: 九字真言 (Domain Daoist Sacred Term)", () => {
  const res = engine.convertSemantic("老道士拂尘一甩，九字真言化作金色锁链轰然镇压！");
  assert.ok(res.includes("Cửu Tự Chân Ngôn") || res.includes("cửu Tự Chân Ngôn"), "Must preserve Daoist domain term 'Cửu Tự Chân Ngôn'");
  assert.ok(!res.includes("chữ số 9"), "Must NOT split into 'chữ số 9 chân ngôn'");
});

test("Phase R7-2 - 4. Golden Test: 打入冷宫 (Imperial Court Construction)", () => {
  const res = engine.convertSemantic("皇帝大怒，下旨将贵妃打入冷宫。");
  assert.ok(res.includes("đày vào lãnh cung") || res.includes("đưa vào lãnh cung"), "Must translate as 'đày vào lãnh cung', not 'đánh vào'");
  assert.ok(!res.includes("đánh vào lãnh cung"), "Must NOT use literal 'đánh vào'");
});

test("Phase R7-2 - 5. Golden Test: 茶香幽幽 (Aroma Sensory Adjective)", () => {
  const res = engine.convertSemantic("幽泉古刹，茶香幽幽，老僧端坐蒲团之上。");
  assert.ok(res.includes("thoang thoảng") || res.includes("phảng phất"), "Must translate tea aroma as 'thoang thoảng / phảng phất', not 'sâu kín'");
});

test("Phase R7-2 - 6. Golden Test: 轰然劈下 (Acoustic / Kinetic Impact)", () => {
  const res = engine.convertSemantic("九重雷劫轰然劈下！");
  assert.ok(res.includes("ầm ầm") || res.includes("vang dội"), "Must translate kinetic impact as 'ầm ầm', not 'Oanh Nhiên'");
});

test("Phase R7-2 - 7. Golden Test: 佳人依窗而立 (Classical Poetic Posture)", () => {
  const res = engine.convertSemantic("佳人依窗而立，云鬓斜簪。");
  assert.ok(res.includes("tựa bên cửa sổ") || res.includes("tựa vào cửa sổ"), "Must translate as 'tựa bên cửa sổ mà đứng', not 'y đứng ở cửa sổ'");
  assert.ok(!res.includes("y đứng ở cửa sổ"), "Must NOT misuse pronoun 'y' for '依'");
});

test("Phase R7-2 - 8. Golden Test: 直往我怀里钻 (Directional Burrowing Motion)", () => {
  const res = engine.convertSemantic("少年戏谑道：「方才不知是谁吓得直往我怀里钻。」");
  assert.ok(res.includes("chui thẳng vào") || res.includes("thẳng vào"), "Must translate directional motion naturally");
  assert.ok(!res.includes("toản") && !res.includes("nhắm ta trong ngực"), "Must NOT output literal 'toản' or 'nhắm ta'");
});

test("Phase R7-2 - 9. Golden Test: 不可不防 (Necessity Double-Negative)", () => {
  const res = engine.convertSemantic("此事事关重大，不可不防。");
  assert.ok(/không thể không|nhất định phải|buộc phải/i.test(res), "Must translate double-negative as necessity");
});

test("Phase R7-2 - 10. Golden Test: 却于毁灭之中浴火重生 (Adversative Locative)", () => {
  const res = engine.convertSemantic("神魂却于毁灭之中浴火重生！");
  assert.ok(/lại hồi sinh|thế nhưng lại trong|thế nhưng lại ở trong|lại trong|ở trong/i.test(res), "Must translate adversative-locative naturally");
  assert.ok(!/khước vu/i.test(res), "Must NOT output raw 'khước vu'");
});

// =========================================================================
// 2. Negative Tests (Polysemy Safety & Lexical Independence)
// =========================================================================

test("Phase R7-2 - 11. Negative Test: 包 / 依 / 钻 / 舞 / 却 Polysemic Independence", () => {
  // 包裹 / 包装 -> wrap/package, NOT "lo liệu"
  const pkgRes = engine.convertSemantic("他打开了包裹。");
  assert.ok(/bọc|gói|hành lý/i.test(pkgRes), "包裹 must remain package/bundle");

  // 依然 / 依靠 -> still/rely, NOT "tựa cửa sổ"
  const stillRes = engine.convertSemantic("他依然站在那里。");
  assert.ok(/vẫn|như cũ/i.test(stillRes), "依然 must remain still/as before");

  const relyRes = engine.convertSemantic("依靠自己的力量。");
  assert.ok(/dựa vào/i.test(relyRes), "依靠 must remain rely on");

  // 钻研 / 钻石 -> research/diamond, NOT "chui vào ngực"
  const studyRes = engine.convertSemantic("苦心钻研丹道。");
  assert.ok(/nghiên cứu/i.test(studyRes), "钻研 must remain study/research");

  const diamondRes = engine.convertSemantic("一颗璀璨的钻石。");
  assert.ok(/kim cương/i.test(diamondRes), "钻石 must remain diamond");

  // 舞台 -> stage, NOT "múa đao"
  const stageRes = engine.convertSemantic("站在舞台中央。");
  assert.ok(/sân khấu/i.test(stageRes), "舞台 must remain stage");

  // 却是 / 由于 -> but/because, NOT "khước vu"
  const butRes = engine.convertSemantic("却是不知道。");
  assert.ok(/nhưng|lại/i.test(butRes), "却是 must remain adversative conjunction");

  const dueRes = engine.convertSemantic("由于天气原因。");
  assert.ok(/do|bởi vì/i.test(dueRes), "由于 must remain causal preposition");
});

// =========================================================================
// 3. Adversarial Tests (Same Token, Different Structural Contexts)
// =========================================================================

test("Phase R7-2 - 12. Adversarial Test: Contextual Disambiguation of Homographs", () => {
  // 依窗而立 vs 依然
  const leanRes = engine.convertSemantic("佳人依窗而立。");
  const asIsRes = engine.convertSemantic("青山依然美丽。");
  assert.ok(/tựa bên cửa sổ/i.test(leanRes), "依窗而立 resolves to posture");
  assert.ok(/vẫn|như cũ/i.test(asIsRes), "依然 resolves to temporal aspect");

  // 将军 vs 将 + NP + Verb
  const generalRes = engine.convert("镇国将军");
  const disposalRes = engine.convertSemantic("将敌人斩杀。");
  assert.ok(/tướng quân/i.test(generalRes), "将军 remains military title");
  assert.ok(/chém chết|tiêu diệt|đem/i.test(disposalRes), "将 + NP + Verb acts as disposal");

  // 得意 vs 吓得
  const proudRes = engine.convert("得意洋洋");
  const scareRes = engine.convertSemantic("他吓得浑身发抖。");
  assert.ok(/đắc ý/i.test(proudRes), "得意 remains proud");
  assert.ok(/sợ|run rẩy/i.test(scareRes), "吓得 resolves to fear degree complement");
});

// =========================================================================
// 4. Lexical Tier Provenance Tracing Test
// =========================================================================

test("Phase R7-2 - 13. Provenance & Tier Priority: IDIOM_CONSTRUCTION outranks raw dictionary match", () => {
  const gen = createLexicalCandidateGenerator();
  const graph = gen.generateCandidateGraph("各位何必舞刀弄枪？");
  assert.ok(graph.nodes.length > 0, "Graph generated");

  const resolver = createLexicalResolver({ candidateGenerator: gen });
  const result = resolver.resolveText("各位何必舞刀弄枪？");
  assert.equal(result.status, "RESOLVED", "Resolver resolves successfully");

  const idiomRecord = result.resolutionRecords.find((r) => r.sourceSpan === "舞刀弄枪");
  assert.ok(idiomRecord, "Idiom resolution record recorded");
  assert.equal(idiomRecord.selectedCandidate, "múa đao múa kiếm", "Idiom candidate selected");
});
