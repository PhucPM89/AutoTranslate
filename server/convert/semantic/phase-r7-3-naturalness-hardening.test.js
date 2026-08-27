"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildConvertEngineFromDisk } = require("../../convert");

const engine = buildConvertEngineFromDisk(process.env);

// =========================================================================
// Phase R7-3 — Vietnamese Expression Naturalness Hardening Tests
// =========================================================================

test("Phase R7-3 - 1. Adversarial Locative Rebirth: No duplicate 'trong... bên trong'", () => {
  const res = engine.convertSemantic("神魂却于毁灭之中浴火重生！");
  assert.ok(/thế nhưng lại trong hủy diệt|lại trong hủy diệt|ở trong hủy diệt|lại hồi sinh giữa biển lửa/i.test(res), "Must translate adversative-locative smoothly");
  assert.ok(/dục hỏa trùng sinh|tái sinh trong biển lửa|hồi sinh giữa biển lửa/i.test(res), "Must translate 浴火重生 as dục hỏa trùng sinh or hồi sinh giữa biển lửa");
  assert.ok(!/bên trong dục hỏa/i.test(res) && !/hủy diệt bên trong/i.test(res), "Must NOT have duplicate 'bên trong'");
  assert.ok(!/trùng sống/i.test(res), "Must NOT calque 重生 as 'trùng sống'");
});

test("Phase R7-3 - 2. Nominal Head Composition: 一记凌厉的横扫", () => {
  const res = engine.convertSemantic("一记凌厉的横扫。");
  assert.ok(/một (?:cú|đường|đòn) quét ngang sắc bén|quét ngang lăng lệ/i.test(res), "Must compose nominal head smoothly");
  assert.ok(!/của lăng lệ/i.test(res) && !/lăng lệ ác liệt/i.test(res), "Must NOT have 'của lăng lệ' or double adjective stack");
});

test("Phase R7-3 - 3. Purpose Head Construction: 逼宫的最佳时机", () => {
  const res = engine.convertSemantic("这是逼宫的最佳时机。");
  assert.ok(/thời cơ tốt nhất để bức cung|cơ hội tốt nhất để bức cung/i.test(res), "Must resolve purpose glue 'để' and court term 'bức cung'");
  assert.ok(!/của bức vua thoái vị/i.test(res) && !/bức vua thoái vị/i.test(res), "Must NOT have raw 'bức vua thoái vị'");
});

test("Phase R7-3 - 4. Relative Clause Construction: 记载了秘密的书籍", () => {
  const res = engine.convertSemantic("记载了秘密的书籍。");
  assert.ok(/(?:sách(?: vở)?|cuốn sách) ghi lại bí mật/i.test(res), "Must invert relative clause into 'cuốn sách / sách ghi lại bí mật'");
  assert.ok(!/của bí mật/i.test(res), "Must NOT produce literal 'của bí mật'");
});

test("Phase R7-3 - 5. Pronoun Rhythm & Coordinate Pro-Drop: 他走过去，他拿起剑，他转身。", () => {
  const res = engine.convertSemantic("他走过去，他拿起剑，他转身。");
  assert.ok(/^Hắn (?:đi|bước) qua,\s*(?:cầm|cầm lấy) kiếm,\s*quay người/i.test(res), "Must suppress repetitive pronoun stutter in coordinate actions");
  assert.ok(!/,\s*Hắn cầm/i.test(res) && !/,\s*Hắn quay/i.test(res), "Must NOT repeat capital 'Hắn' across coordinate clauses");
});

test("Phase R7-3 - 6. Inanimate Subject Guard: 药鼎轰鸣。", () => {
  const res = engine.convertSemantic("药鼎轰鸣。");
  assert.ok(/Dược Đỉnh (?:nổ vang|ầm ầm|rung lên)/i.test(res), "Must retain inanimate proper subject without human pronoun");
  assert.ok(!/^Hắn Dược Đỉnh/i.test(res), "Must NOT prepend human pronoun to inanimate subject");
});

test("Phase R7-3 - 7. Dialogue Tag Naturalness: 戏谑道 & 干笑道", () => {
  const teaseRes = engine.convertSemantic("胖道士戏谑道：「小友，你这又是何苦？」");
  assert.ok(/trêu chọc|cười trêu|cười giễu/i.test(teaseRes), "Must translate 戏谑道 as natural dialogue tag");
  assert.ok(!/giễu giễu nói/i.test(teaseRes) && !/hí hước đạo/i.test(teaseRes), "Must NOT output stiff calque");
  assert.ok(/: [“"「]/.test(teaseRes), "Must format reporting verb with colon before opening quote");

  const awkwardRes = engine.convertSemantic("胖道士擦了擦冷汗，干笑道：「道爷我不过是路过。」");
  assert.ok(/cười gượng|cười trừ/i.test(awkwardRes), "Must translate 干笑道 as cười gượng");
  assert.ok(!/cười khan nói/i.test(awkwardRes) && !/can tiếu đạo/i.test(awkwardRes), "Must NOT output stiff calque");
});

test("Phase R7-3 - 8. Cognitive Naturalness: 萧炎心中暗道", () => {
  const res = engine.convertSemantic("萧炎心中暗道：「此人实力深不可测。」");
  assert.ok(/Tiêu Viêm (?:thầm nghĩ|trong lòng thầm nghĩ):/i.test(res), "Must translate 心中暗道 as thầm nghĩ with colon");
  assert.ok(/: [“"「]/.test(res), "Must format speech/thought reporting verb with colon before opening quote");
});

test("Phase R7-3 - 9. Resultative & Degree Complement Naturalness", () => {
  const runRes = engine.convertSemantic("小丫头跑得飞快。");
  assert.ok(/chạy nhanh như bay|chạy cực nhanh|chạy rất nhanh/i.test(runRes), "Must translate 跑得飞快 naturally");

  const angerRes = engine.convertSemantic("他气得浑身发抖。");
  assert.ok(/tức đến mức toàn thân run rẩy|giận đến toàn thân run rẩy|tức đến run người/i.test(angerRes), "Must translate 气得浑身发抖 naturally");
  assert.ok(!/khí đắc/i.test(angerRes), "Must NOT output raw 'khí đắc'");

  const burrowRes = engine.convertSemantic("吓得直往我怀里钻。");
  assert.ok(/sợ đến mức chui thẳng vào lòng ta|sợ đến chui thẳng vào lòng ta/i.test(burrowRes), "Must translate 吓得直往我怀里钻 naturally");
  assert.ok(!/hách đắc/i.test(burrowRes) && !/toản/i.test(burrowRes), "Must NOT output 'hách đắc' or 'toản'");
});

test("Phase R7-3 - 10. Attributive Descriptors: 绝美的容颜 & 锋利的长剑", () => {
  const beautyRes = engine.convertSemantic("绝美的容颜。");
  assert.ok(/Dung nhan tuyệt mỹ/i.test(beautyRes), "Must translate 绝美的容颜 as Dung nhan tuyệt mỹ");

  const swordRes = engine.convertSemantic("锋利的长剑。");
  assert.ok(/Trường kiếm sắc bén/i.test(swordRes), "Must translate 锋利的长剑 as Trường kiếm sắc bén");
});
