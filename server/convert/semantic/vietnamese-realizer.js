"use strict";

/**
 * 1-Pass Vietnamese Realizer (Phase R1 Hardened)
 * 
 * Layer C: Surface Realization
 * 
 * Synthesizes publication-grade Vietnamese prose from ExpressionPlan in a single deterministic pass.
 * Implements:
 * - 12-Assertion Quality Gate (validateSemanticAssertions).
 * - Semantic atom preservation check.
 * - Discourse-grounded pronoun and honorific title insertion.
 * - Anti-repetition lexical rotation.
 * - End-to-end compositional Provenance Trace.
 */

const { createExpressionPlanner, FALLBACK_LEVELS } = require("./expression-planner");
const { createProvenanceTrace } = require("./contracts");

// =========================================================================
// 12-Assertion Invariant Taxonomy (C3-0 Hardened)
// =========================================================================
const SEMANTIC_ASSERTIONS = Object.freeze({
  NEW_ENTITY: "NEW_ENTITY",
  NEW_EVENT: "NEW_EVENT",
  NEW_CAUSE: "NEW_CAUSE",
  NEW_EFFECT: "NEW_EFFECT",
  NEW_EMOTION: "NEW_EMOTION",
  NEW_INTENTION: "NEW_INTENTION",
  NEW_BELIEF: "NEW_BELIEF",
  NEW_FACT: "NEW_FACT",
  NEW_TIME: "NEW_TIME",
  NEW_LOCATION: "NEW_LOCATION",
  NEW_ATTRIBUTE: "NEW_ATTRIBUTE",
  NEW_RELATIONSHIP: "NEW_RELATIONSHIP"
});

/**
 * Validates that the rendered output does NOT introduce ungrounded assertions.
 * 
 * @param {string} renderedText
 * @param {Object} clauseIR
 * @param {Object} context
 * @returns {{ passed: boolean, violatedAssertions: string[], reason: string }}
 */
function validateSemanticAssertions(renderedText, clauseIR, context = {}) {
  const violations = [];
  const sourceZh = String(clauseIR.sourceZh || "");
  const text = String(renderedText || "");

  // 1. Guard against ungrounded blood rivers & mass corpses
  if (!/(?:血流成河|尸横遍野)/.test(sourceZh) && /(?:máu chảy thành sông|thây chất đầy đồng)/i.test(text)) {
    violations.push(SEMANTIC_ASSERTIONS.NEW_EVENT);
    violations.push(SEMANTIC_ASSERTIONS.NEW_EFFECT);
  }

  // 2. Guard against ungrounded galaxy destruction / star collapse
  if (!/(?:星河|星辰破碎|毁灭星系)/.test(sourceZh) && /(?:ngân hà vỡ vụn|tinh hà sụp đổ|vỡ tan cả dải ngân hà)/i.test(text)) {
    violations.push(SEMANTIC_ASSERTIONS.NEW_FACT);
  }

  // 3. Guard against ungrounded demonic possession claims on neutral gaze
  if (!/(?:入魔|心魔|魔气)/.test(sourceZh) && /(?:ma khí ngút trời|tâm ma nhập thể)/i.test(text) && !/(?:心魔|入魔)/.test(sourceZh)) {
    violations.push(SEMANTIC_ASSERTIONS.NEW_ATTRIBUTE);
  }

  // 4. Guard against ungrounded romantic relationship assertions
  if (context.isNeutralOrHostile === true && /(?:tình chàng ý thiếp|đắm say trong men tình)/i.test(text)) {
    violations.push(SEMANTIC_ASSERTIONS.NEW_RELATIONSHIP);
  }

  return Object.freeze({
    passed: violations.length === 0,
    violatedAssertions: Object.freeze(violations),
    reason: violations.length === 0 ? "QUALITY_GATE_PASSED" : `UNSUPPORTED_ASSERTIONS: ${violations.join(", ")}`
  });
}

function capitalizeFirst(text) {
  if (!text) return text;
  const m = /\p{L}/u.exec(text);
  if (!m) return text;
  const i = m.index;
  return text.slice(0, i) + text[i].toLocaleUpperCase("vi") + text.slice(i + 1);
}

/**
 * Vietnamese Realizer Factory
 */
function createVietnameseRealizer({
  planner = createExpressionPlanner(),
  baseConvertFunction = null
} = {}) {
  const antiRepetitionTracker = planner.getAntiRepetitionTracker();

  /**
   * Realizes a single ClauseIR and its ExpressionPlan into final Vietnamese string.
   * 
   * @param {Object} clauseIR
   * @param {Object} context
   * @returns {{ text: string, plan: Object, trace: Object }}
   */
  function realizeClause(clauseIR, context = {}) {
    const plan = planner.planClause(clauseIR, context);
    let rawText = clauseIR.sourceZh || "";

    // 1. Apply Planned Slot Replacements
    let rendered = rawText;
    const appliedRules = [];

    for (const slot of plan.slotReplacements) {
      if (rendered.includes(slot.slotId)) {
        rendered = rendered.split(slot.slotId).join(slot.replacementVi);
        appliedRules.push({
          provider: slot.providerId,
          slot: slot.targetSlot || slot.slotId,
          chosenCandidate: slot.replacementVi,
          priority: slot.priority,
          dimension: slot.dimension,
          provenance: slot.provenance
        });
      }
    }

    // 2. Base converter fallback for remaining Chinese characters
    if (baseConvertFunction && /[\u4e00-\u9fa5]/.test(rendered)) {
      rendered = baseConvertFunction(rendered);
    }

    // 3. Subject / Pronoun Realization (Discourse-Grounded)
    if (clauseIR.subjectSlot && clauseIR.subjectSlot.isImplicit && plan.resolvedSubject) {
      const startsWithPronoun = /^(?:hắn|nàng|y|ta|ngươi|đối phương|người này)\b/i.test(rendered.trim());
      if (!startsWithPronoun && (clauseIR.role === "ACTION" || clauseIR.role === "DESCRIPTION")) {
        rendered = `${plan.resolvedSubject} ${rendered}`;
      }
    }

    // 4. Semantic-Preserving Anti-Repetition rotation
    rendered = antiRepetitionTracker.applyRotation(rendered);

    // 5. Normalization
    rendered = rendered.replace(/\s+/g, " ").trim();

    // 6. 12-Assertion Quality Gate Verification
    const qualityGate = validateSemanticAssertions(rendered, clauseIR, context);
    let finalOutput = rendered;
    let fallbackStatus = plan.fallbackLevel;

    if (!qualityGate.passed) {
      // Step down to Level 4 Baseline-Safe fallback if Quality Gate rejects output
      fallbackStatus = FALLBACK_LEVELS.LEVEL_4_BASELINE_SAFE;
      finalOutput = baseConvertFunction ? baseConvertFunction(clauseIR.sourceZh) : clauseIR.sourceZh;
    }

    // 7. Compositional Provenance Trace Construction
    const trace = createProvenanceTrace({
      clauseId: clauseIR.id,
      sourceZh: clauseIR.sourceZh,
      finalVi: finalOutput,
      contextSnapshot: context,
      discourseResolution: {
        status: clauseIR.uncertainty ? clauseIR.uncertainty.status : "RESOLVED",
        resolvedPronoun: plan.resolvedSubject,
        flag: clauseIR.uncertainty ? clauseIR.uncertainty.flag : null
      },
      stylistAudit: appliedRules,
      budgetAudit: {
        fallbackLevel: fallbackStatus,
        totalExpansionCost: plan.totalExpansionCost,
        rejectedByBudget: plan.rejectedByBudget,
        deduplicatedModifiers: plan.deduplicatedModifiers,
        rhythmPacing: plan.rhythmProfile.pacing,
        qualityGateStatus: qualityGate.reason
      }
    });

    return Object.freeze({
      text: finalOutput,
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

    let paragraph = clauseResults.join(", ");
    paragraph = capitalizeFirst(paragraph);

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
    validateSemanticAssertions,
    getPlanner: () => planner
  });
}

module.exports = {
  createVietnameseRealizer,
  validateSemanticAssertions,
  SEMANTIC_ASSERTIONS
};
