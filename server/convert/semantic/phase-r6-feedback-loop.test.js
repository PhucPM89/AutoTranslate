"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createProductionFeedbackLoop,
  SEMANTIC_SYSTEM_VERSIONS,
  PROVIDER_VALUE_CLASSES,
  REALIZER_ERROR_CATEGORIES
} = require("../feedback-loop");

// =========================================================================
// 1. Production Quality Telemetry & Health Tests
// =========================================================================

test("Phase R6 - 1. Quality Telemetry: Aggregates chapter and clause level telemetry with success rates", () => {
  const loop = createProductionFeedbackLoop();

  // Simulate 95 successful chapters and 5 fallbacks
  for (let i = 0; i < 95; i++) {
    loop.recordChapterTelemetry({
      clausesCount: 4,
      servedBy: "SEMANTIC_CANARY",
      traces: [
        {
          providerContributions: { SWORD_DAO: { rejected: false } },
          slots: { MARTIAL_ACTION: { hasConflict: false } }
        }
      ]
    });
  }

  for (let i = 0; i < 5; i++) {
    loop.recordChapterTelemetry({
      clausesCount: 4,
      servedBy: "LEGACY_FALLBACK",
      fallbackReason: "QUALITY_GATE_REJECT: ADJECTIVE_LIMIT_EXCEEDED",
      traces: []
    });
  }

  const summary = loop.getTelemetrySummary();
  assert.equal(summary.totalChapters, 100);
  assert.equal(summary.totalClauses, 400);
  assert.equal(summary.successfulSemantic, 95);
  assert.equal(summary.fallbacks, 5);
  assert.equal(summary.fallbackRate, 0.05);
  assert.equal(summary.successRate, 0.95);
  assert.equal(summary.qualityGateRejections, 5);
});

// =========================================================================
// 2. Provider Health & Value Classification Tests
// =========================================================================

test("Phase R6 - 2. Provider Value Audit: Correctly classifies providers into HIGH_VALUE, NEUTRAL, and HARMFUL", () => {
  const loop = createProductionFeedbackLoop();

  // Provider A (High Value: 30 activations, 0 rejections, 0 fallbacks)
  for (let i = 0; i < 30; i++) {
    loop.recordChapterTelemetry({
      servedBy: "SEMANTIC_CANARY",
      traces: [{ providerContributions: { SWORD_DAO_PROVIDER: { rejected: false } } }]
    });
  }

  // Provider B (Harmful: 20 activations, 10 rejections, 5 fallbacks)
  for (let i = 0; i < 20; i++) {
    const isBad = i >= 10;
    loop.recordChapterTelemetry({
      servedBy: isBad ? "LEGACY_FALLBACK" : "SEMANTIC_CANARY",
      fallbackReason: isBad ? "PROVIDER_CORRUPTION" : null,
      traces: [{ providerContributions: { EXPERIMENTAL_PROVIDER: { rejected: isBad } } }]
    });
  }

  // Provider C (Unknown / Insufficient: 2 activations)
  for (let i = 0; i < 2; i++) {
    loop.recordChapterTelemetry({
      servedBy: "SEMANTIC_CANARY",
      traces: [{ providerContributions: { RARE_NICHE_PROVIDER: { rejected: false } } }]
    });
  }

  const dashboard = loop.auditProviderHealth();
  assert.equal(dashboard.SWORD_DAO_PROVIDER.classification, PROVIDER_VALUE_CLASSES.HIGH_VALUE);
  assert.equal(dashboard.EXPERIMENTAL_PROVIDER.classification, PROVIDER_VALUE_CLASSES.HARMFUL);
  assert.equal(dashboard.RARE_NICHE_PROVIDER.classification, PROVIDER_VALUE_CLASSES.UNKNOWN);
});

// =========================================================================
// 3. StyleSlot Conflict & Health Telemetry Tests
// =========================================================================

test("Phase R6 - 3. StyleSlot Health: Identifies conflict-heavy slots and tracks rejection frequency", () => {
  const loop = createProductionFeedbackLoop();

  // Slot A (Conflict Heavy: 20 usages, 10 conflicts)
  for (let i = 0; i < 20; i++) {
    loop.recordChapterTelemetry({
      servedBy: "SEMANTIC_CANARY",
      traces: [{ slots: { AMBIGUOUS_MODIFIER: { hasConflict: i % 2 === 0, rejected: false } } }]
    });
  }

  const slotHealth = loop.auditStyleSlotHealth();
  assert.equal(slotHealth.AMBIGUOUS_MODIFIER.usage, 20);
  assert.equal(slotHealth.AMBIGUOUS_MODIFIER.conflicts, 10);
  assert.equal(slotHealth.AMBIGUOUS_MODIFIER.conflictRate, 0.50);
  assert.equal(slotHealth.AMBIGUOUS_MODIFIER.isConflictHeavy, true);
});

// =========================================================================
// 4. Failure Clustering & Regression Corpus Tests
// =========================================================================

test("Phase R6 - 4. Failure Clustering: Groups production regression samples into root causes and frequencies", () => {
  const loop = createProductionFeedbackLoop();

  loop.recordRegressionSample({
    errorType: REALIZER_ERROR_CATEGORIES.PRONOUN_REPETITION,
    provider: "SWORD_DAO",
    genre: "XIANXIA",
    sourceZh: "他拔剑，他出剑，他击败了对手。",
    legacyOutput: "Hắn rút kiếm, hắn xuất kiếm, hắn đánh bại đối thủ.",
    semanticOutput: "Hắn rút kiếm, hắn xuất kiếm, hắn đánh bại đối thủ.",
    rootCause: "Pronoun deduplication threshold did not trigger on 3rd coordinate clause"
  });

  loop.recordRegressionSample({
    errorType: REALIZER_ERROR_CATEGORIES.PRONOUN_REPETITION,
    provider: "SWORD_DAO",
    genre: "XIANXIA",
    sourceZh: "他飞身上前，他挥剑斩下。",
    legacyOutput: "Hắn bay người về phía trước, hắn vung kiếm chém xuống.",
    semanticOutput: "Hắn bay người về phía trước, hắn vung kiếm chém xuống.",
    rootCause: "Pronoun deduplication threshold did not trigger on 2nd coordinate clause"
  });

  loop.recordRegressionSample({
    errorType: REALIZER_ERROR_CATEGORIES.CHINESE_CALQUE,
    provider: "POLITICAL_INTRIGUE",
    genre: "HISTORICAL",
    sourceZh: "丞相躬身道：「臣附议。」",
    legacyOutput: "Thừa tướng khom mình nói: \"Thần phụ nghị.\"",
    semanticOutput: "Thừa tướng khom mình nói: \"Thần phụ nghị.\"",
    rootCause: "Sino-Vietnamese calque 'phụ nghị' instead of 'thần đồng ý / tán thành'"
  });

  const clusters = loop.clusterProductionFailures();
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].errorType, REALIZER_ERROR_CATEGORIES.PRONOUN_REPETITION);
  assert.equal(clusters[0].count, 2);
  assert.equal(clusters[1].errorType, REALIZER_ERROR_CATEGORIES.CHINESE_CALQUE);
  assert.equal(clusters[1].count, 1);
});

// =========================================================================
// 5. Versioning & System Stability Tests
// =========================================================================

test("Phase R6 - 5. System Versioning: Verifies frozen semantic schema and engine metadata", () => {
  assert.equal(SEMANTIC_SYSTEM_VERSIONS.ENGINE_VERSION, "2.0.0");
  assert.equal(SEMANTIC_SYSTEM_VERSIONS.PROVIDER_VERSION, "2.0.0");
  assert.equal(SEMANTIC_SYSTEM_VERSIONS.SEMANTIC_SCHEMA_VERSION, "2.1.0");
  assert.equal(SEMANTIC_SYSTEM_VERSIONS.CORPUS_VERSION, "1.2.0");
  assert.equal(SEMANTIC_SYSTEM_VERSIONS.EVALUATION_VERSION, "2.0.0");
});
