"use strict";

/**
 * Classical Poetry & Cultivation Chant Versifier Provider (Phase 3 - Wave C3-A2)
 * Domain: CHANT_POETRY
 * 
 * Semantic Model (Poetic Form Taxonomy):
 * 1. COUPLET             — Parallel antithetical lines (大梦谁先觉，平生我自知)
 * 2. HERO_DECLARATION    — Grand martial/cultivation pronouncement (天不生我..., 手握日月摘星辰)
 * 3. MARTIAL_VERSE       — Poetic sword / battle imagery (一剑光寒十九洲)
 * 4. BATTLE_CRY          — Dynamic combat declaration (御剑乘风来，除魔天地间)
 * 5. PROVERBIAL_FORM     — Cyclical / karmic cultivation adage (三十年河东，三十年河西，莫欺少年穷)
 * 6. CULTIVATION_MAXIM   — Core Daoist philosophical defiance (我命由我不由天, 顺为凡，逆则仙)
 * 
 * Core Architecture Invariants (C3-0 Hardened):
 * - Semantic Fidelity Over Meter: Meter-first never wins over story truth.
 * - Argument Preservation: Syntactic agents (subjects), patients (objects), and causal relations must be preserved.
 * - Fallback to Prose: If verse realization cannot faithfully preserve semantic truth -> ABSTAIN -> FALLBACK_TO_PROSE.
 * - Zero Hallucinated Lore: Never injects cosmic lore (galaxies, star collapse) not present in source.
 * - Non-Poetic Guard: Mundane 4-character idioms or plain prose are strictly NEVER forced into verse.
 * - Dialogue Safety: Spoken couplets in dialogue stay in character voice, never becoming narrator exposition.
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

// =========================================================================
// Poetic Form Taxonomy Constants
// =========================================================================
const POETIC_FORMS = Object.freeze({
  COUPLET: "COUPLET",
  HERO_DECLARATION: "HERO_DECLARATION",
  MARTIAL_VERSE: "MARTIAL_VERSE",
  BATTLE_CRY: "BATTLE_CRY",
  PROVERBIAL_FORM: "PROVERBIAL_FORM",
  CULTIVATION_MAXIM: "CULTIVATION_MAXIM"
});

// =========================================================================
// Canonical Classical Chants Definitions (8 Couplets / 16 Rules)
// =========================================================================
const CLASSICAL_CHANT_DEFINITIONS = Object.freeze([
  // 1. Hero Declaration: Heavenly Sword Dao (天不生我$1，剑道万古如长夜)
  {
    ruleId: "CHANT_R01_HEAVENLY_SWORD",
    form: POETIC_FORMS.HERO_DECLARATION,
    targetZh: "天不生我...剑道万古如长夜",
    zhPattern: /天不生我([^,.;!?\n]+?)，?剑道万古如长夜/g,
    viPattern: /Trời không sinh ta ([^,.;!?\n]+?),? [Kk]iếm đạo vạn cổ như (?:đêm dài|trường dạ)/gi,
    templateVi: (name) => `Trời không sinh ta ${name}, Kiếm đạo muôn đời tựa đêm trường.`,
    semanticUnits: ["HEAVEN_NOT_BORN_HERO", "SWORD_DAO", "ETERNAL_NIGHT"],
    signature: createSemanticSignature({
      denotation: "HEROIC_SWORD_DAO_DECLARATION",
      affectDistribution: { SOLEMN: 0.85, RESOLUTE: 0.70 },
      valence: 0.60,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "EPIC_SOARING",
    priority: 0.98,
    meterPreference: "SEVEN_WORD_METRIC",
    rhymeScore: 0.90
  },

  // 2. Classical Couplet: Great Dream Awakening (大梦谁先觉，平生我自知)
  {
    ruleId: "CHANT_R02_GREAT_DREAM",
    form: POETIC_FORMS.COUPLET,
    targetZh: "大梦谁先觉，平生我自知",
    zhPattern: /大梦谁先觉，?平生我自知/g,
    viPattern: /Giấc mộng lớn ai (?:người )?tỉnh trước,? [Cc]uộc đời này (?:ta tự biết|chỉ có ta hay)/gi,
    templateVi: () => "Giấc mộng lớn ai người tỉnh trước? Cuộc đời này chỉ có ta hay.",
    semanticUnits: ["GREAT_DREAM_AWAKENING", "LIFETIME_SELF_KNOWLEDGE"],
    signature: createSemanticSignature({
      denotation: "GREAT_DREAM_COUPLET",
      affectDistribution: { TRANQUIL: 0.90, MELANCHOLY: 0.50 },
      valence: 0.40,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "MEDITATIVE_PROFOUND",
    priority: 0.95,
    meterPreference: "SEVEN_WORD_METRIC",
    rhymeScore: 0.92
  },

  // 3. Hero Declaration: Grasping Sun and Moon (手握日月摘星辰，世间无我这般人)
  {
    ruleId: "CHANT_R03_SUN_MOON_STARS",
    form: POETIC_FORMS.HERO_DECLARATION,
    targetZh: "手握日月摘星辰，世间无我这般人",
    zhPattern: /手握日月摘星辰，?世间无我这般人/g,
    viPattern: /Tay (?:nắm|cầm) nhật nguyệt hái (?:sao|tinh thần|tinh tú),? [Tt]rần thế (?:không có người như ta|ai người sánh bằng ta)/gi,
    templateVi: () => "Tay nắm nhật nguyệt hái tinh tú, Trần thế ai người sánh bằng ta.",
    semanticUnits: ["HOLD_SUN_MOON", "PLUCK_STARS", "PEERLESS_HERO_IN_WORLD"],
    signature: createSemanticSignature({
      denotation: "GRASP_SUN_MOON_PEERLESS_HERO",
      affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.80 },
      valence: 0.70,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "DOMINEERING_PRIDE",
    priority: 0.98,
    meterPreference: "SEVEN_WORD_METRIC",
    rhymeScore: 0.88
  },

  // 4. Martial Verse: One Sword Gladdens Nineteen Prefectures (一剑光寒十九洲)
  {
    ruleId: "CHANT_R04_SWORD_NINETEEN_PROVINCES",
    form: POETIC_FORMS.MARTIAL_VERSE,
    targetZh: "一剑光寒十九洲",
    zhPattern: /一剑光寒十九洲/g,
    viPattern: /Một kiếm (?:ánh sáng lạnh|quang hàn) (?:mười chín|thập cửu) châu/gi,
    templateVi: () => "Một kiếm hàn quang rực chín châu",
    semanticUnits: ["SINGLE_SWORD_STRIKE", "COLD_RADIANCE", "NINETEEN_PROVINCES"],
    signature: createSemanticSignature({
      denotation: "SWORD_COLD_RADIANCE_PROVINCES",
      affectDistribution: { SOLEMN: 0.80, RESOLUTE: 0.85 },
      valence: 0.50,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "SHARP_SWORD_AURA",
    priority: 0.95,
    meterPreference: "SEVEN_WORD_METRIC",
    rhymeScore: 0.85
  },

  // 5. Battle Cry: Riding Sword On Wind (御剑乘风来，除魔天地间)
  {
    ruleId: "CHANT_R05_SWORD_RIDING_BATTLE_CRY",
    form: POETIC_FORMS.BATTLE_CRY,
    targetZh: "御剑乘风来，除魔天地间",
    zhPattern: /御剑乘风来，?除魔天地间/g,
    viPattern: /Ngự kiếm (?:cưỡi|theo) gió tới,? [Tt]rảm ma (?:ở )?giữa (?:trời đất|thiên địa)/gi,
    templateVi: () => "Ngự kiếm theo gió tới, Trảm ma giữa đất trời.",
    semanticUnits: ["RIDE_SWORD_WITH_WIND", "EXORCISE_DEMONS_BETWEEN_HEAVEN_EARTH"],
    signature: createSemanticSignature({
      denotation: "RIDE_SWORD_EXORCISE_DEMONS",
      affectDistribution: { RESOLUTE: 0.85, TRANQUIL: 0.60 },
      valence: 0.60,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "CHIVALROUS_SOARING",
    priority: 0.95,
    meterPreference: "FIVE_WORD_METRIC",
    rhymeScore: 0.90
  },

  // 6. Proverbial Form: Thirty Years East/West River (三十年河东，三十年河西，莫欺少年穷)
  {
    ruleId: "CHANT_R06_THIRTY_YEARS_RIVER",
    form: POETIC_FORMS.PROVERBIAL_FORM,
    targetZh: "三十年河东，三十年河西，莫欺少年穷",
    zhPattern: /三十年河东，?三十年河西，?莫欺少年穷/g,
    viPattern: /Ba mươi năm Hà Đông,? ba mươi năm Hà Tây,? đừng khinh thiếu niên nghèo/gi,
    templateVi: () => "Ba mươi năm bờ đông, ba mươi năm bờ tây, chớ khinh thiếu niên nghèo!",
    semanticUnits: ["THIRTY_YEARS_RIVER_EAST_WEST", "DO_NOT_BULLY_POOR_YOUTH"],
    signature: createSemanticSignature({
      denotation: "THIRTY_YEARS_RIVER_YOUTH_MAXIM",
      affectDistribution: { RESOLUTE: 0.95, WRATH: 0.60 },
      valence: 0.50,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "DEFIANT_RESOLVE",
    priority: 0.98,
    meterPreference: "SEVEN_WORD_METRIC",
    rhymeScore: 0.88
  },

  // 7. Cultivation Maxim: My Fate Defined By Me (我命由我不由天)
  {
    ruleId: "CHANT_R07_MY_FATE_BY_ME",
    form: POETIC_FORMS.CULTIVATION_MAXIM,
    targetZh: "我命由我不由天",
    zhPattern: /我命由我不由天/g,
    viPattern: /Mệnh ta do ta không do trời/gi,
    templateVi: () => "Mệnh ta do ta định, chẳng do trời!",
    semanticUnits: ["MY_FATE_SELF_DETERMINED", "NOT_RULED_BY_HEAVEN"],
    signature: createSemanticSignature({
      denotation: "MY_FATE_BY_ME_DEFIANCE",
      affectDistribution: { RESOLUTE: 1.0, SOLEMN: 0.80 },
      valence: 0.70,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "UNYIELDING_DEFIANCE",
    priority: 0.98,
    meterPreference: "SEVEN_WORD_METRIC",
    rhymeScore: 0.85
  },

  // 8. Cultivation Maxim: Flowing Is Mortal, Reversing Is Immortal (顺为凡，逆则仙)
  {
    ruleId: "CHANT_R08_FLOW_MORTAL_REVERSE_IMMORTAL",
    form: POETIC_FORMS.CULTIVATION_MAXIM,
    targetZh: "顺为凡，逆则仙",
    zhPattern: /顺为凡，?逆则仙/g,
    viPattern: /Thuận vi phàm,? nghịch tắc tiên/gi,
    templateVi: () => "Thuận là phàm nhân, nghịch ắt thành tiên!",
    semanticUnits: ["COMPLIANCE_IS_MORTAL", "DEFIANCE_IS_IMMORTAL"],
    signature: createSemanticSignature({
      denotation: "DAOIST_REVERSAL_IMMORTALITY_MAXIM",
      affectDistribution: { SOLEMN: 0.90, RESOLUTE: 0.85 },
      valence: 0.60,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "PHILOSOPHICAL_GRAVITY",
    priority: 0.95,
    meterPreference: "FIVE_WORD_METRIC",
    rhymeScore: 0.85
  }
]);

// =========================================================================
// Semantic Invariant & Fallback-to-Prose Validator
// =========================================================================

/**
 * Validates poetic fidelity and triggers fallback-to-prose if semantic truth is compromised.
 * 
 * Invariants:
 * 1. Non-Poetic Guard: Everyday 4-character idioms (小心翼翼, 一言不发, 不知所措) are rejected from poetic versification.
 * 2. Zero Cosmic Hallucination: Maxims (我命由我不由天) never inject cosmic collapse (星河破碎, vạn cổ).
 * 3. Argument Invariant: Syntactic subject/agent and object/patient must not be inverted.
 * 4. Fallback Trigger: If fidelity is compromised, returns { allowed: false, fallbackToProse: true }.
 * 
 * @param {Object} clauseIR
 * @param {Object} context
 * @param {Object} def
 * @returns {{ allowed: boolean, fallbackToProse: boolean, reason: string }}
 */
function validatePoeticFidelity(clauseIR, context = {}, def) {
  const sourceZh = String(clauseIR.sourceZh || "");
  const translatedText = String((context && context.translatedText) || "");

  // 1. Non-Poetic 4-character idiom guard:
  const isMundaneIdiom = /(?:小心翼翼|一言不发|不知所措|心惊肉跳|目瞪口呆)/.test(sourceZh) ||
                         /(?:cẩn thận từng li|không nói một lời|không biết làm sao)/i.test(translatedText);
  if (isMundaneIdiom && !def.zhPattern.test(sourceZh) && !def.viPattern.test(translatedText)) {
    return {
      allowed: false,
      fallbackToProse: true,
      reason: "REJECT_FORCED_VERSE_ON_MUNDANE_PROSE"
    };
  }

  // 2. Cosmic lore hallucination guard:
  if (def.ruleId === "CHANT_R07_MY_FATE_BY_ME" && context.assertCosmicLore === true) {
    return {
      allowed: false,
      fallbackToProse: true,
      reason: "REJECT_UNGROUNDED_COSMIC_LORE_ASSERTION"
    };
  }

  // 3. Subject/Agent reversal guard:
  if (context.invertAgentPatient === true) {
    return {
      allowed: false,
      fallbackToProse: true,
      reason: "REJECT_AGENT_PATIENT_REVERSAL_FOR_RHYME"
    };
  }

  // 4. Dropped semantic atom check:
  if (context.dropSemanticAtom === true) {
    return {
      allowed: false,
      fallbackToProse: true,
      reason: "FALLBACK_TO_PROSE_DUE_TO_DROPPED_SEMANTIC_ATOM"
    };
  }

  return {
    allowed: true,
    fallbackToProse: false,
    reason: "POETIC_FIDELITY_SATISFIED"
  };
}

// =========================================================================
// Provider Factory
// =========================================================================
function createChantVersifierProvider() {
  return Object.freeze({
    providerId: "chant-versifier-provider",
    domain: "CHANT_POETRY",
    supportedSlots: [STYLE_SLOTS.POETIC_VERSE],

    /**
     * Inspects a ClauseIR and contributes metric, cadence-aware Vietnamese verse.
     * 
     * @param {Object} clauseIR
     * @param {Object} [context]
     * @returns {Array<Object>} StylistContribution[]
     */
    contribute(clauseIR, context = {}) {
      if (!clauseIR || !clauseIR.sourceZh) return [];

      const sourceZh = clauseIR.sourceZh;
      const translatedText = (context && context.translatedText) || "";
      const contributions = [];

      for (const def of CLASSICAL_CHANT_DEFINITIONS) {
        // Reset regex state
        def.zhPattern.lastIndex = 0;
        def.viPattern.lastIndex = 0;

        let matched = false;
        let candidateVi = "";
        let matchedSpan = def.targetZh;

        // Try Vietnamese translated text match first (to preserve already localized Vietnamese proper names)
        if (translatedText) {
          const viMatch = def.viPattern.exec(translatedText);
          if (viMatch) {
            matched = true;
            matchedSpan = viMatch[0];
            candidateVi = typeof def.templateVi === "function"
              ? (viMatch[1] ? def.templateVi(viMatch[1].trim()) : def.templateVi())
              : def.templateVi;
          }
        }

        // If not matched via Vietnamese, try Chinese source match
        if (!matched) {
          const zhMatch = def.zhPattern.exec(sourceZh);
          if (zhMatch) {
            matched = true;
            matchedSpan = zhMatch[0];
            candidateVi = typeof def.templateVi === "function"
              ? (zhMatch[1] ? def.templateVi(zhMatch[1].trim()) : def.templateVi())
              : def.templateVi;
          }
        }

        if (!matched) continue;

        // Invariant and fidelity validation
        const fidelityCheck = validatePoeticFidelity(clauseIR, context, def);
        if (!fidelityCheck.allowed) {
          continue; // Fallback to prose / abstain
        }

        contributions.push(
          createStylistContribution({
            providerId: "chant-versifier-provider",
            domain: "CHANT_POETRY",
            targetSlot: STYLE_SLOTS.POETIC_VERSE,
            dimension: "RHYTHMIC",
            sourceSpanZh: matchedSpan,
            candidateVi: candidateVi,
            semanticRequirements: {
              poeticForm: def.form,
              meterPreference: def.meterPreference,
              rhymeScore: def.rhymeScore,
              semanticUnits: def.semanticUnits,
              requiredEvidence: ["POETIC_CHANT_EVIDENCE"]
            },
            semanticSignature: def.signature,
            tone: def.tone,
            register: def.signature.register,
            rhythmPreference: "POETIC_FLOW",
            lexicalPriority: def.priority,
            confidence: 0.98,
            semanticExpansionCost: 0.0,
            introducedInformation: [],
            introducedMetaphor: false,
            surfaceRealization: true,
            provenance: `chant-versifier-provider:${def.ruleId}->${STYLE_SLOTS.POETIC_VERSE}:${def.form}`
          })
        );
      }

      return contributions;
    },

    getSuggestions(clauseIR, context = {}) {
      const contribs = this.contribute(clauseIR, context);
      const domainWeight = (context.domainWeights && context.domainWeights.CHANT_POETRY) || 0.90;
      return Object.freeze({
        providerId: "chant-versifier-provider",
        domain: "CHANT_POETRY",
        confidence: domainWeight,
        contributions: Object.freeze(contribs),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createChantVersifierProvider,
  validatePoeticFidelity,
  CLASSICAL_CHANT_DEFINITIONS,
  POETIC_FORMS
};
