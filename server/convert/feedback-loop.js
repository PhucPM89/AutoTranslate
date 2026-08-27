"use strict";

/**
 * Production Quality Feedback Loop & Telemetry Engine (Phase R6)
 * 
 * Provides continuous observation, provider/StyleSlot auditing, failure clustering,
 * and safe regression management for the live Semantic Translation Pipeline.
 * 
 * Semantic System Versioning:
 * - Engine Version         : 2.0.0
 * - Provider Version       : 2.0.0 (43 Providers)
 * - Semantic Schema Version: 2.1.0 (Semantic IR + ExpressionPlan)
 * - Corpus Version         : 1.2.0 (Tripartite Development / Held-Out / Final Gold)
 * - Evaluation Version     : 2.0.0 (7-Dimension Quality Vector)
 */

const SEMANTIC_SYSTEM_VERSIONS = Object.freeze({
  ENGINE_VERSION: "2.0.0",
  PROVIDER_VERSION: "2.0.0",
  SEMANTIC_SCHEMA_VERSION: "2.1.0",
  CORPUS_VERSION: "1.2.0",
  EVALUATION_VERSION: "2.0.0"
});

const PROVIDER_VALUE_CLASSES = Object.freeze({
  HIGH_VALUE: "HIGH_VALUE", // High activation, >= 95% acceptance, major quality gain
  NEUTRAL: "NEUTRAL",       // Safe, moderate activation, zero harm
  LOW_VALUE: "LOW_VALUE",   // Very rare activation, negligible delta
  HARMFUL: "HARMFUL",       // High rejection, correlated with fallbacks/hallucinations
  UNKNOWN: "UNKNOWN"        // Insufficient sample data (< 10 activations)
});

const REALIZER_ERROR_CATEGORIES = Object.freeze({
  AWKWARD_VIETNAMESE: "AWKWARD_VIETNAMESE",
  CHINESE_CALQUE: "CHINESE_CALQUE",
  PRONOUN_REPETITION: "PRONOUN_REPETITION",
  MODIFIER_STACKING: "MODIFIER_STACKING",
  UNNATURAL_CLAUSE_ORDER: "UNNATURAL_CLAUSE_ORDER",
  WRONG_REGISTER: "WRONG_REGISTER",
  TOO_LITERAL: "TOO_LITERAL",
  TOO_LITERARY: "TOO_LITERARY",
  NEGATION_LOSS: "NEGATION_LOSS",
  TEMPORAL_LOSS: "TEMPORAL_LOSS",
  QUANTITY_LOSS: "QUANTITY_LOSS"
});

/**
 * Factory for the Production Quality Feedback Loop
 */
function createProductionFeedbackLoop() {
  const telemetry = {
    totalChapters: 0,
    totalClauses: 0,
    successfulSemantic: 0,
    fallbacks: 0,
    qualityGateRejections: 0,
    realizerFailures: 0,
    providerActivations: {},
    providerRejections: {},
    providerAbstentions: {},
    providerFallbacks: {},
    styleSlotUsage: {},
    styleSlotConflicts: {},
    styleSlotRejections: {},
    regressionSamples: []
  };

  /**
   * Records a single chapter translation telemetry event.
   */
  function recordChapterTelemetry({
    clausesCount = 1,
    servedBy = "SEMANTIC_CANARY",
    fallbackReason = null,
    traces = []
  } = {}) {
    telemetry.totalChapters++;
    telemetry.totalClauses += clausesCount;

    if (servedBy === "SEMANTIC_CANARY" || servedBy === "SEMANTIC") {
      telemetry.successfulSemantic++;
    } else {
      telemetry.fallbacks++;
      if (fallbackReason && fallbackReason.includes("QUALITY_GATE")) {
        telemetry.qualityGateRejections++;
      } else {
        telemetry.realizerFailures++;
      }
    }

    // Inspect Provider and StyleSlot traces
    for (const tr of traces) {
      if (tr.providerContributions) {
        for (const [providerName, contribution] of Object.entries(tr.providerContributions)) {
          telemetry.providerActivations[providerName] = (telemetry.providerActivations[providerName] || 0) + 1;
          if (contribution.rejected) {
            telemetry.providerRejections[providerName] = (telemetry.providerRejections[providerName] || 0) + 1;
          }
          if (contribution.abstained) {
            telemetry.providerAbstentions[providerName] = (telemetry.providerAbstentions[providerName] || 0) + 1;
          }
          if (fallbackReason) {
            telemetry.providerFallbacks[providerName] = (telemetry.providerFallbacks[providerName] || 0) + 1;
          }
        }
      }

      if (tr.slots) {
        for (const [slotKey, slotData] of Object.entries(tr.slots)) {
          telemetry.styleSlotUsage[slotKey] = (telemetry.styleSlotUsage[slotKey] || 0) + 1;
          if (slotData.hasConflict) {
            telemetry.styleSlotConflicts[slotKey] = (telemetry.styleSlotConflicts[slotKey] || 0) + 1;
          }
          if (slotData.rejected) {
            telemetry.styleSlotRejections[slotKey] = (telemetry.styleSlotRejections[slotKey] || 0) + 1;
          }
        }
      }
    }
  }

  /**
   * Audits all providers and assigns value classifications.
   */
  function auditProviderHealth() {
    const dashboard = {};

    for (const [name, activations] of Object.entries(telemetry.providerActivations)) {
      const rejections = telemetry.providerRejections[name] || 0;
      const abstentions = telemetry.providerAbstentions[name] || 0;
      const fallbacks = telemetry.providerFallbacks[name] || 0;

      const acceptanceRate = activations > 0 ? Number(((activations - rejections) / activations).toFixed(3)) : 1.0;
      const fallbackRate = activations > 0 ? Number((fallbacks / activations).toFixed(3)) : 0.0;

      let classification = PROVIDER_VALUE_CLASSES.NEUTRAL;
      if (activations < 5) {
        classification = PROVIDER_VALUE_CLASSES.UNKNOWN;
      } else if (fallbackRate > 0.05 || acceptanceRate < 0.80) {
        classification = PROVIDER_VALUE_CLASSES.HARMFUL;
      } else if (activations >= 20 && acceptanceRate >= 0.95) {
        classification = PROVIDER_VALUE_CLASSES.HIGH_VALUE;
      } else if (activations >= 5 && acceptanceRate >= 0.90) {
        classification = PROVIDER_VALUE_CLASSES.NEUTRAL;
      } else {
        classification = PROVIDER_VALUE_CLASSES.LOW_VALUE;
      }

      dashboard[name] = Object.freeze({
        activations,
        rejections,
        abstentions,
        acceptanceRate,
        fallbackRate,
        classification
      });
    }

    return Object.freeze(dashboard);
  }

  /**
   * Audits StyleSlot usage, conflict frequency, and rejection rates.
   */
  function auditStyleSlotHealth() {
    const slotHealth = {};

    for (const [slot, usage] of Object.entries(telemetry.styleSlotUsage)) {
      const conflicts = telemetry.styleSlotConflicts[slot] || 0;
      const rejections = telemetry.styleSlotRejections[slot] || 0;
      const conflictRate = usage > 0 ? Number((conflicts / usage).toFixed(3)) : 0.0;
      const rejectionRate = usage > 0 ? Number((rejections / usage).toFixed(3)) : 0.0;

      slotHealth[slot] = Object.freeze({
        usage,
        conflicts,
        rejections,
        conflictRate,
        rejectionRate,
        isConflictHeavy: conflictRate > 0.15
      });
    }

    return Object.freeze(slotHealth);
  }

  /**
   * Clusters reported regression samples into root causes and frequencies.
   */
  function clusterProductionFailures(samples = telemetry.regressionSamples) {
    const clusters = {};

    for (const sample of samples) {
      const key = `${sample.errorType || "GENERAL_ERROR"}::${sample.provider || "CORE_REALIZER"}::${sample.genre || "GENERAL"}`;
      if (!clusters[key]) {
        clusters[key] = {
          key,
          errorType: sample.errorType || "GENERAL_ERROR",
          provider: sample.provider || "CORE_REALIZER",
          genre: sample.genre || "GENERAL",
          count: 0,
          examples: []
        };
      }
      clusters[key].count++;
      if (clusters[key].examples.length < 3) {
        clusters[key].examples.push({
          sourceZh: sample.sourceZh,
          legacyOutput: sample.legacyOutput,
          semanticOutput: sample.semanticOutput,
          rootCause: sample.rootCause
        });
      }
    }

    // Sort by descending frequency (top 20 issues)
    return Object.values(clusters)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .map((c) => Object.freeze(c));
  }

  /**
   * Records a confirmed production regression into the persistent regression corpus.
   */
  function recordRegressionSample(sample) {
    telemetry.regressionSamples.push(Object.freeze({
      id: `REG_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...sample
    }));
  }

  function getTelemetrySummary() {
    const fallbackRate = telemetry.totalChapters > 0
      ? Number((telemetry.fallbacks / telemetry.totalChapters).toFixed(4))
      : 0.0;
    const successRate = telemetry.totalChapters > 0
      ? Number((telemetry.successfulSemantic / telemetry.totalChapters).toFixed(4))
      : 1.0;

    return Object.freeze({
      versions: SEMANTIC_SYSTEM_VERSIONS,
      totalChapters: telemetry.totalChapters,
      totalClauses: telemetry.totalClauses,
      successfulSemantic: telemetry.successfulSemantic,
      fallbacks: telemetry.fallbacks,
      fallbackRate,
      successRate,
      qualityGateRejections: telemetry.qualityGateRejections,
      realizerFailures: telemetry.realizerFailures,
      regressionSampleCount: telemetry.regressionSamples.length
    });
  }

  return Object.freeze({
    recordChapterTelemetry,
    auditProviderHealth,
    auditStyleSlotHealth,
    clusterProductionFailures,
    recordRegressionSample,
    getTelemetrySummary,
    getRegressionSamples: () => Object.freeze([...telemetry.regressionSamples])
  });
}

module.exports = {
  createProductionFeedbackLoop,
  SEMANTIC_SYSTEM_VERSIONS,
  PROVIDER_VALUE_CLASSES,
  REALIZER_ERROR_CATEGORIES
};
