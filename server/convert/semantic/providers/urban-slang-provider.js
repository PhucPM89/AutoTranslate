"use strict";

/**
 * Urban & Internet Slang Localization Provider (Phase 2B - Wave C2B-2)
 * Domain: URBAN_SLANG
 *
 * Semantic Model:
 * - No Speaker/Listener requirement — operates on Register only.
 * - Activates on any text role: ACTION, DESCRIPTION, DIALOGUE, EXPOSITION.
 * - Converts contemporary Chinese internet slang, gaming jargon, and modern
 *   social meme expressions into natural, register-equivalent Vietnamese.
 *
 * Architecture Invariants:
 * - Zero Discourse Dependency: Does NOT require Speaker/Listener/Relationship resolution.
 * - Register Awareness: Preserves MODERN_INTERNET register throughout.
 * - Semantic Preservation: Output meaning is strictly equivalent to input.
 *   No introduced metaphors or invented information.
 * - Zero Emotional Escalation: Contempt stays contempt; amusement stays amusement.
 * - Migrates 11 legacy urban-slang-adapter.js rules.
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

// =========================================================================
// Slang Categories
// =========================================================================
const SLANG_CATEGORIES = Object.freeze({
  LIFE_ATTITUDE: "LIFE_ATTITUDE",
  SOCIAL_PHENOMENON: "SOCIAL_PHENOMENON",
  FACE_SHAME: "FACE_SHAME",
  FACE_PRETENSION: "FACE_PRETENSION",
  FACE_SLAP: "FACE_SLAP",
  GAMING_TECH: "GAMING_TECH",
  SCI_FI_TECH: "SCI_FI_TECH"
});

// =========================================================================
// Urban Slang Contribution Definitions (11 Migrated Rules)
// =========================================================================
const URBAN_SLANG_CONTRIBUTION_DEFINITIONS = Object.freeze([
  // Rule 1: Tang ping / Lying flat (生活态度)
  {
    ruleId: "URBAN_R01",
    targetVi: "thảng bình|nằm phẳng",
    pattern: /(?:thảng bình|nằm phẳng)/i,
    candidateVi: "buông xuôi mặc kệ đời",
    slangCategory: SLANG_CATEGORIES.LIFE_ATTITUDE,
    signature: createSemanticSignature({
      denotation: "LYING_FLAT_LIFESTYLE",
      affectDistribution: { TRANQUIL: 0.50 },
      valence: -0.10,
      intensity: 0.30,
      register: "MODERN_INTERNET"
    }),
    tone: "RESIGNED",
    priority: 0.85
  },

  // Rule 2: Involution / Toxic competition (内卷)
  {
    ruleId: "URBAN_R02",
    targetVi: "nội quyển",
    pattern: /nội quyển/i,
    candidateVi: "cạnh tranh khốc liệt",
    slangCategory: SLANG_CATEGORIES.SOCIAL_PHENOMENON,
    signature: createSemanticSignature({
      denotation: "INVOLUTION_TOXIC_COMPETITION",
      affectDistribution: { SOLEMN: 0.55 },
      valence: -0.20,
      intensity: 0.45,
      register: "MODERN_INTERNET"
    }),
    tone: "CRITICAL",
    priority: 0.85
  },

  // Rule 3: Humble-bragging (凡尔赛)
  {
    ruleId: "URBAN_R03",
    targetVi: "phàm nhĩ tái",
    pattern: /phàm nhĩ tái/i,
    candidateVi: "khoe mẽ ngầm",
    slangCategory: SLANG_CATEGORIES.SOCIAL_PHENOMENON,
    signature: createSemanticSignature({
      denotation: "HUMBLE_BRAGGING",
      affectDistribution: { AMUSEMENT: 0.60, CONTEMPT: 0.40 },
      valence: -0.10,
      intensity: 0.40,
      register: "MODERN_INTERNET"
    }),
    tone: "IRONIC",
    priority: 0.85
  },

  // Rule 4: Leading the narrative / Gatekeeping (带节奏)
  {
    ruleId: "URBAN_R04",
    targetVi: "đái tiết tấu",
    pattern: /đái tiết tấu/i,
    candidateVi: "dắt mũi dư luận",
    slangCategory: SLANG_CATEGORIES.SOCIAL_PHENOMENON,
    signature: createSemanticSignature({
      denotation: "NARRATIVE_MANIPULATION",
      affectDistribution: { SOLEMN: 0.50, CONTEMPT: 0.40 },
      valence: -0.30,
      intensity: 0.50,
      register: "MODERN_INTERNET"
    }),
    tone: "CRITICAL",
    priority: 0.85
  },

  // Rule 5: Social death / Public humiliation (社死)
  {
    ruleId: "URBAN_R05",
    targetVi: "xã tử",
    pattern: /(?:xã tử|xã hội tính tử vong)/i,
    candidateVi: "mất mặt trước đám đông",
    slangCategory: SLANG_CATEGORIES.FACE_SHAME,
    signature: createSemanticSignature({
      denotation: "PUBLIC_HUMILIATION_SHAME",
      affectDistribution: { SOLEMN: 0.70 },
      valence: -0.50,
      intensity: 0.60,
      register: "MODERN_INTERNET"
    }),
    tone: "EMBARRASSED",
    priority: 0.88
  },

  // Rule 6: Activating cheats / Hacking (开挂)
  {
    ruleId: "URBAN_R06",
    targetVi: "khai quải|mở quải",
    pattern: /(?:khai quải|mở quải)/i,
    candidateVi: "bật hack",
    slangCategory: SLANG_CATEGORIES.GAMING_TECH,
    signature: createSemanticSignature({
      denotation: "CHEAT_CODE_ACTIVATION",
      affectDistribution: { ELEVATED: 0.65, AMUSEMENT: 0.50 },
      valence: 0.40,
      intensity: 0.50,
      register: "MODERN_INTERNET"
    }),
    tone: "EXCITED",
    priority: 0.85
  },

  // Rule 7: Krypton / Pay-to-win (氪金)
  {
    ruleId: "URBAN_R07",
    targetVi: "khắc kim",
    pattern: /khắc kim/i,
    candidateVi: "nạp tiền cày game",
    slangCategory: SLANG_CATEGORIES.GAMING_TECH,
    signature: createSemanticSignature({
      denotation: "PAY_TO_WIN_GAMING",
      affectDistribution: { AMUSEMENT: 0.55 },
      valence: -0.10,
      intensity: 0.40,
      register: "MODERN_INTERNET"
    }),
    tone: "IRONIC",
    priority: 0.85
  },

  // Rule 8: Black technology / Advanced dark tech (黑科技)
  {
    ruleId: "URBAN_R08",
    targetVi: "hắc khoa kỹ",
    pattern: /hắc khoa kỹ/i,
    candidateVi: "siêu công nghệ hắc ám",
    slangCategory: SLANG_CATEGORIES.SCI_FI_TECH,
    signature: createSemanticSignature({
      denotation: "BLACK_TECHNOLOGY_SCIFI",
      affectDistribution: { SOLEMN: 0.60, ELEVATED: 0.50 },
      valence: 0.30,
      intensity: 0.55,
      register: "MODERN_INTERNET"
    }),
    tone: "AWE",
    priority: 0.85
  },

  // Rule 9 & 10: Pretension / Showing off (装逼 / 装X)
  {
    ruleId: "URBAN_R09",
    targetVi: "trang bức|trang x",
    pattern: /(?:trang bức|trang x\b)/i,
    candidateVi: "làm màu ra vẻ",
    slangCategory: SLANG_CATEGORIES.FACE_PRETENSION,
    signature: createSemanticSignature({
      denotation: "PRETENTIOUS_POSTURING",
      affectDistribution: { CONTEMPT: 0.60, AMUSEMENT: 0.50 },
      valence: -0.20,
      intensity: 0.50,
      register: "MODERN_INTERNET"
    }),
    tone: "CONTEMPTUOUS",
    priority: 0.85
  },

  // Rule 11: Face slap (打脸)
  {
    ruleId: "URBAN_R11",
    targetVi: "đánh mặt",
    pattern: /đánh mặt(?!\s+thật)/i,
    candidateVi: "vả mặt bôm bốp",
    slangCategory: SLANG_CATEGORIES.FACE_SLAP,
    signature: createSemanticSignature({
      denotation: "FACE_SLAPPING_HUMILIATION",
      affectDistribution: { CONTEMPT: 0.75, ELEVATED: 0.50 },
      valence: -0.40,
      intensity: 0.65,
      register: "MODERN_INTERNET"
    }),
    tone: "TRIUMPHANT",
    priority: 0.88
  },

  // Rule 12: Face slap (hard)
  {
    ruleId: "URBAN_R12",
    targetVi: "vả mặt thật đau",
    pattern: /vả mặt thật đau/i,
    candidateVi: "vả mặt đau điếng",
    slangCategory: SLANG_CATEGORIES.FACE_SLAP,
    signature: createSemanticSignature({
      denotation: "FACE_SLAP_PAINFUL_EMPHASIS",
      affectDistribution: { CONTEMPT: 0.70, ELEVATED: 0.60 },
      valence: -0.45,
      intensity: 0.65,
      register: "MODERN_INTERNET"
    }),
    tone: "TRIUMPHANT",
    priority: 0.88
  }
]);

// =========================================================================
// Provider Factory
// =========================================================================
function createUrbanSlangProvider() {
  return Object.freeze({
    providerId: "urban-slang-provider",
    domain: "URBAN_SLANG",
    supportedSlots: [STYLE_SLOTS.MODERN_VERNACULAR],

    /**
     * Contribute modern-vernacular candidates for any clause with a matching slang pattern.
     *
     * Activation Conditions:
     * - NO role restriction (ACTION, DESCRIPTION, DIALOGUE, EXPOSITION all valid).
     * - NO Speaker/Listener/Relationship required.
     * - Pattern match only.
     *
     * @param {Object} clauseIR
     * @param {Object} [context]
     * @returns {Array<Object>} StylistContribution[]
     */
    contribute(clauseIR, context = {}) {
      if (!clauseIR || !clauseIR.sourceZh) return [];

      // Search Vietnamese translated text (primary) or source Chinese (fallback)
      const searchText = (context && context.translatedText) || clauseIR.sourceZh;
      const contributions = [];

      for (const def of URBAN_SLANG_CONTRIBUTION_DEFINITIONS) {
        if (!def.pattern.test(searchText)) continue;

        contributions.push(
          createStylistContribution({
            providerId: "urban-slang-provider",
            domain: "URBAN_SLANG",
            targetSlot: STYLE_SLOTS.MODERN_VERNACULAR,
            dimension: "REGISTER",
            sourceSpanZh: def.targetVi,
            candidateVi: def.candidateVi,
            semanticRequirements: {
              slangCategory: def.slangCategory,
              requiredEvidence: ["MODERN_SLANG_EXPRESSION"]
            },
            semanticSignature: def.signature,
            tone: def.tone,
            register: "MODERN_INTERNET",
            rhythmPreference: "VERNACULAR_NATURAL",
            lexicalPriority: def.priority,
            confidence: 0.90,
            semanticExpansionCost: 0.0,
            introducedInformation: [],
            introducedMetaphor: false,
            surfaceRealization: true,
            provenance: `urban-slang-provider:${def.ruleId}->${STYLE_SLOTS.MODERN_VERNACULAR}:${def.slangCategory}`
          })
        );
      }

      return contributions;
    },

    getSuggestions(clauseIR, context = {}) {
      const contribs = this.contribute(clauseIR, context);
      const domainWeight = (context.domainWeights && context.domainWeights.URBAN_SLANG) || 0.80;
      return Object.freeze({
        providerId: "urban-slang-provider",
        domain: "URBAN_SLANG",
        confidence: domainWeight,
        contributions: Object.freeze(contribs),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createUrbanSlangProvider,
  URBAN_SLANG_CONTRIBUTION_DEFINITIONS,
  SLANG_CATEGORIES
};
