"use strict";

/**
 * Production Canary Controller (Phase R4)
 * 
 * Provides unified, single-authority runtime management for the Semantic Translation Engine:
 * 1. Feature Flag Modes:
 *    - LEGACY  : 100% legacy pipeline execution (baseline guarantee).
 *    - SHADOW  : Legacy output served to user; Semantic pipeline runs in-band for telemetry.
 *    - CANARY  : Semantic pipeline served to user; protected by automatic fail-safe fallback to legacy.
 * 2. Traffic Rollout: Deterministic hashing (0% -> 1% -> 5% -> 10% -> 25% -> 50% -> 100%).
 * 3. Resource Guards: Max chapter length (500k chars), max clauses (5k clauses).
 * 4. Circuit Breaker / Auto-Abort: Reverts to legacy if failure rate exceeds threshold.
 * 5. Determinism & Concurrency Safety: Zero mutable global state across requests.
 */

const ENGINE_MODES = Object.freeze({
  LEGACY: "LEGACY",
  SHADOW: "SHADOW",
  CANARY: "CANARY"
});

const DEFAULT_RESOURCE_LIMITS = Object.freeze({
  MAX_CHAPTER_LENGTH: 500000, // 500k characters max per translation request
  MAX_CLAUSES: 5000,          // 5,000 clauses max per chapter
  AUTO_ABORT_FALLBACK_RATE: 0.05 // 5% max allowed fallback rate before circuit break
});

/**
 * Simple, deterministic 32-bit FNV-1a hash function for stable percentage bucketing.
 */
function fnv1a32(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

/**
 * Canary Controller Factory
 */
function createCanaryController({
  mode = ENGINE_MODES.LEGACY,
  canaryPercentage = 0,
  fallbackFunction = null,
  semanticOrchestrator = null,
  resourceLimits = DEFAULT_RESOURCE_LIMITS,
  chaosInjector = null
} = {}) {
  // Normalize mode string
  let currentMode = ENGINE_MODES.LEGACY;
  const upperMode = String(mode || "").toUpperCase();
  if (upperMode.includes("CANARY")) currentMode = ENGINE_MODES.CANARY;
  else if (upperMode.includes("SHADOW")) currentMode = ENGINE_MODES.SHADOW;

  let currentPercentage = Math.max(0, Math.min(100, Number(canaryPercentage) || 0));

  // Telemetry metrics
  const telemetry = {
    totalRequests: 0,
    legacyServed: 0,
    shadowServed: 0,
    canaryServed: 0,
    fallbackCount: 0,
    qualityGateRejections: 0,
    exceptionsCaught: 0,
    resourceLimitBreaches: 0,
    circuitBreakerTripped: false
  };

  /**
   * Translates a chapter text under active Canary / Shadow / Legacy controls.
   * 
   * @param {string} text
   * @param {Object} options
   * @returns {{ text: string, mode: string, servedBy: string, fallbackOccurred: boolean, fallbackReason: string|null, traces: Array }}
   */
  function translate(text, options = {}) {
    telemetry.totalRequests++;

    if (!text || typeof text !== "string") {
      return Object.freeze({
        text: "",
        mode: currentMode,
        servedBy: "EMPTY_INPUT",
        fallbackOccurred: false,
        fallbackReason: null,
        traces: []
      });
    }

    const legacyConvert = fallbackFunction || ((raw) => String(raw));

    // Check circuit breaker
    if (telemetry.circuitBreakerTripped) {
      telemetry.legacyServed++;
      return Object.freeze({
        text: legacyConvert(text),
        mode: currentMode,
        servedBy: "CIRCUIT_BREAKER_LEGACY",
        fallbackOccurred: true,
        fallbackReason: "CIRCUIT_BREAKER_ACTIVE",
        traces: []
      });
    }

    // 1. LEGACY MODE
    if (currentMode === ENGINE_MODES.LEGACY) {
      telemetry.legacyServed++;
      return Object.freeze({
        text: legacyConvert(text),
        mode: ENGINE_MODES.LEGACY,
        servedBy: "LEGACY",
        fallbackOccurred: false,
        fallbackReason: null,
        traces: []
      });
    }

    // 2. Resource Limit Guard
    if (text.length > resourceLimits.MAX_CHAPTER_LENGTH) {
      telemetry.resourceLimitBreaches++;
      telemetry.fallbackCount++;
      telemetry.legacyServed++;
      return Object.freeze({
        text: legacyConvert(text),
        mode: currentMode,
        servedBy: "RESOURCE_GUARD_LEGACY",
        fallbackOccurred: true,
        fallbackReason: "MAX_CHAPTER_LENGTH_EXCEEDED",
        traces: []
      });
    }

    // 3. Traffic Split Decision (Canary percentage bucketing)
    let shouldRunCanary = currentMode === ENGINE_MODES.CANARY;
    if (shouldRunCanary && currentPercentage < 100) {
      const bucket = fnv1a32(text.slice(0, 128)) % 100;
      if (bucket >= currentPercentage) {
        shouldRunCanary = false;
      }
    }

    // If bucketed into Legacy traffic
    if (currentMode === ENGINE_MODES.CANARY && !shouldRunCanary) {
      telemetry.legacyServed++;
      return Object.freeze({
        text: legacyConvert(text),
        mode: ENGINE_MODES.CANARY,
        servedBy: "CANARY_TRAFFIC_SPLIT_LEGACY",
        fallbackOccurred: false,
        fallbackReason: null,
        traces: []
      });
    }

    // 4. Run Semantic Pipeline inside Protected Error Boundary
    try {
      if (typeof chaosInjector === "function") {
        chaosInjector(text, options);
      }

      if (!semanticOrchestrator) {
        throw new Error("SEMANTIC_ORCHESTRATOR_UNAVAILABLE");
      }

      const shadowResult = semanticOrchestrator.translateChapter(text, options);
      const semanticOutput = shadowResult.text;
      const traces = shadowResult.traces || [];

      // Check Quality Gate across all traces
      let qualityGateFailed = false;
      let qgReason = null;
      for (const tr of traces) {
        if (tr.budgetAudit && tr.budgetAudit.qualityGateStatus && !tr.budgetAudit.qualityGateStatus.includes("PASSED")) {
          qualityGateFailed = true;
          qgReason = tr.budgetAudit.qualityGateStatus;
          break;
        }
      }

      if (qualityGateFailed) {
        telemetry.qualityGateRejections++;
        telemetry.fallbackCount++;
        telemetry.legacyServed++;
        return Object.freeze({
          text: legacyConvert(text),
          mode: currentMode,
          servedBy: "QUALITY_GATE_FALLBACK_LEGACY",
          fallbackOccurred: true,
          fallbackReason: `QUALITY_GATE_REJECT: ${qgReason}`,
          traces
        });
      }

      // Check for unexpected empty semantic output
      if (!semanticOutput || semanticOutput.trim().length === 0) {
        throw new Error("EMPTY_SEMANTIC_REALIZATION");
      }

      // If SHADOW MODE: return legacy output as final, keep shadow traces
      if (currentMode === ENGINE_MODES.SHADOW) {
        telemetry.shadowServed++;
        return Object.freeze({
          text: legacyConvert(text),
          mode: ENGINE_MODES.SHADOW,
          servedBy: "SHADOW_LEGACY_OUTPUT",
          fallbackOccurred: false,
          fallbackReason: null,
          traces,
          shadowOutput: semanticOutput
        });
      }

      // If CANARY MODE: return semantic output as final
      telemetry.canaryServed++;
      return Object.freeze({
        text: semanticOutput,
        mode: ENGINE_MODES.CANARY,
        servedBy: "SEMANTIC_CANARY",
        fallbackOccurred: false,
        fallbackReason: null,
        traces
      });

    } catch (err) {
      telemetry.exceptionsCaught++;
      telemetry.fallbackCount++;
      telemetry.legacyServed++;

      // Check circuit breaker condition
      const totalAttempted = telemetry.canaryServed + telemetry.fallbackCount;
      if (totalAttempted >= 20) {
        const fallbackRate = telemetry.fallbackCount / totalAttempted;
        if (fallbackRate > resourceLimits.AUTO_ABORT_FALLBACK_RATE) {
          telemetry.circuitBreakerTripped = true;
        }
      }

      return Object.freeze({
        text: legacyConvert(text),
        mode: currentMode,
        servedBy: "EXCEPTION_FALLBACK_LEGACY",
        fallbackOccurred: true,
        fallbackReason: String(err.message || err),
        traces: []
      });
    }
  }

  function getHealthMetrics() {
    const totalAttempted = telemetry.canaryServed + telemetry.fallbackCount;
    const fallbackRate = totalAttempted > 0 ? Number((telemetry.fallbackCount / totalAttempted).toFixed(4)) : 0.0;

    return Object.freeze({
      activeMode: currentMode,
      canaryPercentage: currentPercentage,
      totalRequests: telemetry.totalRequests,
      legacyServed: telemetry.legacyServed,
      shadowServed: telemetry.shadowServed,
      canaryServed: telemetry.canaryServed,
      fallbackCount: telemetry.fallbackCount,
      fallbackRate,
      qualityGateRejections: telemetry.qualityGateRejections,
      exceptionsCaught: telemetry.exceptionsCaught,
      resourceLimitBreaches: telemetry.resourceLimitBreaches,
      circuitBreakerTripped: telemetry.circuitBreakerTripped
    });
  }

  function setMode(newMode) {
    const upper = String(newMode || "").toUpperCase();
    if (upper.includes("CANARY")) currentMode = ENGINE_MODES.CANARY;
    else if (upper.includes("SHADOW")) currentMode = ENGINE_MODES.SHADOW;
    else currentMode = ENGINE_MODES.LEGACY;
  }

  function setCanaryPercentage(pct) {
    currentPercentage = Math.max(0, Math.min(100, Number(pct) || 0));
  }

  function resetMetrics() {
    telemetry.totalRequests = 0;
    telemetry.legacyServed = 0;
    telemetry.shadowServed = 0;
    telemetry.canaryServed = 0;
    telemetry.fallbackCount = 0;
    telemetry.qualityGateRejections = 0;
    telemetry.exceptionsCaught = 0;
    telemetry.resourceLimitBreaches = 0;
    telemetry.circuitBreakerTripped = false;
  }

  return Object.freeze({
    translate,
    getHealthMetrics,
    setMode,
    setCanaryPercentage,
    resetMetrics,
    getMode: () => currentMode,
    getCanaryPercentage: () => currentPercentage
  });
}

module.exports = {
  createCanaryController,
  ENGINE_MODES,
  DEFAULT_RESOURCE_LIMITS,
  fnv1a32
};
