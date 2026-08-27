"use strict";

/**
 * Courtly Beauty & Maiden Aesthetic Provider (Phase 3 - Wave C3-A1)
 * Domain: COURTLY_BEAUTY
 *
 * Semantic Model (Aesthetic Dimensions):
 * 1. CLOTHING       — Robes, garments, celestial attire (白衣胜雪, 一袭白衣)
 * 2. HAIR           — Silky black hair, flowing locks (黑发如瀑, 三千青丝)
 * 3. FACE           — Countenance, facial harmony (容貌绝美, 眉目如画)
 * 4. EYES           — Limpid gaze, autumn water eyes (眼神流转, 目若秋水)
 * 5. SKIN           — Jade-like smooth skin (肤如凝脂, 肌肤胜雪)
 * 6. POSTURE        — Graceful poise, slender posture (身材婀娜, 曼妙) [Gated by explicit source text]
 * 7. DEMEANOR       — Elegant bearing, serene composure (端庄, 温婉, 清冷)
 * 8. BEAUTY_METAPHOR— Celestial maiden, peerless beauty (倾国倾城, 美若天仙)
 * 9. AURA           — Transcendent grace, ethereal presence (气质出尘, 仙气)
 *
 * Core Architecture Invariants (C3-0 Hardened):
 * - Realize Existing Aesthetic Information: Never manufactures beauty facts or ungrounded attributes.
 * - Dimension Isolation: Only modulates the specific aesthetic dimension present in source evidence.
 * - Negative Assertions Strictly Enforced:
 *   * White clothing (身穿白衣) -> clothing only; NEVER inject skin texture, body curves, scent, or desire.
 *   * Neutral smile (微微一笑) -> smile only; NEVER inject seduction, love, or longing.
 *   * Neutral lighting (月光照在她身上) -> lighting only; NEVER inject ungrounded beauty judgments.
 *   * Third-person limited POV -> NEVER assert universal attraction claims ("ai nhìn cũng say đắm").
 * - Zero Eroticism: Strictly excludes sexualized descriptions, body curve fabrication, or bodily scent.
 * - Zero Emotional Escalation: Beauty description never fabricates LOVE, DESIRE, or ATTRACTION in onlookers.
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

// =========================================================================
// Aesthetic Dimension Constants
// =========================================================================
const AESTHETIC_DIMENSIONS = Object.freeze({
  CLOTHING: "CLOTHING",
  HAIR: "HAIR",
  FACE: "FACE",
  EYES: "EYES",
  SKIN: "SKIN",
  POSTURE: "POSTURE",
  DEMEANOR: "DEMEANOR",
  BEAUTY_METAPHOR: "BEAUTY_METAPHOR",
  AURA: "AURA"
});

// =========================================================================
// Aesthetic Realization Definitions (10 Rules)
// =========================================================================
const COURTLY_BEAUTY_DEFINITIONS = Object.freeze([
  // 1. Skin: Jade / Snow Skin (肤如凝脂 / 肌肤胜雪)
  {
    ruleId: "BEAUTY_R01_SKIN",
    targetVi: "da như mỡ đông|da như ngọc đông|da thịt trắng như tuyết",
    pattern: /(?:da như mỡ đông|da như ngọc đông|da thịt trắng như tuyết|làn da trắng như tuyết|da dẻ trắng ngần)/i,
    candidateVi: "làn da trắng ngần mịn màng như ngọc",
    dimension: AESTHETIC_DIMENSIONS.SKIN,
    signature: createSemanticSignature({
      denotation: "JADE_LIKE_TRANSLUCENT_SKIN",
      affectDistribution: { TRANQUIL: 0.60, SOLEMN: 0.40 },
      valence: 0.40,
      intensity: 0.45,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "SERENE_ELEGANCE",
    priority: 0.88
  },

  // 2. Hair: Waterfall Silky Hair (黑发如瀑)
  {
    ruleId: "BEAUTY_R02_HAIR",
    targetVi: "tóc đen như thác nước",
    pattern: /(?:tóc đen như thác nước|mái tóc đen như thác nước|mái tóc buông xõa như thác)/i,
    candidateVi: "suối tóc đen tuyền buông xõa mượt mà",
    dimension: AESTHETIC_DIMENSIONS.HAIR,
    signature: createSemanticSignature({
      denotation: "WATERFALL_SILKY_HAIR",
      affectDistribution: { TRANQUIL: 0.65 },
      valence: 0.35,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "POETIC_GRACE",
    priority: 0.88
  },

  // 3. Clothing: Snow-White Robes (白衣胜雪)
  {
    ruleId: "BEAUTY_R03_CLOTHING",
    targetVi: "áo trắng hơn tuyết|bạch y thắng tuyết",
    pattern: /(?:một bộ áo trắng hơn tuyết|một thân áo trắng hơn tuyết|một thân bạch y thắng tuyết|áo trắng hơn tuyết|bạch y thắng tuyết)/i,
    candidateVi: "tà áo trắng tinh khôi thanh khiết tựa tuyết đầu mùa",
    dimension: AESTHETIC_DIMENSIONS.CLOTHING,
    signature: createSemanticSignature({
      denotation: "SNOW_WHITE_CELESTIAL_ROBES",
      affectDistribution: { TRANQUIL: 0.70, SOLEMN: 0.50 },
      valence: 0.45,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "ETHEREAL_PURITY",
    priority: 0.90
  },

  // 4. Eyes: Autumn Water Eyes (眼神流转 / 目若秋水)
  {
    ruleId: "BEAUTY_R04_EYES",
    targetVi: "ánh mắt lưu chuyển",
    pattern: /(?:ánh mắt lưu chuyển(?: như nước)?|đôi mắt long lanh như nước mùa thu|mắt như nước thu)/i,
    candidateVi: "ánh mắt long lanh tựa làn nước mùa thu",
    dimension: AESTHETIC_DIMENSIONS.EYES,
    signature: createSemanticSignature({
      denotation: "AUTUMN_WATER_GAZE",
      affectDistribution: { TRANQUIL: 0.60, AMUSEMENT: 0.40 },
      valence: 0.40,
      intensity: 0.45,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "GENTLE_LUCID",
    priority: 0.88
  },

  // 5. Beauty Metaphor: Kingdom-Toppling Beauty (倾国倾城)
  {
    ruleId: "BEAUTY_R05_KINGDOM_TOPPLING",
    targetVi: "khuynh quốc khuynh thành",
    pattern: /khuynh quốc khuynh thành(?!\s+tuyệt trần)/i,
    candidateVi: "nhan sắc tuyệt trần khuynh quốc khuynh thành",
    dimension: AESTHETIC_DIMENSIONS.BEAUTY_METAPHOR,
    signature: createSemanticSignature({
      denotation: "PEERLESS_KINGDOM_TOPPLING_BEAUTY",
      affectDistribution: { SOLEMN: 0.60, JOY: 0.40 },
      valence: 0.50,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "STATELY_GRACE",
    priority: 0.90
  },

  // 6. Face: Flawless Exquisite Countenance (容貌绝美)
  {
    ruleId: "BEAUTY_R06_FACE_FLAWLESS",
    targetVi: "dung mạo tuyệt mỹ",
    pattern: /(?:dung mạo tuyệt mỹ|dung nhan tuyệt mỹ|dung mạo tuyệt trần)/i,
    candidateVi: "dung nhan tuyệt mỹ không tì vết",
    dimension: AESTHETIC_DIMENSIONS.FACE,
    signature: createSemanticSignature({
      denotation: "FLAWLESS_FACIAL_BEAUTY",
      affectDistribution: { TRANQUIL: 0.60, JOY: 0.40 },
      valence: 0.50,
      intensity: 0.55,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "AESTHETIC_ADMIRATION",
    priority: 0.90
  },

  // 7. Aura: Transcendent Celestial Aura (气质出尘)
  {
    ruleId: "BEAUTY_R07_AURA_TRANSCENDENT",
    targetVi: "khí chất xuất trần",
    pattern: /(?:khí chất xuất trần|khí chất thoát tục|thần thái xuất trần)/i,
    candidateVi: "khí chất thanh tao thoát tục",
    dimension: AESTHETIC_DIMENSIONS.AURA,
    signature: createSemanticSignature({
      denotation: "TRANSCENDENT_OTHERWORLDLY_AURA",
      affectDistribution: { TRANQUIL: 0.80, SOLEMN: 0.50 },
      valence: 0.50,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "TRANSCENDENT_CALM",
    priority: 0.90
  },

  // 8. Facial Feature: Painted Eyebrows (眉目如画)
  {
    ruleId: "BEAUTY_R08_EYEBROWS_PAINTED",
    targetVi: "mày ngài như vẽ|chân mày như tranh vẽ",
    pattern: /(?:mày ngài như vẽ|chân mày như tranh vẽ|mày như họa|mi mục như họa)/i,
    candidateVi: "hàng chân mày thanh tú như họa",
    dimension: AESTHETIC_DIMENSIONS.FACE,
    signature: createSemanticSignature({
      denotation: "PAINTED_REFINED_EYEBROWS",
      affectDistribution: { TRANQUIL: 0.65 },
      valence: 0.40,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "REFINED_POISE",
    priority: 0.88
  },

  // 9. Beauty Metaphor: Celestial Immortal Maiden (美若天仙)
  {
    ruleId: "BEAUTY_R09_CELESTIAL_FAIRY",
    targetVi: "mỹ nhược thiên tiên|đẹp tựa tiên nữ",
    pattern: /(?:mỹ nhược thiên tiên|đẹp tựa tiên nữ|đẹp như tiên nữ|tuyệt mỹ như thiên tiên)/i,
    candidateVi: "nhan sắc thanh lệ thoát tục tựa tiên nữ giáng trần",
    dimension: AESTHETIC_DIMENSIONS.BEAUTY_METAPHOR,
    signature: createSemanticSignature({
      denotation: "CELESTIAL_IMMORTAL_FAIRY_BEAUTY",
      affectDistribution: { TRANQUIL: 0.70, JOY: 0.45 },
      valence: 0.55,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "CELESTIAL_ADMIRATION",
    priority: 0.92
  },

  // 10. Posture: Slender Graceful Posture (身材婀娜 / 曼妙) [Gated strictly by explicit posture text]
  {
    ruleId: "BEAUTY_R10_POSTURE_SLENDER",
    targetVi: "dáng người thướt tha|dáng người uyển chuyển",
    pattern: /(?:dáng người thướt tha|dáng người uyển chuyển|thân hình thướt tha|thân hình uyển chuyển|dáng người man diệu)/i,
    candidateVi: "dáng người thướt tha mềm mại",
    dimension: AESTHETIC_DIMENSIONS.POSTURE,
    signature: createSemanticSignature({
      denotation: "SLENDER_GRACEFUL_POSTURE",
      affectDistribution: { TRANQUIL: 0.60 },
      valence: 0.35,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    tone: "LISSOME_GRACE",
    priority: 0.85
  }
]);

// =========================================================================
// Negative Assertion Checker
// =========================================================================

/**
 * Validates that candidate realization does NOT inject ungrounded attributes:
 * - Neutral clothing must not inject skin/body/scent.
 * - Neutral smile must not inject seduction/romance.
 * - Neutral lighting must not inject beauty praise.
 * - Third-person limited narrative must not inject omniscient attraction.
 *
 * @param {Object} clauseIR
 * @param {Object} context
 * @param {Object} def
 * @returns {{ allowed: boolean, reason: string }}
 */
function validateAestheticInvariants(clauseIR, context = {}, def) {
  const sourceText = String(clauseIR.sourceZh || "");
  const translatedText = String((context && context.translatedText) || "");

  // 1. White Robe Neutral Guard: "身穿白衣" / "mặc áo trắng" without snow metaphor
  const isNeutralClothingOnly =
    /(?:身穿白衣|穿着白裙|mặc áo trắng|khoác áo trắng)/i.test(sourceText) ||
    /(?:mặc áo trắng|khoác áo trắng|mặc một bộ đồ trắng)/i.test(translatedText);

  const hasSnowMetaphor = /(?:胜雪|hơn tuyết|thắng tuyết)/i.test(sourceText) || /(?:hơn tuyết|thắng tuyết)/i.test(translatedText);

  if (isNeutralClothingOnly && !hasSnowMetaphor && def.dimension !== AESTHETIC_DIMENSIONS.CLOTHING) {
    return {
      allowed: false,
      reason: "REJECT_UNGROUNDED_ATTRIBUTE_INJECTION_FROM_NEUTRAL_CLOTHING"
    };
  }

  // 2. Simple Smile Neutral Guard: "微微一笑" without seduction/allure evidence
  const isSimpleSmile = /(?:微微一笑|轻笑一声|mỉm cười|khẽ cười)/i.test(sourceText) || /(?:mỉm cười|khẽ mỉm cười)/i.test(translatedText);
  if (isSimpleSmile && !def.pattern.test(translatedText)) {
    return {
      allowed: false,
      reason: "REJECT_UNGROUNDED_SEDUCTION_FROM_NEUTRAL_SMILE"
    };
  }

  // 3. Neutral Lighting Guard: "月光照在她身上" without beauty keywords
  const isLightingOnly = /(?:月光照在|ánh trăng chiếu)/i.test(sourceText) || /(?:ánh trăng chiếu|ánh trăng rọi)/i.test(translatedText);
  const hasBeautyEvidence = /(?:绝美|倾国|天仙|xuất trần|tuyệt mỹ|thắng tuyết)/i.test(sourceText) || /(?:tuyệt mỹ|khuynh quốc|tiên nữ|xuất trần|thắng tuyết)/i.test(translatedText);
  if (isLightingOnly && !hasBeautyEvidence) {
    return {
      allowed: false,
      reason: "REJECT_UNGROUNDED_BEAUTY_INJECTION_FROM_LIGHTING"
    };
  }

  // 4. POV Safety Guard: In third-person limited, prevent omniscient universal attraction claims
  const pov = (clauseIR.cognitiveEvent && clauseIR.cognitiveEvent.pov) || context.pov || "THIRD_PERSON_LIMITED";
  if (pov === "THIRD_PERSON_LIMITED" && context.assertUniversalAttraction === true) {
    return {
      allowed: false,
      reason: "REJECT_OMNISCIENT_ATTRACTION_CLAIM_IN_LIMITED_POV"
    };
  }

  return { allowed: true, reason: "AESTHETIC_INVARIANTS_SATISFIED" };
}

// =========================================================================
// Provider Factory
// =========================================================================
function createCourtlyBeautyProvider() {
  return Object.freeze({
    providerId: "courtly-beauty-provider",
    domain: "COURTLY_BEAUTY",
    supportedSlots: [STYLE_SLOTS.AESTHETIC_ELEGANCE],

    /**
     * Contribute courtly beauty / maiden elegance candidates.
     *
     * Strict activation conditions:
     * 1. Source contains explicit aesthetic visual or metaphor evidence.
     * 2. Candidate strictly modulates ONLY the dimension present in source.
     * 3. Zero invented skin texture, scent, body sexualization, or onlooker attraction.
     *
     * @param {Object} clauseIR
     * @param {Object} [context]
     * @returns {Array<Object>} StylistContribution[]
     */
    contribute(clauseIR, context = {}) {
      if (!clauseIR || !clauseIR.sourceZh) return [];

      const searchText = (context && context.translatedText) || clauseIR.sourceZh;
      const contributions = [];

      for (const def of COURTLY_BEAUTY_DEFINITIONS) {
        if (!def.pattern.test(searchText)) continue;

        // Negative assertion invariant validation
        const invariantCheck = validateAestheticInvariants(clauseIR, context, def);
        if (!invariantCheck.allowed) continue;

        contributions.push(
          createStylistContribution({
            providerId: "courtly-beauty-provider",
            domain: "COURTLY_BEAUTY",
            targetSlot: STYLE_SLOTS.AESTHETIC_ELEGANCE,
            dimension: "ATMOSPHERIC",
            sourceSpanZh: def.targetVi,
            candidateVi: def.candidateVi,
            semanticRequirements: {
              aestheticDimension: def.dimension,
              requiredEvidence: ["AESTHETIC_MAIDEN_EVIDENCE"],
              targetSlot: STYLE_SLOTS.AESTHETIC_ELEGANCE
            },
            semanticSignature: def.signature,
            tone: def.tone,
            register: def.signature.register,
            rhythmPreference: "POETIC_FLOW",
            lexicalPriority: def.priority,
            confidence: 0.92,
            semanticExpansionCost: 0.0,
            introducedInformation: [],
            introducedMetaphor: false,
            surfaceRealization: true,
            provenance: `courtly-beauty-provider:${def.ruleId}->${STYLE_SLOTS.AESTHETIC_ELEGANCE}:${def.dimension}`
          })
        );
      }

      return contributions;
    },

    getSuggestions(clauseIR, context = {}) {
      const contribs = this.contribute(clauseIR, context);
      const domainWeight = (context.domainWeights && context.domainWeights.COURTLY_BEAUTY) || 0.85;
      return Object.freeze({
        providerId: "courtly-beauty-provider",
        domain: "COURTLY_BEAUTY",
        confidence: domainWeight,
        contributions: Object.freeze(contribs),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createCourtlyBeautyProvider,
  validateAestheticInvariants,
  COURTLY_BEAUTY_DEFINITIONS,
  AESTHETIC_DIMENSIONS
};
