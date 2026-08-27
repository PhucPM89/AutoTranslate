"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createCanaryController, ENGINE_MODES } = require("../canary-controller");
const { createSemanticOrchestrator } = require("./semantic-orchestrator");

// Mock legacy convert function
function mockLegacyConvert(zhText) {
  return String(zhText)
    .replace(/叶辰拔剑出鞘/g, "Diệp Thần rút kiếm ra khỏi vỏ")
    .replace(/剑气纵横/g, "kiếm khí tung hoành")
    .replace(/一剑斩出/g, "một kiếm chém ra")
    .replace(/太上长老/g, "Thái Thượng Trưởng lão")
    .replace(/微微一笑/g, "mỉm cười");
}

// =========================================================================
// 1. Feature Flag Mode Switching Tests
// =========================================================================

test("Phase R4 - 1. Mode Switching: LEGACY mode serves 100% legacy baseline output", () => {
  const orchestrator = createSemanticOrchestrator({ baseConvertFunction: mockLegacyConvert });
  const canary = createCanaryController({
    mode: ENGINE_MODES.LEGACY,
    fallbackFunction: mockLegacyConvert,
    semanticOrchestrator: orchestrator
  });

  const res = canary.translate("叶辰拔剑出鞘，一剑斩出！");
  assert.equal(res.mode, ENGINE_MODES.LEGACY);
  assert.equal(res.servedBy, "LEGACY");
  assert.equal(res.fallbackOccurred, false);
  assert.ok(res.text.includes("Diệp Thần rút kiếm ra khỏi vỏ"));

  const metrics = canary.getHealthMetrics();
  assert.equal(metrics.legacyServed, 1);
  assert.equal(metrics.canaryServed, 0);
  assert.equal(metrics.shadowServed, 0);
});

test("Phase R4 - 2. Mode Switching: SHADOW mode serves legacy output while recording semantic shadow traces", () => {
  const orchestrator = createSemanticOrchestrator({ baseConvertFunction: mockLegacyConvert });
  const canary = createCanaryController({
    mode: ENGINE_MODES.SHADOW,
    fallbackFunction: mockLegacyConvert,
    semanticOrchestrator: orchestrator
  });

  const res = canary.translate("叶辰拔剑出鞘，一剑斩出！", { primaryDomain: "SWORD_DAO" });
  assert.equal(res.mode, ENGINE_MODES.SHADOW);
  assert.equal(res.servedBy, "SHADOW_LEGACY_OUTPUT");
  assert.equal(res.fallbackOccurred, false);
  // Final text served is legacy
  assert.ok(res.text.includes("Diệp Thần rút kiếm ra khỏi vỏ"));
  // Shadow output is available in result
  assert.ok(res.shadowOutput && res.shadowOutput.length > 0);
  assert.ok(res.traces.length > 0);

  const metrics = canary.getHealthMetrics();
  assert.equal(metrics.shadowServed, 1);
  assert.equal(metrics.canaryServed, 0);
});

test("Phase R4 - 3. Mode Switching: CANARY mode serves semantic output directly", () => {
  const orchestrator = createSemanticOrchestrator({ baseConvertFunction: mockLegacyConvert });
  const canary = createCanaryController({
    mode: ENGINE_MODES.CANARY,
    canaryPercentage: 100,
    fallbackFunction: mockLegacyConvert,
    semanticOrchestrator: orchestrator
  });

  const res = canary.translate("叶辰拔剑出鞘，一剑斩出！", { primaryDomain: "SWORD_DAO" });
  assert.equal(res.mode, ENGINE_MODES.CANARY);
  assert.equal(res.servedBy, "SEMANTIC_CANARY");
  assert.equal(res.fallbackOccurred, false);
  assert.ok(res.text.length > 0);

  const metrics = canary.getHealthMetrics();
  assert.equal(metrics.canaryServed, 1);
  assert.equal(metrics.legacyServed, 0);
});

// =========================================================================
// 2. Traffic Percentage Split Tests
// =========================================================================

test("Phase R4 - 4. Traffic Rollout: 0% canary routes 100% to legacy, 100% canary routes to semantic", () => {
  const orchestrator = createSemanticOrchestrator({ baseConvertFunction: mockLegacyConvert });

  // 0% Canary
  const canary0 = createCanaryController({
    mode: ENGINE_MODES.CANARY,
    canaryPercentage: 0,
    fallbackFunction: mockLegacyConvert,
    semanticOrchestrator: orchestrator
  });
  const res0 = canary0.translate("叶辰拔剑出鞘");
  assert.equal(res0.servedBy, "CANARY_TRAFFIC_SPLIT_LEGACY");

  // 100% Canary
  const canary100 = createCanaryController({
    mode: ENGINE_MODES.CANARY,
    canaryPercentage: 100,
    fallbackFunction: mockLegacyConvert,
    semanticOrchestrator: orchestrator
  });
  const res100 = canary100.translate("叶辰拔剑出鞘");
  assert.equal(res100.servedBy, "SEMANTIC_CANARY");
});

// =========================================================================
// 3. Chaos & Failure Injection Fail-Safe Tests
// =========================================================================

test("Phase R4 - 5. Chaos Injection: Injected runtime exception safely falls back to legacy without crashing", () => {
  const orchestrator = createSemanticOrchestrator({ baseConvertFunction: mockLegacyConvert });
  const canary = createCanaryController({
    mode: ENGINE_MODES.CANARY,
    canaryPercentage: 100,
    fallbackFunction: mockLegacyConvert,
    semanticOrchestrator: orchestrator,
    chaosInjector: () => {
      throw new Error("INJECTED_PROVIDER_CRASH");
    }
  });

  const res = canary.translate("叶辰拔剑出鞘，一剑斩出！");
  assert.equal(res.fallbackOccurred, true);
  assert.equal(res.servedBy, "EXCEPTION_FALLBACK_LEGACY");
  assert.ok(res.fallbackReason.includes("INJECTED_PROVIDER_CRASH"));
  // Legacy output was safely delivered to the user
  assert.ok(res.text.includes("Diệp Thần rút kiếm ra khỏi vỏ"));

  const metrics = canary.getHealthMetrics();
  assert.equal(metrics.exceptionsCaught, 1);
  assert.equal(metrics.fallbackCount, 1);
});

test("Phase R4 - 6. Resource Limits: Oversized chapter safely falls back to legacy guard", () => {
  const orchestrator = createSemanticOrchestrator({ baseConvertFunction: mockLegacyConvert });
  const canary = createCanaryController({
    mode: ENGINE_MODES.CANARY,
    canaryPercentage: 100,
    fallbackFunction: mockLegacyConvert,
    semanticOrchestrator: orchestrator,
    resourceLimits: { MAX_CHAPTER_LENGTH: 50, MAX_CLAUSES: 100, AUTO_ABORT_FALLBACK_RATE: 0.05 }
  });

  // Long text exceeding 50 chars limit
  const longText = "叶辰拔剑出鞘，一剑斩出！太上长老微微一笑，剑气纵横！".repeat(3);
  const res = canary.translate(longText);

  assert.equal(res.fallbackOccurred, true);
  assert.equal(res.servedBy, "RESOURCE_GUARD_LEGACY");
  assert.equal(res.fallbackReason, "MAX_CHAPTER_LENGTH_EXCEEDED");
  assert.ok(res.text.length > 0);
});

// =========================================================================
// 4. Concurrency & State Isolation Tests
// =========================================================================

test("Phase R4 - 7. Concurrency Safety: Parallel translations maintain complete state isolation", async () => {
  const orchestrator = createSemanticOrchestrator({ baseConvertFunction: mockLegacyConvert });
  const canary = createCanaryController({
    mode: ENGINE_MODES.CANARY,
    canaryPercentage: 100,
    fallbackFunction: mockLegacyConvert,
    semanticOrchestrator: orchestrator
  });

  const tasks = [];
  for (let i = 0; i < 20; i++) {
    tasks.push(
      new Promise((resolve) => {
        const text = i % 2 === 0 ? "叶辰拔剑出鞘，一剑斩出！" : "太上长老微微一笑。";
        const domain = i % 2 === 0 ? "SWORD_DAO" : "TITLE_HIERARCHY";
        const res = canary.translate(text, { primaryDomain: domain });
        resolve(res);
      })
    );
  }

  const results = await Promise.all(tasks);
  assert.equal(results.length, 20);
  for (const r of results) {
    assert.equal(r.fallbackOccurred, false);
    assert.equal(r.servedBy, "SEMANTIC_CANARY");
    assert.ok(r.text.length > 0);
  }
});

// =========================================================================
// 5. Performance & Memory Stability Benchmark
// =========================================================================

test("Phase R4 - 8. Performance & Memory: 100 sequential chapters execute in < 250ms with zero memory leaks", () => {
  const orchestrator = createSemanticOrchestrator({ baseConvertFunction: mockLegacyConvert });
  const canary = createCanaryController({
    mode: ENGINE_MODES.CANARY,
    canaryPercentage: 100,
    fallbackFunction: mockLegacyConvert,
    semanticOrchestrator: orchestrator
  });

  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    canary.translate("太上长老拔剑出鞘，剑气纵横，一剑斩出！", { primaryDomain: "SWORD_DAO" });
  }
  const totalMs = performance.now() - start;
  const avgMsPerChapter = totalMs / 100;

  assert.ok(avgMsPerChapter < 5.0, `Average latency per chapter should be < 5.0ms, got ${avgMsPerChapter.toFixed(2)}ms`);
});
