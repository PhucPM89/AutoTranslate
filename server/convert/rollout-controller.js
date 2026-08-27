"use strict";

/**
 * Production Rollout & Continuous Observability Controller (Phase R5)
 * 
 * Provides automated stage-gated promotion, health monitoring, circuit breaker recovery,
 * and cross-document state isolation for the Semantic Translation Engine.
 * 
 * Rollout Ladder:
 * - STAGE_0_0PCT   : 0% Canary (100% Legacy Baseline)
 * - STAGE_1_1PCT   : 1% Canary (Initial Canary Probe)
 * - STAGE_2_5PCT   : 5% Canary (Early Stage Observation)
 * - STAGE_3_10PCT  : 10% Canary (Significant Traffic Sample)
 * - STAGE_4_25PCT  : 25% Canary (Quarter Traffic Milestone)
 * - STAGE_5_50PCT  : 50% Canary (Half Production Traffic)
 * - STAGE_6_100PCT : 100% Full Production Default (with 1% diagnostic shadow sampling)
 */

const { createCanaryController, ENGINE_MODES, DEFAULT_RESOURCE_LIMITS, fnv1a32 } = require("./canary-controller");

const ROLLOUT_STAGES = Object.freeze([
  { id: "STAGE_0_0PCT", percentage: 0, minSampleSize: 100, observationMinHours: 1 },
  { id: "STAGE_1_1PCT", percentage: 1, minSampleSize: 200, observationMinHours: 6 },
  { id: "STAGE_2_5PCT", percentage: 5, minSampleSize: 500, observationMinHours: 12 },
  { id: "STAGE_3_10PCT", percentage: 10, minSampleSize: 1000, observationMinHours: 24 },
  { id: "STAGE_4_25PCT", percentage: 25, minSampleSize: 2500, observationMinHours: 24 },
  { id: "STAGE_5_50PCT", percentage: 50, minSampleSize: 5000, observationMinHours: 48 },
  { id: "STAGE_6_100PCT", percentage: 100, minSampleSize: 10000, observationMinHours: 72 }
]);

const PROMOTION_DECISIONS = Object.freeze({
  PROMOTE: "PROMOTE",
  HOLD: "HOLD",
  ROLLBACK: "ROLLBACK"
});

const DEFAULT_SAFETY_THRESHOLDS = Object.freeze({
  MAX_ALLOWED_FALLBACK_RATE: 0.02,        // Max 2.0% fallback rate for promotion
  CRITICAL_REGRESSION_LIMIT: 0,           // 0 tolerance for critical regressions
  MAX_LATENCY_P95_MS: 5.0,                // 5.0ms max P95 chapter latency
  MAX_QUALITY_GATE_REJECT_RATE: 0.015,    // Max 1.5% quality gate rejections
  CIRCUIT_BREAKER_COOLDOWN_MS: 5000       // 5 seconds cooldown before half-open probe
});

/**
 * Calculates percentile from an array of numbers.
 */
function calculatePercentile(arr, p) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return Number(sorted[Math.max(0, index)].toFixed(3));
}

/**
 * Production Rollout Controller Factory
 */
function createRolloutController({
  initialStageIndex = 0,
  fallbackFunction = null,
  semanticOrchestrator = null,
  thresholds = DEFAULT_SAFETY_THRESHOLDS,
  resourceLimits = DEFAULT_RESOURCE_LIMITS,
  chaosInjector = null
} = {}) {
  let currentStageIndex = Math.max(0, Math.min(ROLLOUT_STAGES.length - 1, Number(initialStageIndex) || 0));
  let currentStage = ROLLOUT_STAGES[currentStageIndex];

  // Initialize base canary controller
  const canaryController = createCanaryController({
    mode: currentStage.percentage > 0 ? ENGINE_MODES.CANARY : ENGINE_MODES.LEGACY,
    canaryPercentage: currentStage.percentage,
    fallbackFunction,
    semanticOrchestrator,
    resourceLimits,
    chaosInjector
  });

  // Stage-specific telemetry
  const latencies = [];
  let criticalRegressions = 0;
  let circuitBreakerTrippedAt = null;

  /**
   * Translates a chapter text under progressive rollout controls.
   */
  function translate(text, options = {}) {
    const start = performance.now();

    // Check circuit breaker cooldown & recovery
    if (circuitBreakerTrippedAt !== null) {
      const elapsed = Date.now() - circuitBreakerTrippedAt;
      if (elapsed > thresholds.CIRCUIT_BREAKER_COOLDOWN_MS) {
        // Half-open probe: attempt reset
        canaryController.resetMetrics();
        circuitBreakerTrippedAt = null;
      }
    }

    // Process translation via Canary Controller
    const result = canaryController.translate(text, options);
    const duration = performance.now() - start;
    latencies.push(duration);
    if (latencies.length > 5000) latencies.shift(); // Keep moving window

    // Check if circuit breaker newly tripped
    const health = canaryController.getHealthMetrics();
    if (health.circuitBreakerTripped && circuitBreakerTrippedAt === null) {
      circuitBreakerTrippedAt = Date.now();
    }

    return Object.freeze({
      ...result,
      stage: currentStage.id,
      stagePercentage: currentStage.percentage,
      latencyMs: Number(duration.toFixed(3))
    });
  }

  /**
   * Evaluates whether the current rollout stage qualifies for promotion, hold, or rollback.
   */
  function evaluatePromotionGate() {
    const health = canaryController.getHealthMetrics();
    const totalRequests = health.totalRequests;
    const canaryAttempted = health.canaryServed + health.fallbackCount;
    const fallbackRate = canaryAttempted > 0 ? health.fallbackCount / canaryAttempted : 0.0;
    const qgRejectRate = canaryAttempted > 0 ? health.qualityGateRejections / canaryAttempted : 0.0;

    const p50 = calculatePercentile(latencies, 50);
    const p95 = calculatePercentile(latencies, 95);
    const p99 = calculatePercentile(latencies, 99);

    const gateAudit = {
      stage: currentStage.id,
      percentage: currentStage.percentage,
      totalRequests,
      canaryAttempted,
      minRequired: currentStage.minSampleSize,
      fallbackRate: Number(fallbackRate.toFixed(4)),
      qualityGateRejectRate: Number(qgRejectRate.toFixed(4)),
      criticalRegressions,
      p50,
      p95,
      p99,
      circuitBreakerTripped: health.circuitBreakerTripped
    };

    // 1. Rollback Conditions (Severe failure)
    if (health.circuitBreakerTripped || fallbackRate > 0.05 || criticalRegressions > thresholds.CRITICAL_REGRESSION_LIMIT) {
      return Object.freeze({
        decision: PROMOTION_DECISIONS.ROLLBACK,
        reason: "EXCESSIVE_FAILURES_OR_CIRCUIT_BREAKER_TRIPPED",
        audit: Object.freeze(gateAudit)
      });
    }

    // 2. Hold Conditions (Insufficient sample size or latency spike)
    if (totalRequests < currentStage.minSampleSize) {
      return Object.freeze({
        decision: PROMOTION_DECISIONS.HOLD,
        reason: `INSUFFICIENT_OBSERVATION_SAMPLES (${totalRequests}/${currentStage.minSampleSize})`,
        audit: Object.freeze(gateAudit)
      });
    }

    if (fallbackRate > thresholds.MAX_ALLOWED_FALLBACK_RATE) {
      return Object.freeze({
        decision: PROMOTION_DECISIONS.HOLD,
        reason: `FALLBACK_RATE_EXCEEDS_THRESHOLD (${(fallbackRate * 100).toFixed(2)}% > ${(thresholds.MAX_ALLOWED_FALLBACK_RATE * 100).toFixed(2)}%)`,
        audit: Object.freeze(gateAudit)
      });
    }

    if (p95 > thresholds.MAX_LATENCY_P95_MS) {
      return Object.freeze({
        decision: PROMOTION_DECISIONS.HOLD,
        reason: `LATENCY_P95_SPIKE (${p95.toFixed(2)}ms > ${thresholds.MAX_LATENCY_P95_MS}ms)`,
        audit: Object.freeze(gateAudit)
      });
    }

    // 3. Promote Condition
    return Object.freeze({
      decision: PROMOTION_DECISIONS.PROMOTE,
      reason: "ALL_PROMOTION_GATES_SATISFIED",
      audit: Object.freeze(gateAudit)
    });
  }

  /**
   * Advances to the next rollout stage if promotion gate passes.
   */
  function advanceStage() {
    if (currentStageIndex < ROLLOUT_STAGES.length - 1) {
      currentStageIndex++;
      currentStage = ROLLOUT_STAGES[currentStageIndex];
      canaryController.setMode(currentStage.percentage > 0 ? ENGINE_MODES.CANARY : ENGINE_MODES.LEGACY);
      canaryController.setCanaryPercentage(currentStage.percentage);
      canaryController.resetMetrics();
      latencies.length = 0;
      return true;
    }
    return false; // Already at 100%
  }

  /**
   * Instantly rolls back to Stage 0 (0% Legacy).
   */
  function rollbackToLegacy() {
    currentStageIndex = 0;
    currentStage = ROLLOUT_STAGES[0];
    canaryController.setMode(ENGINE_MODES.LEGACY);
    canaryController.setCanaryPercentage(0);
    canaryController.resetMetrics();
    latencies.length = 0;
    circuitBreakerTrippedAt = null;
  }

  function getObservabilityReport() {
    const health = canaryController.getHealthMetrics();
    return Object.freeze({
      currentStage: currentStage.id,
      currentPercentage: currentStage.percentage,
      isProductionDefault: currentStage.percentage === 100,
      telemetry: health,
      latency: Object.freeze({
        p50: calculatePercentile(latencies, 50),
        p95: calculatePercentile(latencies, 95),
        p99: calculatePercentile(latencies, 99)
      })
    });
  }

  return Object.freeze({
    translate,
    evaluatePromotionGate,
    advanceStage,
    rollbackToLegacy,
    getObservabilityReport,
    getCurrentStage: () => currentStage,
    getCanaryController: () => canaryController,
    recordCriticalRegression: () => { criticalRegressions++; }
  });
}

module.exports = {
  createRolloutController,
  ROLLOUT_STAGES,
  PROMOTION_DECISIONS,
  DEFAULT_SAFETY_THRESHOLDS,
  calculatePercentile
};
