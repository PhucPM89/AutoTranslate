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

    const winningContributions = routingDecision.selectedContributions || routingDecision.acceptedSuggestions || [];

    for (const contrib of winningContributions) {
      const slotId = contrib.sourceSpanZh || contrib.targetSlot || contrib.slotId || "";
      const candidateVi = contrib.candidateVi || "";

      // Evaluate against Expansion Budget
      const budgetCheck = evaluateExpansionBudget(clauseIR, {
        targetVi: candidateVi,
        introducedMetaphors: contrib.introducedMetaphor ? 1 : 0,
        adjectiveCount: (contrib.introducedInformation || []).length
      });

      if (budgetCheck.allowed) {
        slotReplacements.push({
          slotId,
          replacementVi: candidateVi,
          providerId: contrib.providerId,
          priority: contrib.lexicalPriority || contrib.priority || 0.8
        });
      } else {
        rejectedByBudget.push({
          slotId,
          candidateVi,
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
