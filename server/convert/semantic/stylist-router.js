"use strict";

/**
 * Stylist Router & Conflict Resolver (Wave B.5 Hardened)
 * 
 * Orchestrates multi-provider contribution bidding, evaluates semantic compatibility,
 * groups contributions by StyleSlot, and deterministically resolves slot conflicts
 * via multi-factor scoring (Domain Weight, Lexical Priority, Affect Alignment, Rhythm, Expansion Cost).
 * 
 * Implements:
 * - Provider order independence & conflict order independence.
 * - Semantic equivalence deduplication.
 * - 4 distinct resolution outcomes: WIN, MERGE, REJECT, ABSTAIN.
 * - Slot metadata-driven multiplicity & merging.
 * - Combined clause expansion budget & saturation control.
 */

const { checkSignatureCompatibility } = require("./contracts");
const { createDefaultProviderRegistry } = require("./providers/provider-registry");
const { STYLE_SLOTS } = require("./providers/stylist-contribution");
const { getSlotDefinition } = require("./providers/style-slot-definitions");
const { getDomainInteractionRelation, INTERACTION_RELATIONS } = require("./provider-interaction-matrix");

// Domain Mutual Suppression Matrix (Retained for backwards compatibility)
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

/**
 * Collapses duplicate or semantically equivalent contributions from multiple providers.
 */
function deduplicateContributions(rawContributions) {
  const map = new Map();
  const result = [];

  for (const item of rawContributions) {
    const key = `${item.targetSlot}::${item.sourceSpanZh}::${item.candidateVi.toLowerCase().trim()}`;
    if (!map.has(key)) {
      map.set(key, { ...item, mergedProvenances: [item.provenance || item.providerId] });
      result.push(map.get(key));
    } else {
      const existing = map.get(key);
      existing.lexicalPriority = Math.max(existing.lexicalPriority, item.lexicalPriority || 0.8);
      existing.confidence = Math.max(existing.confidence, item.confidence || 1.0);
      existing.semanticExpansionCost = Math.min(existing.semanticExpansionCost, item.semanticExpansionCost || 0.0);
      if (item.provenance && !existing.mergedProvenances.includes(item.provenance)) {
        existing.mergedProvenances.push(item.provenance);
        existing.provenance = existing.mergedProvenances.join("+");
      }
    }
  }

  return result;
}

function createStylistRouter({
  registry = createDefaultProviderRegistry(),
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

    // 1. Identify Suppressed Domains based on Suppression Rules
    const suppressedSet = new Set();
    for (const rule of SUPPRESSION_RULES) {
      const weight = domainWeights[rule.dominantDomain] || 0.0;
      const isDominantPrimary = primaryDomain === rule.dominantDomain;
      if (weight >= rule.dominantThreshold && isDominantPrimary) {
        for (const sup of rule.suppressedDomains) {
          suppressedSet.add(sup);
        }
      }
    }

    // 2. Select Eligible Providers & Ensure Deterministic Order
    const rawAll = Array.isArray(registry)
      ? registry
      : (typeof registry.getAllProviders === "function" ? registry.getAllProviders() : []);
    
    // Deterministic sort of providers by providerId so execution order never depends on insertion order
    const allProviders = rawAll.slice().sort((a, b) => {
      const idA = a.providerId || a.id || "";
      const idB = b.providerId || b.id || "";
      return idA.localeCompare(idB);
    });

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
      const result = typeof provider.getSuggestions === "function"
        ? provider.getSuggestions(clauseIR, context)
        : (typeof provider.proposeContributions === "function"
            ? { contributions: provider.proposeContributions(clauseIR, context) }
            : (typeof provider.contribute === "function"
                ? { contributions: provider.contribute(clauseIR, context) }
                : { contributions: [] }));

      if (result.forbiddenPatterns) {
        for (const fp of result.forbiddenPatterns) forbiddenPatterns.add(fp);
      }

      const list = Array.isArray(result) ? result : (result.contributions || result.suggestions || []);
      for (const item of list) {
        const contrib = item.targetSlot ? item : {
          providerId: provider.providerId || provider.id,
          domain: provider.domain,
          targetSlot: item.slotId || item.targetSlot || "GENERAL_SLOT",
          sourceSpanZh: item.slotId || item.targetZh || item.sourceSpanZh || "",
          candidateVi: item.candidateVi,
          semanticSignature: item.signature || item.semanticSignature,
          lexicalPriority: item.priority || item.lexicalPriority || 0.8,
          semanticExpansionCost: item.semanticExpansionCost || 0.0,
          introducedInformation: item.introducedInformation || [],
          introducedMetaphor: item.introducedMetaphor || false,
          surfaceRealization: item.surfaceRealization !== undefined ? item.surfaceRealization : true,
          semanticAssertions: item.semanticAssertions || [],
          provenance: item.provenance || `${provider.providerId || provider.id}:${item.targetZh || item.slotId}`
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

    // Sort slot keys deterministically
    const sortedSlots = Array.from(slotMap.keys()).sort();

    for (const slot of sortedSlots) {
      const candidates = slotMap.get(slot);
      const slotDef = getSlotDefinition(slot);
      const scoredCandidates = [];

      for (const cand of candidates) {
        // A. Semantic Signature Check
        let sigScore = 0.80;
        let isCompatible = true;
        let rejectReason = null;

        if (sourceSig && cand.semanticSignature) {
          const compat = checkSignatureCompatibility(sourceSig, cand.semanticSignature, {
            maxValenceDiff: 0.85,
            maxIntensityDiff: 0.65,
            minAffectSimilarity: 0.15
          });
          isCompatible = compat.compatible || (compat.score >= 0.35);
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

      // Deterministic sort: Score DESC, Priority DESC, Confidence DESC, candidateVi ASC (order-independent tiebreaker)
      scoredCandidates.sort((a, b) => {
        if (Math.abs(b.compositeScore - a.compositeScore) > 1e-6) {
          return b.compositeScore - a.compositeScore;
        }
        if (Math.abs(b.contribution.lexicalPriority - a.contribution.lexicalPriority) > 1e-6) {
          return b.contribution.lexicalPriority - a.contribution.lexicalPriority;
        }
        if (Math.abs(a.contribution.semanticExpansionCost - b.contribution.semanticExpansionCost) > 1e-6) {
          return a.contribution.semanticExpansionCost - b.contribution.semanticExpansionCost;
        }
        const keyA = `${a.contribution.candidateVi}::${a.contribution.providerId}`;
        const keyB = `${b.contribution.candidateVi}::${b.contribution.providerId}`;
        return keyA.localeCompare(keyB);
      });

      // E. Resolution Policy (WIN, MERGE, ABSTAIN)
      if (slotDef.canMerge) {
        // Multi-contribution merging up to maxMultiplicity
        const maxMult = slotDef.maxMultiplicity || 2;
        const validCandidates = scoredCandidates.filter((s) => s.compositeScore >= 0.40);
        const mergedWinners = validCandidates.slice(0, maxMult);

        if (mergedWinners.length > 0) {
          for (const winner of mergedWinners) {
            selectedContributions.push(winner.contribution);
          }

          // Excess candidates beyond maxMultiplicity are recorded as SATURATED
          for (let i = maxMult; i < scoredCandidates.length; i++) {
            rejectedContributions.push({
              contribution: scoredCandidates[i].contribution,
              reason: `SLOT_SATURATED (Max multiplicity ${maxMult} reached)`,
              score: scoredCandidates[i].compositeScore
            });
          }

          slotResolutions.push(Object.freeze({
            targetSlot: slot,
            semanticType: slotDef.semanticType,
            decision: "MERGE",
            merged: Object.freeze(mergedWinners.map((w) => w.contribution)),
            confidence: mergedWinners[0].compositeScore,
            margin: 1.0,
            alternatives: Object.freeze(scoredCandidates.slice(maxMult).map((s) => ({
              candidateVi: s.contribution.candidateVi,
              providerId: s.contribution.providerId,
              score: s.compositeScore
            })))
          }));
        } else {
          slotResolutions.push(Object.freeze({
            targetSlot: slot,
            semanticType: slotDef.semanticType,
            decision: "ABSTAIN",
            winner: null,
            merged: [],
            confidence: 0.0,
            margin: 0.0,
            alternatives: []
          }));
        }
      } else {
        // Single winner competitive slot
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
          semanticType: slotDef.semanticType,
          decision,
          winner: decision === "WIN" ? top1.contribution : null,
          merged: decision === "WIN" ? [top1.contribution] : [],
          confidence: top1.compositeScore,
          margin,
          alternatives: Object.freeze(scoredCandidates.slice(1).map((s) => ({
            candidateVi: s.contribution.candidateVi,
            providerId: s.contribution.providerId,
            score: s.compositeScore
          })))
        }));
      }
    }

    // 6. Aggregate Clause-Level Saturation & Modifier Deduplication
    const seenAtoms = new Set();
    const finalSelectedContributions = [];
    let totalAdjectives = 0;
    const maxClauseAdjectives = invariants.maxAdjectives !== undefined ? invariants.maxAdjectives * 2 : 4;

    for (const contrib of selectedContributions) {
      let isOverBudget = false;
      const filteredInfo = [];

      for (const info of contrib.introducedInformation || []) {
        const atomKey = String(info).toLowerCase().trim();
        if (seenAtoms.has(atomKey)) {
          // Atom already introduced by another slot; omit duplicate atom
          continue;
        }
        if (totalAdjectives >= maxClauseAdjectives) {
          isOverBudget = true;
          break;
        }
        seenAtoms.add(atomKey);
        filteredInfo.push(info);
        totalAdjectives++;
      }

      if (!isOverBudget || contrib.surfaceRealization) {
        finalSelectedContributions.push(contrib);
      } else {
        rejectedContributions.push({
          contribution: contrib,
          reason: "CLAUSE_EXPANSION_SATURATION_EXCEEDED",
          score: contrib.lexicalPriority
        });
      }
    }

    return Object.freeze({
      clauseId: clauseIR ? clauseIR.id : "",
      activeProviders: Object.freeze(activeProviders.map((p) => p.providerId || p.id || "")),
      selectedContributions: Object.freeze(finalSelectedContributions),
      acceptedSuggestions: Object.freeze(finalSelectedContributions.map((c) => ({
        slotId: c.sourceSpanZh || c.targetSlot,
        candidateVi: c.candidateVi,
        providerId: c.providerId,
        priority: c.lexicalPriority
      }))),
      slotResolutions: Object.freeze(slotResolutions),
      rejectedContributions: Object.freeze(rejectedContributions),
      forbiddenPatterns: Object.freeze(Array.from(forbiddenPatterns)),
      provenance: "stylist-router:wave-b.5"
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
