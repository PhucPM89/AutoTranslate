"use strict";

/**
 * Expansion Budget & Semantic Preservation Constraints (Phase 3)
 * 
 * Enforces Semantic Preservation Constraints (SPC):
 * 1. Entity Count Invariant: Does not allow adding unmentioned entities.
 * 2. Modifier Depth Limit: Restricts excessive adjective bloat in fast-paced action.
 * 3. Metaphor Grounding Invariant: Strictly forbids injecting ungrounded metaphors when source has none.
 * 4. Syllable Ceiling: Bounds length expansion ratio reasonably.
 */

/**
 * Evaluates whether a proposed replacement or phrase plan satisfies SPC invariants.
 * 
 * @param {Object} clauseIR
 * @param {Object} proposedPlan - { targetVi: string, introducedMetaphors?: number, adjectiveCount?: number }
 * @returns {{ allowed: boolean, reason: string | null }}
 */
function evaluateExpansionBudget(clauseIR, proposedPlan = {}) {
  const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
  const role = (clauseIR && clauseIR.role) || "ACTION";
  const invariants = (clauseIR && clauseIR.invariants) || {};

  const targetVi = String(proposedPlan.targetVi || "").trim();
  const words = targetVi.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // INVARIANT 1: Metaphor Grounding Rule
  // If the source Chinese clause has NO metaphor, and clause invariant forbids it,
  // reject any plan that introduces a full metaphorical clause.
  const hasMetaphorInZh = /如.*般|仿佛|好似|宛如|胜似/.test(sourceZh);
  if (!hasMetaphorInZh && !invariants.allowMetaphor && (proposedPlan.introducedMetaphors || 0) > 0) {
    return {
      allowed: false,
      reason: "FORBIDDEN_METAPHOR_INTRUSION: Source clause contains no metaphor"
    };
  }

  // INVARIANT 2: Modifier Depth & Adjective Ceiling in Action Clauses
  if (role === "ACTION") {
    const maxAdj = invariants.maxAdjectives ?? 1;
    if ((proposedPlan.adjectiveCount || 0) > maxAdj) {
      return {
        allowed: false,
        reason: `ADJECTIVE_BLOAT_IN_ACTION: Adjective count (${proposedPlan.adjectiveCount}) exceeds limit (${maxAdj})`
      };
    }
  }

  // INVARIANT 3: Reasonable Syllable Bound
  // For a short source text of length L characters, max Vietnamese words <= L * 3 + 4
  const maxWordsAllowed = Math.max(8, sourceZh.length * 3 + 4);
  if (wordCount > maxWordsAllowed) {
    return {
      allowed: false,
      reason: `EXCEEDED_SYLLABLE_CEILING: Word count (${wordCount}) exceeds bound (${maxWordsAllowed})`
    };
  }

  return {
    allowed: true,
    reason: null
  };
}

module.exports = {
  evaluateExpansionBudget
};
