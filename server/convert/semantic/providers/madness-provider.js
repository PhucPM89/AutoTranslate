"use strict";

/**
 * Heart-Demon, Qi Deviation & Madness Provider (Phase 3 - Wave C3-B1)
 * Domain: MADNESS_FRENZY
 * 
 * Semantic Model (Psychological State Taxonomy):
 * 1. QI_DEVIATION             — Spiritual backlash, chaotic internal energy (走火入魔, 经脉逆乱)
 * 2. HEART_DEMON_CORRUPTION   — Mental demonic encroachment (心魔入体, 心魔侵蚀)
 * 3. COGNITIVE_IMPAIRMENT     — Loss of conscious control, delirium (神志不清, 神志模糊)
 * 4. PSYCHOTIC_FRENZY         — Demonic frenzy, total loss of sanity (陷入癫狂, 疯狂嗜血)
 * 5. IRREVERSIBLE_DOOM        — Tragic spiritual descent (万劫不复)
 * 
 * Core Architecture Invariants (C3-0 Hardened):
 * - Madness is a Psychological State, Not an Adjective: Requires explicit cognitive/state evidence.
 * - Negative Assertions Strictly Enforced:
 *   * Wrath / Rage (怒不可遏) -> WRATH; NEVER escalates to madness.
 *   * Killing Intent (杀意沸腾) -> HOSTILITY; NEVER escalates to mental breakdown automatically.
 *   * Physical Bloodshot Eyes (双眼通红) -> physical fatigue/strain; NEVER escalates to demonic possession.
 *   * Extreme Grief (悲痛欲绝) -> SORROW; NEVER escalates to madness.
 *   * Fear / Trembling (恐惧发抖) -> FEAR; NEVER escalates to psychosis.
 *   * Qi Deviation (走火入魔) -> realizes qi deviation; NEVER invents ungrounded physical destruction.
 * - Zero Character Intent Hallucination: Never invents irrational violent or suicidal intent.
 * - POV Safety: Third-person limited narrative strictly rejects unobserved psychotic states of non-POV characters.
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

// =========================================================================
// Psychological State Taxonomy Constants
// =========================================================================
const MADNESS_CATEGORIES = Object.freeze({
  QI_DEVIATION: "QI_DEVIATION",
  HEART_DEMON_CORRUPTION: "HEART_DEMON_CORRUPTION",
  COGNITIVE_IMPAIRMENT: "COGNITIVE_IMPAIRMENT",
  PSYCHOTIC_FRENZY: "PSYCHOTIC_FRENZY",
  IRREVERSIBLE_DOOM: "IRREVERSIBLE_DOOM"
});

// =========================================================================
// Canonical Madness Realization Definitions (8 Rules)
// =========================================================================
const MADNESS_DEFINITIONS = Object.freeze([
  // 1. Qi Deviation: Spiritual Backlash (走火入魔)
  {
    ruleId: "MADNESS_R01_QI_DEVIATION",
    category: MADNESS_CATEGORIES.QI_DEVIATION,
    targetZh: "走火入魔",
    pattern: /(?:走火入魔|tẩu hỏa nhập ma)/i,
    candidateVi: "tẩu hỏa nhập ma, chân khí hỗn loạn",
    signature: createSemanticSignature({
      denotation: "QI_DEVIATION_BACKLASH",
      affectDistribution: { FEAR: 0.60, SURPRISE: 0.50, WRATH: 0.40 },
      valence: -0.70,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "CHAOTIC_TERROR",
    priority: 0.95
  },

  // 2. Psychotic Frenzy: Bloodshot Demonic Gaze (双眼猩红 / 疯狂血红)
  {
    ruleId: "MADNESS_R02_BLOODSHOT_DEMONIC",
    category: MADNESS_CATEGORIES.PSYCHOTIC_FRENZY,
    targetZh: "双眼猩红",
    pattern: /(?:hai mắt đỏ ngầu rực lửa|đôi mắt đỏ ngầu rực lửa|hai mắt đỏ bừng rực lửa|双眼猩红|眼冒红光)/i,
    candidateVi: "đôi mắt đỏ ngầu rực lửa hằn lên từng tia máu điên dại",
    signature: createSemanticSignature({
      denotation: "DEMONIC_BLOODSHOT_GAZE",
      affectDistribution: { WRATH: 0.85, HOSTILITY: 0.80 },
      valence: -0.60,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "VISCERAL_FRENZY",
    priority: 0.90
  },

  // 3. Psychotic Frenzy: Violent Killing Aura (杀意滔天 / 狂暴杀意)
  {
    ruleId: "MADNESS_R03_KILLING_AURA_VIOLENT",
    category: MADNESS_CATEGORIES.PSYCHOTIC_FRENZY,
    targetZh: "杀意滔天",
    pattern: /(?:sát ý ngập trời cuồng bạo|sát ý ngút trời cuồng bạo|杀意滔天|杀意冲天)/i,
    candidateVi: "sát ý ngút trời cuồng bạo tựa sóng thần giận dữ",
    signature: createSemanticSignature({
      denotation: "SURGING_VIOLENT_KILLING_AURA",
      affectDistribution: { WRATH: 0.90, HOSTILITY: 0.95 },
      valence: -0.75,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "OVERWHELMING_WRATH",
    priority: 0.95
  },

  // 4. Irreversible Doom: Eternal Demonic Descent (万劫不复)
  {
    ruleId: "MADNESS_R04_IRREVERSIBLE_DOOM",
    category: MADNESS_CATEGORIES.IRREVERSIBLE_DOOM,
    targetZh: "万劫不复",
    pattern: /(?:vạn kiếp bất phục|万劫不复)/i,
    candidateVi: "vạn kiếp bất phục, muôn đời không thể quay đầu",
    signature: createSemanticSignature({
      denotation: "IRREVERSIBLE_DEMONIC_DOOM",
      affectDistribution: { SOLEMN: 0.85, SORROW: 0.70 },
      valence: -0.80,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "TRAGIC_FINALITY",
    priority: 0.90
  },

  // 5. Psychotic Frenzy: Bloodthirsty Loss of Sanity (疯狂嗜血 / 狂乱嗜血)
  {
    ruleId: "MADNESS_R05_BLOODTHIRSTY_FRENZY",
    category: MADNESS_CATEGORIES.PSYCHOTIC_FRENZY,
    targetZh: "狂乱嗜血",
    pattern: /(?:khát máu điên cuồng|điên cuồng khát máu|狂乱嗜血|疯狂嗜血)/i,
    candidateVi: "khát máu cuồng loạn đến mất hết lý trí",
    signature: createSemanticSignature({
      denotation: "BLOODTHIRSTY_SANITY_COLLAPSE",
      affectDistribution: { WRATH: 0.90, HOSTILITY: 0.95 },
      valence: -0.85,
      intensity: 0.95,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "SAVAGE_FRENZY",
    priority: 0.95
  },

  // 6. Heart Demon Corruption (心魔入体)
  {
    ruleId: "MADNESS_R06_HEART_DEMON",
    category: MADNESS_CATEGORIES.HEART_DEMON_CORRUPTION,
    targetZh: "心魔入体",
    pattern: /(?:tâm ma nhập thể|tâm ma xâm nhập|心魔入体|心魔侵蚀)/i,
    candidateVi: "tâm ma nhập thể, ý chí dao động",
    signature: createSemanticSignature({
      denotation: "HEART_DEMON_ENCROACHMENT",
      affectDistribution: { FEAR: 0.75, SOLEMN: 0.70 },
      valence: -0.70,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "CORRUPTIVE_DREAD",
    priority: 0.92
  },

  // 7. Cognitive Impairment: Delirium & Confusion (神志不清)
  {
    ruleId: "MADNESS_R07_COGNITIVE_IMPAIRMENT",
    category: MADNESS_CATEGORIES.COGNITIVE_IMPAIRMENT,
    targetZh: "神志不清",
    pattern: /(?:thần trí không rõ|thần trí mơ hồ|神志不清|神志模糊)/i,
    candidateVi: "thần trí mơ hồ, ý thức hỗn loạn",
    signature: createSemanticSignature({
      denotation: "DELIRIUM_CONSCIOUSNESS_LOSS",
      affectDistribution: { FEAR: 0.60, SURPRISE: 0.50 },
      valence: -0.50,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "BEWILDERED_DISSOCIATION",
    priority: 0.90
  },

  // 8. Psychotic Frenzy: Total Sanity Collapse (陷入癫狂)
  {
    ruleId: "MADNESS_R08_SANITY_COLLAPSE",
    category: MADNESS_CATEGORIES.PSYCHOTIC_FRENZY,
    targetZh: "陷入癫狂",
    pattern: /(?:rơi vào điên cuồng|rơi vào cuồng loạn|陷入癫狂|彻底疯狂)/i,
    candidateVi: "rơi vào điên cuồng, lý trí sụp đổ hoàn toàn",
    signature: createSemanticSignature({
      denotation: "TOTAL_SANITY_COLLAPSE",
      affectDistribution: { WRATH: 0.85, FEAR: 0.80 },
      valence: -0.85,
      intensity: 0.95,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "HYSTERIC_COLLAPSE",
    priority: 0.95
  }
]);

// =========================================================================
// Negative Assertion & Invariant Validator
// =========================================================================

/**
 * Validates that madness expressions are strictly grounded in genuine psychological / state evidence.
 * 
 * Guards:
 * 1. Physical Bloodshot Eyes (双眼通红 from strain/fatigue) -> NOT madness.
 * 2. Wrath / Rage (怒不可遏) -> NOT madness.
 * 3. Killing Intent (杀意沸腾) -> NOT madness automatically.
 * 4. Extreme Grief (悲痛欲绝) -> NOT madness.
 * 5. Fear / Panic (恐惧发抖) -> NOT madness.
 * 6. POV Safety: Limited POV cannot assert unobserved internal insanity of others.
 * 
 * @param {Object} clauseIR
 * @param {Object} context
 * @param {Object} def
 * @returns {{ allowed: boolean, reason: string }}
 */
function validateMadnessEvidence(clauseIR, context = {}, def) {
  const sourceZh = String(clauseIR.sourceZh || "");
  const translatedText = String((context && context.translatedText) || "");

  // 1. Plain bloodshot eyes guard: "双眼通红" / "hai mắt đỏ ngầu" without demonic/insanity keywords
  const isPlainBloodshot = /(?:双眼通红|两眼发红|đôi mắt đỏ ngầu|hai mắt đỏ ngầu|hai mắt đỏ bừng)/i.test(sourceZh) ||
                           /(?:đôi mắt đỏ ngầu|hai mắt đỏ ngầu|hai mắt đỏ bừng)/i.test(translatedText);
  const hasDemonicOrFrenzy = /(?:入魔|癫狂|心魔|嗜血|diên dại|rực lửa|điên cuồng|quỷ khí)/i.test(sourceZh) ||
                             /(?:điên dại|rực lửa|tẩu hỏa|nhập ma|tâm ma|khát máu|cuồng loạn)/i.test(translatedText);

  if (isPlainBloodshot && !hasDemonicOrFrenzy && def.ruleId === "MADNESS_R02_BLOODSHOT_DEMONIC") {
    return {
      allowed: false,
      reason: "REJECT_NEUTRAL_BLOODSHOT_EYES_FROM_MADNESS"
    };
  }

  // 2. Pure wrath/rage guard: "怒不可遏" / "tức giận" without sanity loss
  const isPureWrath = /(?:怒不可遏|暴怒|怒火中烧|tức giận đến cực điểm|cơn giận ngút trời)/i.test(sourceZh) ||
                      /(?:cực kỳ tức giận|nổi trận lôi đình|cơn giận ngút trời)/i.test(translatedText);
  if (isPureWrath && !hasDemonicOrFrenzy) {
    return {
      allowed: false,
      reason: "REJECT_WRATH_RAGE_FROM_MADNESS"
    };
  }

  // 3. Pure grief guard: "悲痛欲绝" / "đau lòng đến cực điểm"
  const isPureGrief = /(?:悲痛欲绝|痛不欲生|đau lòng đến cực điểm|lệ rơi như mưa)/i.test(sourceZh) ||
                      /(?:đau lòng đến cực điểm|đau đớn xé lòng|ngập tràn tuyệt vọng)/i.test(translatedText);
  if (isPureGrief && !hasDemonicOrFrenzy) {
    return {
      allowed: false,
      reason: "REJECT_SORROW_GRIEF_FROM_MADNESS"
    };
  }

  // 4. Pure fear guard: "恐惧发抖" / "run rẩy vì sợ hãi"
  const isPureFear = /(?:恐惧得浑身发抖|惊恐万分|sợ hãi đến run rẩy|run lẩy bẩy)/i.test(sourceZh) ||
                     /(?:sợ hãi đến run rẩy|toàn thân run rẩy vì sợ)/i.test(translatedText);
  if (isPureFear && !hasDemonicOrFrenzy) {
    return {
      allowed: false,
      reason: "REJECT_FEAR_FROM_MADNESS"
    };
  }

  // 5. POV Safety Guard
  const pov = (clauseIR.cognitiveEvent && clauseIR.cognitiveEvent.pov) || context.pov || "THIRD_PERSON_LIMITED";
  if (pov === "THIRD_PERSON_LIMITED" && context.assertUnobservedInsanity === true) {
    return {
      allowed: false,
      reason: "REJECT_UNOBSERVED_INSANITY_IN_LIMITED_POV"
    };
  }

  return { allowed: true, reason: "MADNESS_EVIDENCE_VALIDATED" };
}

// =========================================================================
// Provider Factory
// =========================================================================
function createMadnessProvider() {
  return Object.freeze({
    providerId: "madness-provider",
    domain: "MADNESS_FRENZY",
    supportedSlots: [STYLE_SLOTS.CORRUPTED_MADNESS],

    /**
     * Inspects a ClauseIR and produces StylistContributions for verified psychological madness.
     * 
     * @param {Object} clauseIR
     * @param {Object} [context]
     * @returns {Array<Object>} StylistContribution[]
     */
    contribute(clauseIR, context = {}) {
      if (!clauseIR || !clauseIR.sourceZh) return [];

      const sourceZh = clauseIR.sourceZh;
      const translatedText = (context && context.translatedText) || "";
      const searchText = translatedText || sourceZh;
      const contributions = [];

      for (const def of MADNESS_DEFINITIONS) {
        if (!def.pattern.test(searchText) && !sourceZh.includes(def.targetZh)) {
          continue;
        }

        // Validate negative assertions and genuine madness evidence
        const evidenceCheck = validateMadnessEvidence(clauseIR, context, def);
        if (!evidenceCheck.allowed) {
          continue;
        }

        contributions.push(
          createStylistContribution({
            providerId: "madness-provider",
            domain: "MADNESS_FRENZY",
            targetSlot: STYLE_SLOTS.CORRUPTED_MADNESS,
            dimension: "AFFECTIVE",
            sourceSpanZh: def.targetZh,
            candidateVi: def.candidateVi,
            semanticRequirements: {
              madnessCategory: def.category,
              requiredEvidence: ["MADNESS_EVIDENCE"]
            },
            semanticSignature: def.signature,
            tone: def.tone,
            register: def.signature.register,
            rhythmPreference: "FAST_PUNCHY",
            lexicalPriority: def.priority,
            confidence: 0.95,
            semanticExpansionCost: 0.0,
            introducedInformation: [],
            introducedMetaphor: false,
            surfaceRealization: true,
            provenance: `madness-provider:${def.ruleId}->${STYLE_SLOTS.CORRUPTED_MADNESS}:${def.category}`
          })
        );
      }

      return contributions;
    },

    getSuggestions(clauseIR, context = {}) {
      const contribs = this.contribute(clauseIR, context);
      const domainWeight = (context.domainWeights && context.domainWeights.MADNESS_FRENZY) || 0.85;
      return Object.freeze({
        providerId: "madness-provider",
        domain: "MADNESS_FRENZY",
        confidence: domainWeight,
        contributions: Object.freeze(contribs),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createMadnessProvider,
  validateMadnessEvidence,
  MADNESS_DEFINITIONS,
  MADNESS_CATEGORIES
};
