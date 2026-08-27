"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createShadowCorpusEvaluator, ERROR_TAXONOMY, DIFFERENTIAL_OUTCOMES } = require("./shadow-corpus-evaluator");
const { SHADOW_EVALUATION_CORPUS } = require("./shadow-corpus-data");

// Mock baseline converter for differential evaluation
function mockBaseConvert(zhText) {
  return String(zhText)
    .replace(/青云宗/g, "Thanh Vân Tông")
    .replace(/立宗三千年/g, "lập tông ba ngàn năm")
    .replace(/底蕴深厚/g, "nội hàm thâm sâu")
    .replace(/统御八百里山川/g, "thống ngự tám trăm dặm núi non")
    .replace(/宗门覆灭/g, "tông môn bị diệt")
    .replace(/昔日辉煌化为乌有/g, "vinh quang ngày xưa tan thành mây khói")
    .replace(/众人悲痛欲绝/g, "mọi người đau đớn đến cực điểm")
    .replace(/师尊/g, "Sư tôn")
    .replace(/看着弟子/g, "nhìn đệ tử")
    .replace(/沉声道/g, "trầm giọng nói")
    .replace(/此去凶险/g, "chuyến đi này hung hiểm")
    .replace(/切记不可鲁莽/g, "hãy nhớ kỹ không được lỗ mãng")
    .replace(/掌门师兄/g, "Chưởng môn sư huynh")
    .replace(/笑道/g, "cười nói")
    .replace(/师弟何必如此客气/g, "sư đệ cần gì phải khách khí như vậy")
    .replace(/请入内叙旧/g, "xin mời vào trong hàn huyên")
    .replace(/他表面不动声色/g, "hắn bên ngoài không đổi sắc mặt")
    .replace(/心中暗道/g, "trong lòng thầm nghĩ")
    .replace(/此人绝非寻常修士/g, "người này tuyệt đối không phải tu sĩ bình thường")
    .replace(/定有后手/g, "nhất định có nước cờ sau")
    .replace(/他拔出长剑/g, "hắn rút trường kiếm ra")
    .replace(/剑气纵横/g, "kiếm khí tung hoành")
    .replace(/一剑斩出/g, "một kiếm chém ra")
    .replace(/丹炉之中/g, "bên trong đan lò")
    .replace(/清香四溢/g, "thanh hương bốn phía")
    .replace(/九转灵丹已然大成/g, "cửu chuyển linh đan đã sớm đại thành")
    .replace(/少女白衣胜雪/g, "thiếu nữ áo trắng như tuyết")
    .replace(/青丝如绢/g, "tóc đen như lụa")
    .replace(/眼若秋水/g, "mắt như nước mùa thu")
    .replace(/古墓之内阴风阵阵/g, "trong cổ mộ gió âm từng trận")
    .replace(/尸横遍野/g, "xác chết khắp nơi")
    .replace(/鬼气森然/g, "quỷ khí âm u")
    .replace(/朝堂之上/g, "trên triều đình")
    .replace(/暗流涌动/g, "sóng ngầm cuộn trào")
    .replace(/王爷早已谋划好夺嫡之策/g, "Vương gia sớm đã mưu tính sách lược đoạt đích")
    .replace(/他冷哼道/g, "hắn hừ lạnh nói")
    .replace(/你可真厉害/g, "ngươi quả thật lợi hại")
    .replace(/连这种馊主意都想得出来/g, "ngay cả chủ ý tồi này cũng nghĩ ra được")
    .replace(/老僧轻啜一口灵茶/g, "lão tăng uống một ngụm linh trà")
    .replace(/琴音袅袅/g, "tiếng đàn du dương")
    .replace(/心如止水/g, "tâm lặng như nước")
    .replace(/琴音破空之中/g, "giữa tiếng đàn xé gió")
    .replace(/太上长老拔剑斩出/g, "Thái Thượng Trưởng lão rút kiếm chém ra")
    .replace(/白衣胜雪/g, "áo trắng như tuyết")
    .replace(/杀意滔天/g, "sát ý ngút trời")
    .replace(/他回想起当年往事/g, "hắn nhớ lại chuyện cũ năm xưa")
    .replace(/叹道/g, "thở dài nói")
    .replace(/他没有死/g, "hắn không chết")
    .replace(/他已经离开了/g, "hắn đã rời đi");
}

// =========================================================================
// 1. Corpus Evaluation & Metric Tests
// =========================================================================

test("Phase R3-0 - 1. Corpus Evaluation: Evaluates all 12 genres without errors", () => {
  const evaluator = createShadowCorpusEvaluator({ mockBaseConverter: mockBaseConvert });
  const { results, metrics } = evaluator.evaluateCorpus();

  assert.equal(results.length, SHADOW_EVALUATION_CORPUS.length, `Must evaluate all ${SHADOW_EVALUATION_CORPUS.length} items in shadow corpus`);
  assert.equal(metrics.totalEvaluated, SHADOW_EVALUATION_CORPUS.length);
  assert.ok(metrics.betterRate >= 0.50, `Better rate should be >= 50%, got ${metrics.betterRate}`);
  assert.equal(metrics.regressionRate, 0.0, "Zero semantic regressions permitted");
});

test("Phase R3-0 - 2. Invariant Preservation Metrics: Negation, Temporal, and Zero Hallucination", () => {
  const evaluator = createShadowCorpusEvaluator({ mockBaseConverter: mockBaseConvert });
  const { metrics } = evaluator.evaluateCorpus();

  assert.equal(metrics.negationPreservationRate, 1.0, "Negation preservation must be 100%");
  assert.equal(metrics.temporalPreservationRate, 1.0, "Temporal preservation must be 100%");
  assert.equal(metrics.unsupportedExpansionRate, 0.0, "Unsupported expansion rate must be 0.0%");
  assert.ok(metrics.adjectiveInflationRate <= 0.05, "Adjective inflation rate must be <= 5%");
});

test("Phase R3-0 - 3. Differential Analysis: Classifies shadow outcomes accurately", () => {
  const evaluator = createShadowCorpusEvaluator({ mockBaseConverter: mockBaseConvert });
  const { results } = evaluator.evaluateCorpus();

  const combatItem = results.find((r) => r.category === "COMBAT");
  assert.ok(combatItem, "COMBAT item evaluated");
  assert.ok(
    combatItem.differentialOutcome === DIFFERENTIAL_OUTCOMES.BETTER_THAN_BASELINE ||
    combatItem.differentialOutcome === DIFFERENTIAL_OUTCOMES.STYLE_ONLY_IMPROVEMENT
  );
  assert.equal(combatItem.detectedErrors.length, 0);
});

test("Phase R3-0 - 4. Multi-Domain Mixed Category: Evaluates cross-domain synthesis (CORPUS_MIX_01)", () => {
  const evaluator = createShadowCorpusEvaluator({ mockBaseConverter: mockBaseConvert });
  const mixItem = SHADOW_EVALUATION_CORPUS.find((c) => c.id === "CORPUS_MIX_01");
  assert.ok(mixItem, "CORPUS_MIX_01 exists");

  const evalResult = evaluator.evaluateItem(mixItem);
  assert.ok(evalResult.shadowOutput.length > 0);
  assert.equal(evalResult.detectedErrors.length, 0);
  assert.ok(evalResult.rubric.compositeAverage >= 4.0);
});

test("Phase R3-0 - 5. Recollection Flashback: Evaluates experiential memory & negation (CORPUS_REC_01)", () => {
  const evaluator = createShadowCorpusEvaluator({ mockBaseConverter: mockBaseConvert });
  const recItem = SHADOW_EVALUATION_CORPUS.find((c) => c.id === "CORPUS_REC_01");
  assert.ok(recItem, "CORPUS_REC_01 exists");

  const evalResult = evaluator.evaluateItem(recItem);
  assert.ok(evalResult.shadowOutput.includes("không") || evalResult.shadowOutput.includes("chưa"), "Preserves negation in flashback");
  assert.ok(evalResult.shadowOutput.includes("đã"), "Preserves perfective aspect in flashback");
  assert.equal(evalResult.detectedErrors.length, 0);
});

test("Phase R3-0 - 6. Pattern Clustering: Groups improvement patterns across 12 typologies", () => {
  const evaluator = createShadowCorpusEvaluator({ mockBaseConverter: mockBaseConvert });
  const { results } = evaluator.evaluateCorpus();
  const clusters = evaluator.clusterPatterns(results);

  assert.ok(Object.keys(clusters.topImprovementPatterns).length > 0, "Identifies improvement patterns");
  assert.equal(Object.keys(clusters.topFailurePatterns).length, 0, "Zero unhandled failure patterns in golden corpus");
});

test("Phase R3-0 - 7. Human Review Rubric: Scores 7 dimensions consistently on 1-5 scale", () => {
  const evaluator = createShadowCorpusEvaluator({ mockBaseConverter: mockBaseConvert });
  const expItem = SHADOW_EVALUATION_CORPUS[0];
  const evalResult = evaluator.evaluateItem(expItem);

  const { rubric } = evalResult;
  assert.ok(rubric.semanticFidelity >= 1.0 && rubric.semanticFidelity <= 5.0);
  assert.ok(rubric.naturalness >= 1.0 && rubric.naturalness <= 5.0);
  assert.ok(rubric.literaryQuality >= 1.0 && rubric.literaryQuality <= 5.0);
  assert.ok(rubric.entityConsistency >= 1.0 && rubric.entityConsistency <= 5.0);
  assert.ok(rubric.povCorrectness >= 1.0 && rubric.povCorrectness <= 5.0);
  assert.ok(rubric.emotionCorrectness >= 1.0 && rubric.emotionCorrectness <= 5.0);
  assert.ok(rubric.registerCorrectness >= 1.0 && rubric.registerCorrectness <= 5.0);
});

test("Phase R3-0 - 8. Performance Benchmark: Corpus evaluation across 12 full genres executes in < 50ms", () => {
  const evaluator = createShadowCorpusEvaluator({ mockBaseConverter: mockBaseConvert });

  const start = performance.now();
  for (let i = 0; i < 50; i++) {
    evaluator.evaluateCorpus();
  }
  const totalMs = performance.now() - start;
  const avgMsPerPass = totalMs / 50;

  assert.ok(avgMsPerPass < 50, `Average full 12-genre corpus evaluation should be < 50ms, got ${avgMsPerPass.toFixed(2)}ms`);
});
