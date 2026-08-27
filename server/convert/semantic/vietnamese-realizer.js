"use strict";

/**
 * 1-Pass Vietnamese Realizer (Phase 3)
 * 
 * Generates publication-grade Vietnamese prose in a single deterministic pass.
 * Eliminates multi-pass regex rewrites, applies planned slots, rotates repetitive phrases,
 * and attaches full Provenance Trace metadata.
 */

const { createExpressionPlanner } = require("./expression-planner");
const { createProvenanceTrace } = require("./contracts");

function capitalizeFirst(text) {
  if (!text) return text;
  const m = /\p{L}/u.exec(text);
  if (!m) return text;
  const i = m.index;
  return text.slice(0, i) + text[i].toLocaleUpperCase("vi") + text.slice(i + 1);
}

function createVietnameseRealizer({
  planner = createExpressionPlanner(),
  baseConvertFunction = null
} = {}) {
  const antiRepetitionTracker = planner.getAntiRepetitionTracker();

  /**
   * Realizes a single ClauseIR and ExpressionPlan into final Vietnamese string.
   * 
   * @param {Object} clauseIR
   * @param {Object} context
   * @returns {{ text: string, trace: Object }}
   */
  function realizeClause(clauseIR, context = {}) {
    const plan = planner.planClause(clauseIR, context);
    let rawText = clauseIR.sourceZh || "";

    // 1. If we have planned slot replacements, apply them cleanly
    let rendered = rawText;
    const appliedRules = [];

    for (const slot of plan.slotReplacements) {
      if (rendered.includes(slot.slotId)) {
        rendered = rendered.split(slot.slotId).join(slot.replacementVi);
        appliedRules.push({
          provider: slot.providerId,
          slot: slot.slotId,
          chosenCandidate: slot.replacementVi,
          score: slot.priority
        });
      }
    }

    // 2. If fallback base converter provided and text still has Chinese, convert remainder
    if (baseConvertFunction && /[\u4e00-\u9fa5]/.test(rendered)) {
      rendered = baseConvertFunction(rendered);
    }

    // 3. If Pro-drop implicit subject was resolved, prepend if necessary for complete Vietnamese grammar
    if (clauseIR.subjectSlot && clauseIR.subjectSlot.isImplicit && plan.resolvedSubject) {
      // Check if rendered text already starts with a pronoun
      const startsWithPronoun = /^(?:hắn|nàng|y|ta|ngươi|đối phương|người này)\b/i.test(rendered.trim());
      if (!startsWithPronoun && clauseIR.role === "ACTION") {
        rendered = `${plan.resolvedSubject} ${rendered}`;
      }
    }

    // 4. Apply Semantic-Preserving Anti-Repetition rotation
    rendered = antiRepetitionTracker.applyRotation(rendered);

    // 5. Normalization
    rendered = rendered.replace(/\s+/g, " ").trim();

    // 6. Build Provenance Trace
    const trace = createProvenanceTrace({
      clauseId: clauseIR.id,
      sourceZh: clauseIR.sourceZh,
      finalVi: rendered,
      contextSnapshot: context,
      discourseResolution: {
        status: clauseIR.uncertainty ? clauseIR.uncertainty.status : "RESOLVED",
        resolvedPronoun: plan.resolvedSubject,
        flag: clauseIR.uncertainty ? clauseIR.uncertainty.flag : null
      },
      stylistAudit: appliedRules,
      budgetAudit: {
        rejectedByBudget: plan.rejectedByBudget,
        rhythmPacing: plan.rhythmProfile.pacing
      }
    });

    return Object.freeze({
      text: rendered,
      plan,
      trace
    });
  }

  /**
   * Realizes an array of ClauseIRs into a coherent paragraph of Vietnamese text.
   * 
   * @param {Array<Object>} clauseIRs
   * @param {Object} context
   * @returns {{ text: string, traces: Array<Object> }}
   */
  function realizeParagraph(clauseIRs = [], context = {}) {
    const clauseResults = [];
    const traces = [];

    for (let i = 0; i < clauseIRs.length; i++) {
      const { text, trace } = realizeClause(clauseIRs[i], context);
      clauseResults.push(text);
      traces.push(trace);
    }

    // Join clauses into a natural paragraph
    let paragraph = clauseResults.join(", ");
    paragraph = capitalizeFirst(paragraph);

    // Ensure ending punctuation
    if (!/[.!?…”’"]$/.test(paragraph)) {
      paragraph += ".";
    }

    return Object.freeze({
      text: paragraph,
      traces: Object.freeze(traces)
    });
  }

  return Object.freeze({
    realizeClause,
    realizeParagraph,
    getPlanner: () => planner
  });
}

module.exports = {
  createVietnameseRealizer
};
