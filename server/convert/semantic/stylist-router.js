"use strict";

/**
 * Stylist Router & Conflict Resolver (Phase 2A)
 * 
 * Orchestrates multi-provider contribution bidding, evaluates semantic compatibility,
 * groups contributions by StyleSlot, and deterministically resolves slot conflicts
 * via multi-factor scoring (Domain Weight, Lexical Priority, Affect Alignment, Rhythm, Expansion Cost).
 */

const { checkSignatureCompatibility } = require("./contracts");
const { createProviderRegistry } = require("./providers/provider-registry");
const { STYLE_SLOTS } = require("./providers/stylist-contribution");

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

// Conflict Resolution Scoring Weights
const ROUTER_SCORING_WEIGHTS = Object.freeze({
  DOMAIN_WEIGHT: 0.35,
  LEXICAL_PRIORITY: 0.30,
  SIGNATURE_COMPAT: 0.25,
  RHYTHM_MATCH: 0.10
});

function createStylistRouter({
  registry = createProviderRegistry(),
  minDomainActivationWeight = 0.15,
  weights = ROUTER_SCORING_WEIGHTS
} = {}) {
  /**
   * Routes a ClauseIR and its SemanticContext to appropriate providers,
   * evaluates candidate signatures, and resolves slot conflicts.
   * 
   * @param {Object} clauseIR
   * @param {Object} context
   * @returns {Object} RoutingResult
   */
  function route(clauseIR, context = {}) {
    const domainWeights = (context && context.domainWeights) || {};
    const primaryDomain = (context && context.primaryDomain) || "NEUTRAL";
    const sourceSig = (clauseIR && clauseIR.semanticSignature) || null;
    const invariants = (clauseIR && clauseIR.invariants) || {};

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

    // 2. Select Eligible Providers based on Context & Clause Role
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
    const rawContributions = [];
    const forbiddenPatterns = new Set();

    for (const provider of activeProviders) {
      const result = provider.getSuggestions(clauseIR, context);
      if (result.forbiddenPatterns) {
        for (const fp of result.forbiddenPatterns) forbiddenPatterns.add(fp);
      }

      for (const item of (result.contributions || result.suggestions || [])) {
        const contrib = item.targetSlot ? item : {
          providerId: provider.providerId,
          domain: provider.domain,
          targetSlot: item.slotId || item.targetSlot || "GENERAL_SLOT",
          sourceSpanZh: item.slotId || item.targetZh || item.sourceSpanZh || "",
          candidateVi: item.candidateVi,
          semanticSignature: item.signature || item.semanticSignature,
          lexicalPriority: item.priority || item.lexicalPriority || 0.8,
          semanticExpansionCost: item.semanticExpansionCost || 0.0,
          introducedInformation: item.introducedInformation || [],
          introducedMetaphor: item.introducedMetaphor || false
        };
        rawContributions.push(contrib);
      }
    }

    // 4. Group Contributions by Target Slot
    const slotMap = new Map();
    for (const contrib of rawContributions) {
      const slot = contrib.targetSlot || STYLE_SLOTS.ACTION_STRIKE;
      if (!slotMap.has(slot)) {
        slotMap.set(slot, []);
      }
      slotMap.get(slot).push(contrib);
    }

    // 5. Conflict Resolution & Scoring per Slot
    const selectedContributions = [];
    const rejectedContributions = [];
    const slotResolutions = [];

    for (const [slot, candidates] of slotMap.entries()) {
      const scoredCandidates = [];

      for (const cand of candidates) {
        // A. Semantic Signature Check
        let sigScore = 0.80;
        let isCompatible = true;
        let rejectReason = null;

        if (sourceSig && cand.semanticSignature) {
          const compat = checkSignatureCompatibility(sourceSig, cand.semanticSignature);
          isCompatible = compat.compatible;
          sigScore = compat.score;
          if (!isCompatible) {
            rejectReason = `SIGNATURE_INCOMPATIBLE: ${compat.reasons.join("; ")}`;
          }
        }

        // B. Anti-Overwriting & Metaphor Check
        if (invariants.allowMetaphor === false && cand.introducedMetaphor) {
          isCompatible = false;
          rejectReason = "METAPHOR_DISALLOWED_BY_INVARIANT";
        }

        // C. Expansion Cost Penalty
        let expansionPenalty = cand.semanticExpansionCost * 0.20;
        if (invariants.maxAdjectives !== undefined && cand.introducedInformation.length > invariants.maxAdjectives) {
          expansionPenalty += 0.15;
        }

        if (!isCompatible) {
          rejectedContributions.push({
            contribution: cand,
            reason: rejectReason,
            score: 0.0
          });
          continue;
        }

        // D. Calculate Composite Bid Score
        const domainWeight = (cand.domain && domainWeights[cand.domain] !== undefined)
          ? domainWeights[cand.domain]
          : (domainWeights[cand.providerId.replace("-provider", "").toUpperCase()] ||
             (primaryDomain !== "NEUTRAL" ? 0.70 : 0.50));

        const rhythmMatch = (cand.rhythmPreference === "FAST_PUNCHY" && clauseIR.role === "ACTION") ? 1.0 : 0.80;

        const compositeScore = Number(Math.max(0.0, Math.min(1.0,
          domainWeight * weights.DOMAIN_WEIGHT +
          cand.lexicalPriority * weights.LEXICAL_PRIORITY +
          sigScore * weights.SIGNATURE_COMPAT +
          rhythmMatch * weights.RHYTHM_MATCH -
          expansionPenalty
        )).toFixed(3));

        scoredCandidates.push({
          contribution: cand,
          compositeScore,
          breakdown: {
            domainWeight,
            lexicalPriority: cand.lexicalPriority,
            sigScore,
            rhythmMatch,
            expansionPenalty
          }
        });
      }

      if (scoredCandidates.length === 0) continue;

      // Sort descending by composite score
      scoredCandidates.sort((a, b) => b.compositeScore - a.compositeScore);

      const top1 = scoredCandidates[0];
      const top2 = scoredCandidates.length > 1 ? scoredCandidates[1] : null;
      const margin = top2 ? Number((top1.compositeScore - top2.compositeScore).toFixed(3)) : 1.0;

      let decision = "WIN";
      if (top1.compositeScore < 0.40) {
        decision = "ABSTAIN";
      } else if (top2 && margin < 0.05 && top1.compositeScore < 0.80) {
        decision = "ABSTAIN";
      }

      if (decision === "WIN") {
        selectedContributions.push(top1.contribution);

        if (top2) {
          for (let i = 1; i < scoredCandidates.length; i++) {
            rejectedContributions.push({
              contribution: scoredCandidates[i].contribution,
              reason: `LOWER_BID_SCORE (Score: ${scoredCandidates[i].compositeScore} vs Winner: ${top1.compositeScore})`,
              score: scoredCandidates[i].compositeScore
            });
          }
        }
      }

      slotResolutions.push(Object.freeze({
        targetSlot: slot,
        decision,
        winner: decision === "WIN" ? top1.contribution : null,
        confidence: top1.compositeScore,
        margin,
        alternatives: Object.freeze(scoredCandidates.slice(1).map((s) => ({
          candidateVi: s.contribution.candidateVi,
          providerId: s.contribution.providerId,
          score: s.compositeScore
        })))
      }));
    }

    return Object.freeze({
      clauseId: clauseIR ? clauseIR.id : "",
      activeProviders: Object.freeze(activeProviders.map((p) => p.providerId)),
      selectedContributions: Object.freeze(selectedContributions),
      acceptedSuggestions: Object.freeze(selectedContributions.map((c) => ({
        slotId: c.sourceSpanZh || c.targetSlot,
        candidateVi: c.candidateVi,
        providerId: c.providerId,
        priority: c.lexicalPriority
      }))),
      slotResolutions: Object.freeze(slotResolutions),
      rejectedContributions: Object.freeze(rejectedContributions),
      forbiddenPatterns: Object.freeze(Array.from(forbiddenPatterns)),
      provenance: "stylist-router:phase-2a"
    });
  }

  return Object.freeze({
    route,
    getRegistry: () => registry,
    getSuppressionRules: () => [...SUPPRESSION_RULES]
  });
}

module.exports = {
  createStylistRouter,
  SUPPRESSION_RULES,
  ROUTER_SCORING_WEIGHTS
};
