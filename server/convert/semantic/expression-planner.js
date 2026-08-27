"use strict";

/**
 * Expression Planner (Phase 3)
 * 
 * Synthesizes Routing decisions, Discourse resolutions, Expansion Budget constraints,
 * and Rhythm Profiles into a single cohesive ExpressionPlan for 1-Pass Realization.
 */

const { createStylistRouter } = require("./stylist-router");
const { evaluateExpansionBudget } = require("./expansion-budget");
const { createRhythmProfile } = require("./rhythm-governor");
const { createAntiRepetitionTracker } = require("./anti-repetition");

function createExpressionPlanner({
  router = createStylistRouter(),
  antiRepetitionTracker = createAntiRepetitionTracker()
} = {}) {
  /**
   * Plans the exact lexical and syntactic substitutions for a ClauseIR.
   * 
   * @param {Object} clauseIR
   * @param {Object} context
   * @returns {Object} ExpressionPlan
   */
  function planClause(clauseIR, context = {}) {
    const routingDecision = router.route(clauseIR, context);
    const rhythmProfile = createRhythmProfile(clauseIR, context);

    const slotReplacements = [];
    const rejectedByBudget = [];

    for (const suggestion of routingDecision.acceptedSuggestions) {
      // Evaluate against Expansion Budget
      const budgetCheck = evaluateExpansionBudget(clauseIR, {
        targetVi: suggestion.candidateVi,
        introducedMetaphors: 0,
        adjectiveCount: suggestion.candidateVi.split(/\s+/).length > 4 ? 2 : 1
      });

      if (budgetCheck.allowed) {
        slotReplacements.push({
          slotId: suggestion.slotId,
          replacementVi: suggestion.candidateVi,
          providerId: suggestion.providerId,
          priority: suggestion.priority
        });
      } else {
        rejectedByBudget.push({
          slotId: suggestion.slotId,
          candidateVi: suggestion.candidateVi,
          reason: budgetCheck.reason
        });
      }
    }

    const resolvedSubject =
      clauseIR.subjectSlot && clauseIR.subjectSlot.resolvedPronoun
        ? clauseIR.subjectSlot.resolvedPronoun
        : null;

    return Object.freeze({
      clauseId: clauseIR.id,
      sourceZh: clauseIR.sourceZh,
      role: clauseIR.role,
      tier: clauseIR.tier,
      resolvedSubject,
      slotReplacements: Object.freeze(slotReplacements),
      rejectedByBudget: Object.freeze(rejectedByBudget),
      rhythmProfile,
      forbiddenPatterns: routingDecision.forbiddenPatterns
    });
  }

  return Object.freeze({
    planClause,
    getRouter: () => router,
    getAntiRepetitionTracker: () => antiRepetitionTracker
  });
}

module.exports = {
  createExpressionPlanner
};
