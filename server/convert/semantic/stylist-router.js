"use strict";

/**
 * Stylist Router & Conflict Resolver (Phase 2)
 * 
 * Orchestrates multi-provider contribution bidding, applies semantic signature gating,
 * and resolves slot conflicts via mutual suppression & weighted scoring.
 */

const { checkSignatureCompatibility } = require("./contracts");
const { createProviderRegistry } = require("./providers/provider-registry");

// Domain Mutual Suppression Matrix
const SUPPRESSION_RULES = [
  {
    dominantDomain: "COMBAT",
    dominantThreshold: 0.60,
    suppressedDomains: ["ZEN_TEA"]
  },
  {
    dominantDomain: "SUPERNATURAL_HORROR",
    dominantThreshold: 0.50,
    suppressedDomains: ["ROMANCE_AESTHETICS"]
  }
];

function createStylistRouter({
  registry = createProviderRegistry(),
  minDomainActivationWeight = 0.15
} = {}) {
  /**
   * Routes a ClauseIR and its SemanticContext to appropriate providers,
   * evaluates candidate signatures, and resolves slot conflicts.
   * 
   * @param {Object} clauseIR
   * @param {Object} context
   * @returns {Object} RoutingResult
   */
  function route(clauseIR, context) {
    const domainWeights = (context && context.domainWeights) || {};
    const primaryDomain = (context && context.primaryDomain) || "NEUTRAL";

    // 1. Identify Suppressed Domains based on Dominant Active Domains
    const suppressedSet = new Set();
    for (const rule of SUPPRESSION_RULES) {
      const weight = domainWeights[rule.dominantDomain] || 0.0;
      if (weight >= rule.dominantThreshold) {
        for (const sup of rule.suppressedDomains) {
          suppressedSet.add(sup);
        }
      }
    }

    // 2. Select Eligible Providers
    const allProviders = registry.getAllProviders();
    const activeProviders = [];

    for (const provider of allProviders) {
      const weight = domainWeights[provider.domain] || 0.0;
      const isPrimary = provider.domain === primaryDomain;
      const isSuppressed = suppressedSet.has(provider.domain);

      if ((weight >= minDomainActivationWeight || isPrimary) && !isSuppressed) {
        activeProviders.push(provider);
      }
    }

    // 3. Collect Raw Contributions from Active Providers
    const rawSuggestions = [];
    const forbiddenPatterns = new Set();

    for (const provider of activeProviders) {
      const contribution = provider.getSuggestions(clauseIR, context);
      if (contribution.forbiddenPatterns) {
        for (const fp of contribution.forbiddenPatterns) forbiddenPatterns.add(fp);
      }

      for (const item of contribution.suggestions || []) {
        const domainWeight = domainWeights[provider.domain] || (provider.domain === primaryDomain ? 0.7 : 0.5);
        rawSuggestions.push({
          providerId: provider.providerId,
          domain: provider.domain,
          domainWeight,
          slotId: item.slotId,
          candidateVi: item.candidateVi,
          signature: item.signature,
          priority: item.priority
        });
      }
    }

    // 4. Semantic Signature Compatibility Gating & Scoring
    const sourceSig = clauseIR.semanticSignature;
    const vettedCandidates = [];
    const rejectedCandidates = [];

    for (const item of rawSuggestions) {
      const compat = checkSignatureCompatibility(sourceSig, item.signature);
      if (compat.compatible) {
        const compositeScore = Number((item.domainWeight * 0.40 + item.priority * 0.35 + compat.score * 0.25).toFixed(3));
        vettedCandidates.push({
          ...item,
          compatibilityScore: compat.score,
          compositeScore
        });
      } else {
        rejectedCandidates.push({
          ...item,
          reasons: compat.reasons
        });
      }
    }

    // 5. Slot Conflict Resolution: Highest Composite Score Wins
    const slotMap = new Map(); // slotId -> winning candidate
    for (const cand of vettedCandidates) {
      const existing = slotMap.get(cand.slotId);
      if (!existing || cand.compositeScore > existing.compositeScore) {
        slotMap.set(cand.slotId, cand);
      }
    }

    const acceptedSuggestions = Array.from(slotMap.values());

    return Object.freeze({
      clauseId: clauseIR.id,
      activeProviders: Object.freeze(activeProviders.map((p) => p.providerId)),
      acceptedSuggestions: Object.freeze(acceptedSuggestions),
      rejectedCandidates: Object.freeze(rejectedCandidates),
      forbiddenPatterns: Object.freeze(Array.from(forbiddenPatterns))
    });
  }

  return Object.freeze({
    route,
    getRegistry: () => registry
  });
}

module.exports = {
  createStylistRouter,
  SUPPRESSION_RULES
};
