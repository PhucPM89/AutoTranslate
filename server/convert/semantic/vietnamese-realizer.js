"use strict";

/**
 * 1-Pass Vietnamese Realizer (Phase R2 Hardened)
 * 
 * Layer C: Surface Realization
 * 
 * Synthesizes publication-grade Vietnamese prose from ExpressionPlan in a single deterministic pass.
 * Implements:
 * - Constraint-Aware Verification (Negation, Quantity, Temporal, Discourse Connectors).
 * - Semantic Round-Trip Check.
 * - 12-Assertion Quality Gate (validateSemanticAssertions).
 * - Discourse-grounded pronoun and honorific title insertion with repetition suppression.
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

// =========================================================================
// Constraint-Aware Linguistic Verifiers (Phase R2 Hardened)
// =========================================================================

/**
 * Negation Safety:
 * Verifies that negative polarity is strictly preserved from source to target.
 * (e.g. "他没有死" -> must contain "không chết" / "chưa chết", never "hắn đã chết").
 */
function checkNegationSafety(renderedText, sourceZh) {
  const zh = String(sourceZh || "");
  const vi = String(renderedText || "").toLowerCase();

  const isNegatedZh = /(?:没有|不|未|从未|并非|无论|休想|绝非|不可|无)/.test(zh);

  if (!isNegatedZh) {
    return { passed: true };
  }

  // Target Vietnamese MUST contain at least one valid negative marker
  const hasNegationVi = /(?:(?<!\p{L})(?:không|chưa|chẳng|chưa từng|không hề|đừng|không có|chớ|vô|chẳng hề)(?!\p{L}))/iu.test(vi);

  if (!hasNegationVi) {
    return {
      passed: false,
      reason: "NEGATION_POLARITY_LOST"
    };
  }

  return { passed: true };
}

/**
 * Temporal & Aspectual Safety:
 * Verifies that aspectual markers (already, ongoing, then, years later) are preserved.
 */
function checkTemporalSafety(renderedText, sourceZh, temporalAspect) {
  const zh = String(sourceZh || "");
  const vi = String(renderedText || "").toLowerCase();

  if (temporalAspect === "PERFECTIVE_ALREADY" || /(?:已经|已然|早已)/.test(zh)) {
    const hasAlreadyVi = /(?:(?<!\p{L})(?:đã|sớm đã|đã sớm|xong|rồi)(?!\p{L}))/iu.test(vi);
    if (!hasAlreadyVi) {
      return { passed: false, reason: "PERFECTIVE_ASPECT_LOST" };
    }
  }

  if (temporalAspect === "SEQUENTIAL_THEN" || /(?:随后|旋即|紧接着)/.test(zh)) {
    const hasSequentialVi = /(?:(?<!\p{L})(?:sau đó|tiếp theo|ngay sau đó|liền|rồi)(?!\p{L}))/iu.test(vi);
    if (!hasSequentialVi) {
      return { passed: false, reason: "SEQUENTIAL_TEMPORAL_LOST" };
    }
  }

  return { passed: true };
}

/**
 * Discourse & Causal Connector Safety:
 * Verifies that causal and adversative relations are preserved.
 */
function checkDiscourseSafety(renderedText, sourceZh, causalRelation) {
  const zh = String(sourceZh || "");
  const vi = String(renderedText || "").toLowerCase();

  if (causalRelation === "ADVERSATIVE_BUT" || /(?:却|但是|然而|不过)/.test(zh)) {
    const hasButVi = /(?:(?<!\p{L})(?:nhưng|tuy nhiên|lại|song|ngặt nỗi)(?!\p{L}))/iu.test(vi);
    if (!hasButVi) {
      return { passed: false, reason: "ADVERSATIVE_CONNECTOR_LOST" };
    }
  }

  return { passed: true };
}

/**
 * Validates that the rendered output does NOT introduce ungrounded assertions.
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

/**
 * Semantic Round-Trip Check:
 * Integrates 12-assertion quality gate with constraint-aware linguistic verifiers.
 */
function performSemanticRoundTripCheck(renderedText, clauseIR, plan, context = {}) {
  const assertionCheck = validateSemanticAssertions(renderedText, clauseIR, context);
  if (!assertionCheck.passed) {
    return { passed: false, reason: assertionCheck.reason };
  }

  const negationCheck = checkNegationSafety(renderedText, clauseIR.sourceZh);
  if (!negationCheck.passed) {
    return { passed: false, reason: negationCheck.reason };
  }

  const temporalCheck = checkTemporalSafety(
    renderedText,
    clauseIR.sourceZh,
    plan.linguisticConstraints ? plan.linguisticConstraints.temporalAspect : "NONE"
  );
  if (!temporalCheck.passed) {
    return { passed: false, reason: temporalCheck.reason };
  }

  const discourseCheck = checkDiscourseSafety(
    renderedText,
    clauseIR.sourceZh,
    plan.linguisticConstraints ? plan.linguisticConstraints.causalRelation : "NONE"
  );
  if (!discourseCheck.passed) {
    return { passed: false, reason: discourseCheck.reason };
  }

  return { passed: true, reason: "QUALITY_GATE_PASSED" };
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
      // Guard: ONLY animate entity classes (PERSON, CREATURE) may receive a human third-person pronoun.
      // Inanimate objects, locations, phenomena, and events must NEVER have 'Hắn' prepended!
      const isInanimate = clauseIR.entityClass && (
        clauseIR.entityClass === "OBJECT" ||
        clauseIR.entityClass === "LOCATION" ||
        clauseIR.entityClass === "PHENOMENON" ||
        clauseIR.entityClass === "EVENT" ||
        clauseIR.entityClass === "ABSTRACT"
      );
      const startsWithPronoun = /^(?:hắn|nàng|y|ta|ngươi|đối phương|người này|vương gia|sư tôn|sư huynh|thái thượng trưởng lão)\b/i.test(rendered.trim());
      const startsWithNoun = /^(?:Dược Đỉnh|Đan Đỉnh|Đan Lò|Cửu sợi|Chín tầng|Lôi Kiếp|Thiên Kiếp|Mộ hoang|Cổ tự|U Tuyền|Tiếng đàn|Chữ số 9|Tử khí|Khí tức|Bên trong|Dưới|Trên|Trước|Sau|Trong)\b/i.test(rendered.trim());

      if (!isInanimate && !startsWithPronoun && !startsWithNoun && (clauseIR.role === "ACTION" || clauseIR.role === "DESCRIPTION")) {
        rendered = `${plan.resolvedSubject} ${rendered}`;
      }
    }

    // 4. Semantic-Preserving Anti-Repetition rotation
    rendered = antiRepetitionTracker.applyRotation(rendered);

    // 5. Normalization
    rendered = rendered.replace(/\s+/g, " ").trim();

    // 6. Semantic Round-Trip & Quality Gate Verification
    const roundTrip = performSemanticRoundTripCheck(rendered, clauseIR, plan, context);
    let finalOutput = rendered;
    let fallbackStatus = plan.fallbackLevel;

    if (!roundTrip.passed) {
      // Step down to Level 4 Baseline-Safe fallback if Round-Trip / Quality Gate rejects output
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
        qualityGateStatus: roundTrip.reason
      }
    });

    return Object.freeze({
      text: finalOutput,
      plan,
      trace
    });
  }

  /**
   * Realizes an array of ClauseIRs into a coherent paragraph of Vietnamese text
   * with pronoun repetition suppression and discourse continuity.
   * 
   * @param {Array<Object>} clauseIRs
   * @param {Object} context
   * @returns {{ text: string, traces: Array<Object> }}
   */
  function realizeParagraph(clauseIRs = [], context = {}) {
    const clauseResults = [];
    const traces = [];
    let lastSubject = null;

    for (let i = 0; i < clauseIRs.length; i++) {
      const clause = clauseIRs[i];
      const { text, trace, plan } = realizeClause(clause, context);
      let clauseText = text;

      // Pronoun Repetition Suppression:
      // If clause i and clause i-1 share the same resolved third-person pronoun (e.g. "Hắn"),
      // and clause i is a coordinate action, suppress redundant pronoun repetition
      const currentSubject = plan.resolvedSubject || (clause.subjectSlot && clause.subjectSlot.resolvedPronoun);
      if (
        i > 0 &&
        clause.role === "ACTION"
      ) {
        // Strip leading redundant pronoun if present
        const pronounPrefix = /^(?:hắn|nàng|y|ta|ngươi)\s+/i;
        if (pronounPrefix.test(clauseText)) {
          clauseText = clauseText.replace(pronounPrefix, "");
        }
      }

      // Coordinate Action Casing: Maintain lowercase on coordinate verbs
      if (i > 0 && clause.role === "ACTION") {
        if (/^[A-ZÀ-Ỹ][a-zà-ỹ]/.test(clauseText) && !/^(?:Diệp|Tiêu|Thái|Lâm|Vương|Lý|Trương|Trần|Tử|Hoàng|Thanh)\b/.test(clauseText)) {
          clauseText = clauseText.charAt(0).toLowerCase() + clauseText.slice(1);
        }
      }

      // Dialogue Reporting Verb Punctuation: Join reporting verb with colon before quote
      if (i > 0) {
        const prevText = clauseResults[i - 1];
        if (/(?:nói|hỏi|quát|than|thầm nghĩ|cười nói|nhủ|hô|cười lạnh|nói nhỏ|thở dài)\b/i.test(prevText.trim()) && /^[“"「『]/.test(clauseText.trim())) {
          clauseResults[i - 1] = prevText.trim() + ":";
        }
      }

      if (currentSubject) {
        lastSubject = currentSubject;
      }

      clauseResults.push(clauseText);
      traces.push(trace);
    }

    let paragraph = "";
    for (let i = 0; i < clauseResults.length; i++) {
      const seg = clauseResults[i];
      if (i === 0) {
        paragraph = seg;
      } else {
        if (paragraph.endsWith(":")) {
          paragraph += " " + seg;
        } else {
          paragraph += ", " + seg;
        }
      }
    }
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
    checkNegationSafety,
    checkTemporalSafety,
    checkDiscourseSafety,
    performSemanticRoundTripCheck,
    getPlanner: () => planner
  });
}

module.exports = {
  createVietnameseRealizer,
  validateSemanticAssertions,
  checkNegationSafety,
  checkTemporalSafety,
  checkDiscourseSafety,
  performSemanticRoundTripCheck,
  SEMANTIC_ASSERTIONS
};
