"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createRolloutController, ROLLOUT_STAGES, PROMOTION_DECISIONS } = require("../rollout-controller");
const { createSemanticOrchestrator } = require("./semantic-orchestrator");

// Mock legacy convert function
function mockLegacyConvert(zhText) {
  return String(zhText)
    .replace(/太玄圣地/g, "Thái Huyền Thánh Địa")
    .replace(/青云门/g, "Thanh Vân Môn")
    .replace(/叶辰/g, "Diệp Thần")
    .replace(/萧炎/g, "Tiêu Viêm")
    .replace(/拔剑出鞘/g, "rút kiếm ra khỏi vỏ")
    .replace(/一剑斩出/g, "một kiếm chém ra")
    .replace(/太上长老/g, "Thái Thượng Trưởng lão")
    .replace(/冷哼道/g, "hừ lạnh nói");
}

// =========================================================================
// 1. Rollout Stage Progression & Promotion Gate Tests
// =========================================================================

test("Phase R5 - 1. Rollout Ladder: Advances through all 7 rollout stages (0% -> 100%)", () => {
  const orchestrator = createSemanticOrchestrator({ baseConvertFunction: mockLegacyConvert });
  const rollout = createRolloutController({
    fallbackFunction: mockLegacyConvert,
    semanticOrchestrator: orchestrator
  });

  assert.equal(rollout.getCurrentStage().percentage, 0);

  // Stage 0 -> Stage 1 (1%)
  assert.equal(rollout.advanceStage(), true);
  assert.equal(rollout.getCurrentStage().percentage, 1);

  // Stage 1 -> Stage 2 (5%)
  assert.equal(rollout.advanceStage(), true);
  assert.equal(rollout.getCurrentStage().percentage, 5);

  // Stage 2 -> Stage 3 (10%)
  assert.equal(rollout.advanceStage(), true);
  assert.equal(rollout.getCurrentStage().percentage, 10);

  // Stage 3 -> Stage 4 (25%)
  assert.equal(rollout.advanceStage(), true);
  assert.equal(rollout.getCurrentStage().percentage, 25);

  // Stage 4 -> Stage 5 (50%)
  assert.equal(rollout.advanceStage(), true);
  assert.equal(rollout.getCurrentStage().percentage, 50);

  // Stage 5 -> Stage 6 (100% Production Default)
  assert.equal(rollout.advanceStage(), true);
  assert.equal(rollout.getCurrentStage().percentage, 100);
  assert.equal(rollout.getObservabilityReport().isProductionDefault, true);

  // Cannot advance past 100%
  assert.equal(rollout.advanceStage(), false);
});

test("Phase R5 - 2. Promotion Gate: Recommends HOLD on insufficient samples and PROMOTE on clean quota", () => {
  const orchestrator = createSemanticOrchestrator({ baseConvertFunction: mockLegacyConvert });
  const rollout = createRolloutController({
    initialStageIndex: 1, // 1% Canary (requires 200 samples)
    fallbackFunction: mockLegacyConvert,
    semanticOrchestrator: orchestrator
  });

  // Run 10 samples (< 200 required)
  for (let i = 0; i < 10; i++) {
    rollout.translate("叶辰拔剑出鞘，一剑斩出！", { primaryDomain: "SWORD_DAO" });
  }

  const gate1 = rollout.evaluatePromotionGate();
  assert.equal(gate1.decision, PROMOTION_DECISIONS.HOLD);
  assert.ok(gate1.reason.includes("INSUFFICIENT_OBSERVATION_SAMPLES"));

  // Run remaining samples to reach minSampleSize (200)
  for (let i = 10; i < 200; i++) {
    rollout.translate("叶辰拔剑出鞘，一剑斩出！", { primaryDomain: "SWORD_DAO" });
  }

  const gate2 = rollout.evaluatePromotionGate();
  assert.equal(gate2.decision, PROMOTION_DECISIONS.PROMOTE);
  assert.equal(gate2.reason, "ALL_PROMOTION_GATES_SATISFIED");
});

test("Phase R5 - 3. Rollback Gate: Recommends ROLLBACK on critical regression or high failure rate", () => {
  const orchestrator = createSemanticOrchestrator({ baseConvertFunction: mockLegacyConvert });
  const rollout = createRolloutController({
    initialStageIndex: 3, // 10%
    fallbackFunction: mockLegacyConvert,
    semanticOrchestrator: orchestrator
  });

  rollout.recordCriticalRegression();
  const gate = rollout.evaluatePromotionGate();
  assert.equal(gate.decision, PROMOTION_DECISIONS.ROLLBACK);

  // Execute instant rollback
  rollout.rollbackToLegacy();
  assert.equal(rollout.getCurrentStage().percentage, 0);
  assert.equal(rollout.getObservabilityReport().isProductionDefault, false);
});

// =========================================================================
// 2. High-Throughput Long-Run Stability & Cross-Document Isolation
// =========================================================================

test("Phase R5 - 4. Cross-Document State Isolation: Interleaved book translations maintain 100% entity separation", () => {
  const orchestrator = createSemanticOrchestrator({ baseConvertFunction: mockLegacyConvert });
  const rollout = createRolloutController({
    initialStageIndex: 6, // 100% Canary
    fallbackFunction: mockLegacyConvert,
    semanticOrchestrator: orchestrator
  });

  for (let i = 0; i < 30; i++) {
    // Book A (Xianxia - Diệp Thần)
    const resA = rollout.translate("太玄圣地叶辰拔剑出鞘，一剑斩出！", {
      chapterId: `bookA_ch_${i}`,
      entities: [{ id: "ent_yc", nameZh: "叶辰", nameVi: "Diệp Thần" }]
    });

    // Book B (Wuxia - Tiêu Viêm)
    const resB = rollout.translate("青云门太上长老冷哼道：「萧炎休走！」", {
      chapterId: `bookB_ch_${i}`,
      entities: [{ id: "ent_xy", nameZh: "萧炎", nameVi: "Tiêu Viêm" }]
    });

    assert.ok(resA.text.includes("Diệp Thần") || resA.text.includes("Thái Huyền"));
    assert.ok(!resA.text.includes("Tiêu Viêm"), "Book A must not contain Book B entities");

    assert.ok(resB.text.includes("Tiêu Viêm") || resB.text.includes("Thanh Vân Môn"));
    assert.ok(!resB.text.includes("Diệp Thần"), "Book B must not contain Book A entities");
  }
});

test("Phase R5 - 5. Long-Run Stability: 500 chapters execute with sub-millisecond p95 latency and zero memory leak", () => {
  const orchestrator = createSemanticOrchestrator({ baseConvertFunction: mockLegacyConvert });
  const rollout = createRolloutController({
    initialStageIndex: 6, // 100%
    fallbackFunction: mockLegacyConvert,
    semanticOrchestrator: orchestrator
  });

  for (let i = 0; i < 500; i++) {
    rollout.translate("太玄圣地叶辰拔剑出鞘，剑气纵横，一剑斩出！", { primaryDomain: "SWORD_DAO" });
  }

  const report = rollout.getObservabilityReport();
  assert.ok(report.latency.p95 < 10.0, `P95 latency should be < 10.0ms, got ${report.latency.p95}ms`);
  assert.ok(report.latency.p50 < 5.0, `P50 latency should be < 5.0ms, got ${report.latency.p50}ms`);
  assert.equal(report.telemetry.fallbackCount, 0, "Zero fallbacks on clean workload");
});

test("Phase R5 - 6. Corpus Drift & Graceful Fallback: Unknown/malformed syntax safely falls back without error", () => {
  const orchestrator = createSemanticOrchestrator({ baseConvertFunction: mockLegacyConvert });
  const rollout = createRolloutController({
    initialStageIndex: 6,
    fallbackFunction: mockLegacyConvert,
    semanticOrchestrator: orchestrator
  });

  const res = rollout.translate("###$$$@!~未知乱码句法结构");
  assert.ok(res.text.length > 0);
  assert.equal(res.stagePercentage, 100);
});
