"use strict";

/**
 * Inner Monologue & Psychological Refinement Contribution Provider (Phase 2B - Wave C2B-1)
 * Domain: MONOLOGUE_PSYCHOLOGY
 * 
 * Target Slot:
 * - INNER_MONOLOGUE (Internal thought stream, cognitive deliberation, inner state sensations)
 * 
 * Architecture Invariants:
 * - Semantic Authority: Activates only when ClauseIR.role === "INNER_THOUGHT" or "DESCRIPTION" (internal state).
 * - Zero Pronoun Injection: Never hardcodes external third-person pronouns (hắn, nàng, y, ta, ngươi).
 * - Emotion & Intensity Preservation: Preserves source affect distribution without unsolicited escalation.
 * - Semantic Assertion Boundary: Never invents ungrounded thoughts, intentions, or facts not present in source.
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const MONOLOGUE_CONTRIBUTION_DEFINITIONS = [
  // =========================================================================
  // 1. Redundant Thought Verbs & Cognitive Markers (EXPLICIT_THOUGHT)
  // =========================================================================
  {
    targetZh: "心中忍不住想",
    pattern: /心中忍不住想|心中不禁想到|心中不免想到/,
    targetSlot: STYLE_SLOTS.INNER_MONOLOGUE,
    candidateVi: "trong lòng không khỏi thầm nghĩ",
    thoughtCategory: "EXPLICIT_THOUGHT",
    signature: createSemanticSignature({
      denotation: "UNCONTROLLABLE_INNER_THOUGHT",
      affectDistribution: { TRANQUIL: 0.60, SOLEMN: 0.50 },
      valence: 0.50,
      intensity: 0.45,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "CONTEMPLATIVE",
    priority: 0.90,
    expansionCost: 0.0,
    introducedInformation: [],
    requiredRoles: ["INNER_THOUGHT"]
  },
  {
    targetZh: "心中暗自思量",
    pattern: /心中暗自思量|暗自思忖|暗自盘算|暗中思量/,
    targetSlot: STYLE_SLOTS.INNER_MONOLOGUE,
    candidateVi: "trong lòng thầm tính toán",
    thoughtCategory: "EXPLICIT_THOUGHT",
    signature: createSemanticSignature({
      denotation: "SECRET_CALCULATION_THOUGHT",
      affectDistribution: { RESOLUTE: 0.70, SOLEMN: 0.60 },
      valence: 0.50,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "CALCULATING",
    priority: 0.90,
    expansionCost: 0.0,
    introducedInformation: [],
    requiredRoles: ["INNER_THOUGHT"]
  },
  {
    targetZh: "心中暗道",
    pattern: /心中暗道|心中暗想|暗暗想到/,
    targetSlot: STYLE_SLOTS.INNER_MONOLOGUE,
    candidateVi: "trong lòng thầm nghĩ",
    thoughtCategory: "EXPLICIT_THOUGHT",
    signature: createSemanticSignature({
      denotation: "INTERNAL_MUSING_MARKER",
      affectDistribution: { TRANQUIL: 0.60, SOLEMN: 0.50 },
      valence: 0.50,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "CONTEMPLATIVE",
    priority: 0.90,
    expansionCost: 0.0,
    introducedInformation: [],
    requiredRoles: ["INNER_THOUGHT"]
  },
  {
    targetZh: "心中又想",
    pattern: /心中又想|心中复想|又暗自思索/,
    targetSlot: STYLE_SLOTS.INNER_MONOLOGUE,
    candidateVi: "trong lòng lại nghĩ",
    thoughtCategory: "EXPLICIT_THOUGHT",
    signature: createSemanticSignature({
      denotation: "CONTINUOUS_INTERNAL_THOUGHT",
      affectDistribution: { TRANQUIL: 0.60 },
      valence: 0.50,
      intensity: 0.35,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "CONTEMPLATIVE",
    priority: 0.85,
    expansionCost: 0.0,
    introducedInformation: [],
    requiredRoles: ["INNER_THOUGHT"]
  },
  {
    targetZh: "忍不住想到",
    pattern: /(?<!心中)忍不住想到|不禁想起|不由想起/,
    targetSlot: STYLE_SLOTS.INNER_MONOLOGUE,
    candidateVi: "chợt nhớ tới",
    thoughtCategory: "RECOLLECTION_TRIGGER",
    signature: createSemanticSignature({
      denotation: "SUDDEN_RECOLLECTION",
      affectDistribution: { TRANQUIL: 0.60 },
      valence: 0.50,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "EVOCATIVE",
    priority: 0.85,
    expansionCost: 0.0,
    introducedInformation: [],
    requiredRoles: ["INNER_THOUGHT", "DESCRIPTION"]
  },
  {
    targetZh: "脑海中闪过一个念头",
    pattern: /脑海中闪过一个念头|脑海中闪过一道念头|心中闪过一个念头/,
    targetSlot: STYLE_SLOTS.INNER_MONOLOGUE,
    candidateVi: "trong đầu chợt lóe lên một ý nghĩ",
    thoughtCategory: "COGNITIVE_SPARK",
    signature: createSemanticSignature({
      denotation: "COGNITIVE_INSIGHT_FLASH",
      affectDistribution: { ELEVATED: 0.70, SOLEMN: 0.60 },
      valence: 0.50,
      intensity: 0.55,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "ALERT",
    priority: 0.90,
    expansionCost: 0.0,
    introducedInformation: [],
    requiredRoles: ["INNER_THOUGHT", "DESCRIPTION"]
  },
  {
    targetZh: "脑海中浮现出一个念头",
    pattern: /脑海中浮现出一个念头|脑海中浮现出一道念头/,
    targetSlot: STYLE_SLOTS.INNER_MONOLOGUE,
    candidateVi: "trong đầu chợt hiện lên một ý nghĩ",
    thoughtCategory: "COGNITIVE_EMERGENCE",
    signature: createSemanticSignature({
      denotation: "COGNITIVE_EMERGENCE",
      affectDistribution: { TRANQUIL: 0.65, SOLEMN: 0.60 },
      valence: 0.50,
      intensity: 0.45,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "CONTEMPLATIVE",
    priority: 0.90,
    expansionCost: 0.0,
    introducedInformation: [],
    requiredRoles: ["INNER_THOUGHT", "DESCRIPTION"]
  },

  // =========================================================================
  // 2. Emotional Sensations & Psychological Intuitions (INNER_STATE)
  // =========================================================================
  {
    targetZh: "心中升起一股疑惑",
    pattern: /心中升起一股疑惑|心中泛起一阵疑惑|心头泛起疑惑/,
    targetSlot: STYLE_SLOTS.INNER_MONOLOGUE,
    candidateVi: "trong lòng dấy lên từng đợt nghi hoặc",
    thoughtCategory: "INNER_STATE_AFFECT",
    signature: createSemanticSignature({
      denotation: "RISING_SUSPICION_STATE",
      affectDistribution: { SOLEMN: 0.70 },
      valence: 0.40,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "SUSPICIOUS",
    priority: 0.90,
    expansionCost: 0.0,
    introducedInformation: [],
    requiredRoles: ["INNER_THOUGHT", "DESCRIPTION"]
  },
  {
    targetZh: "心中掀起一阵波澜",
    pattern: /心中掀起一阵波澜|心中掀起滔天骇浪|心头掀起狂澜/,
    targetSlot: STYLE_SLOTS.INNER_MONOLOGUE,
    candidateVi: "trong lòng dấy lên từng cơn sóng gió",
    thoughtCategory: "INNER_STATE_AFFECT",
    signature: createSemanticSignature({
      denotation: "INTERNAL_EMOTIONAL_TURMOIL",
      affectDistribution: { SOLEMN: 0.85, ELEVATED: 0.70 },
      valence: 0.40,
      intensity: 0.65,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "SHOCKED",
    priority: 0.90,
    expansionCost: 0.0,
    introducedInformation: [],
    requiredRoles: ["INNER_THOUGHT", "DESCRIPTION"]
  },
  {
    targetZh: "心中生出一丝忌惮",
    pattern: /心中生出一丝忌惮|心生忌惮|心头生出一丝忌惮/,
    targetSlot: STYLE_SLOTS.INNER_MONOLOGUE,
    candidateVi: "trong lòng dâng lên một tia kiêng dè",
    thoughtCategory: "INNER_STATE_AFFECT",
    signature: createSemanticSignature({
      denotation: "APPREHENSIVE_CAUTION_STATE",
      affectDistribution: { SOLEMN: 0.80 },
      valence: 0.35,
      intensity: 0.55,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "WARY",
    priority: 0.90,
    expansionCost: 0.0,
    introducedInformation: [],
    requiredRoles: ["INNER_THOUGHT", "DESCRIPTION"]
  },
  {
    targetZh: "心中升起一股寒意",
    pattern: /心中升起一股寒意|心中生出一股寒意|心头升起寒意/,
    targetSlot: STYLE_SLOTS.INNER_MONOLOGUE,
    candidateVi: "trong lòng dâng lên một luồng ớn lạnh",
    thoughtCategory: "INNER_STATE_AFFECT",
    signature: createSemanticSignature({
      denotation: "PSYCHOLOGICAL_CHILL_DREAD",
      affectDistribution: { SOLEMN: 0.85 },
      valence: 0.25,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "DREAD",
    priority: 0.90,
    expansionCost: 0.0,
    introducedInformation: [],
    requiredRoles: ["INNER_THOUGHT", "DESCRIPTION"]
  },
  {
    targetZh: "心中有些说不出",
    pattern: /心中有些说不出|心中有些说不出的滋味|心中难言/,
    targetSlot: STYLE_SLOTS.INNER_MONOLOGUE,
    candidateVi: "trong lòng có cảm giác khó tả",
    thoughtCategory: "INNER_STATE_AFFECT",
    signature: createSemanticSignature({
      denotation: "INEXPRESSIBLE_COMPLEX_FEELING",
      affectDistribution: { TRANQUIL: 0.65, SOLEMN: 0.60 },
      valence: 0.50,
      intensity: 0.35,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "MELANCHOLY",
    priority: 0.85,
    expansionCost: 0.0,
    introducedInformation: [],
    requiredRoles: ["INNER_THOUGHT", "DESCRIPTION"]
  },

  // =========================================================================
  // 3. Decision Triggers (DECISION_TRIGGER - Zero Hardcoded Pronouns)
  // =========================================================================
  {
    targetZh: "想到这里，眼中闪过精光",
    pattern: /想到这里[，, ]?眼中闪过(?:一道|一丝)?精光|念及此处[，, ]?眼中闪过精芒/,
    targetSlot: STYLE_SLOTS.INNER_MONOLOGUE,
    candidateVi: "nghĩ đến đây, trong mắt lóe lên tia sáng sắc lạnh",
    thoughtCategory: "DECISION_TRIGGER",
    signature: createSemanticSignature({
      denotation: "RESOLUTE_DECISION_SPARK",
      affectDistribution: { RESOLUTE: 0.85, SOLEMN: 0.80 },
      valence: 0.50,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "RESOLUTE",
    priority: 0.95,
    expansionCost: 0.0,
    introducedInformation: [],
    requiredRoles: ["INNER_THOUGHT", "ACTION", "DESCRIPTION"]
  }
];

function createMonologueProvider() {
  return Object.freeze({
    providerId: "monologue-provider",
    domain: "MONOLOGUE_PSYCHOLOGY",
    supportedSlots: [STYLE_SLOTS.INNER_MONOLOGUE],

    /**
     * Inspects a ClauseIR and produces StylistContributions.
     * 
     * @param {Object} clauseIR
     * @param {Object} [context]
     * @returns {Array<Object>} StylistContribution[]
     */
    contribute(clauseIR, context = {}) {
      if (!clauseIR || !clauseIR.sourceZh) return [];

      const textRole = clauseIR.role || "NARRATION";
      const sourceZh = clauseIR.sourceZh;
      const contributions = [];

      for (const def of MONOLOGUE_CONTRIBUTION_DEFINITIONS) {
        if (def.pattern.test(sourceZh)) {
          // Strictly verify allowed text roles
          if (def.requiredRoles && !def.requiredRoles.includes(textRole)) {
            continue;
          }

          contributions.push(
            createStylistContribution({
              providerId: "monologue-provider",
              domain: "MONOLOGUE_PSYCHOLOGY",
              targetSlot: def.targetSlot,
              dimension: "PSYCHOLOGICAL",
              sourceSpanZh: def.targetZh,
              candidateVi: def.candidateVi,
              semanticRequirements: {
                thoughtCategory: def.thoughtCategory,
                requiredRoles: def.requiredRoles
              },
              semanticSignature: def.signature,
              tone: def.tone,
              register: def.signature.register,
              rhythmPreference: "FLOWING_BALANCED",
              lexicalPriority: def.priority,
              confidence: 0.95,
              semanticExpansionCost: def.expansionCost,
              introducedInformation: def.introducedInformation,
              introducedMetaphor: false,
              surfaceRealization: true,
              provenance: `monologue-provider:${def.targetZh}->${def.targetSlot}:${def.thoughtCategory}`
            })
          );
        }
      }

      return contributions;
    },

    /**
     * Standard provider getSuggestions interface.
     */
    getSuggestions(clauseIR, context = {}) {
      const contribs = this.contribute(clauseIR, context);
      const domainWeight = (context && context.domainWeights && context.domainWeights.MONOLOGUE_PSYCHOLOGY) || 0.80;
      return Object.freeze({
        providerId: "monologue-provider",
        domain: "MONOLOGUE_PSYCHOLOGY",
        confidence: domainWeight,
        contributions: Object.freeze(contribs),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createMonologueProvider,
  MONOLOGUE_CONTRIBUTION_DEFINITIONS
};
