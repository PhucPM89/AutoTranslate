"use strict";

/**
 * Sensory & Atmospheric Imagery Contribution Provider (Phase 2B - Wave C1)
 * Domain: SENSORY_ATMOSPHERE
 * 
 * Target Slots:
 * - ATMOSPHERIC_DETAIL (Sensory details: visual moonlight, olfactory scents, mist, thermal coldness)
 * - TOPOGRAPHY_LANDSCAPE (Mountain scenery, mist cover)
 * 
 * Architecture Invariants:
 * - Sensory Dimension Separation: VISUAL, OLFACTORY, THERMAL, SPATIAL.
 * - Metaphor Safety: Realize metaphors ONLY when present in source (e.g. 月光如水 has "如水").
 * - Zero ungrounded attribute invention (no invented taste, color, or sweetness unless in source).
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const SENSORY_CONTRIBUTION_DEFINITIONS = [
  // 1. Moonlight & Celestial Visual Atmosphere (月华如水 / 月色如水)
  {
    targetZh: "月华如水",
    pattern: /月华如水|月色如水|月光如水/,
    targetSlot: STYLE_SLOTS.ATMOSPHERIC_DETAIL,
    candidateVi: "ánh trăng vằng vặc như dòng nước bạc",
    signature: createSemanticSignature({
      denotation: "MOONLIGHT_WATER_METAPHOR",
      affectDistribution: { TRANQUIL: 0.90, ELEVATED: 0.80 },
      valence: 0.60,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.20 },
    tone: "SERENE",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: [],
    dimension: "VISUAL"
  },
  {
    targetZh: "月光洒落",
    pattern: /月光洒落|月色洒落|月华倾泻|月光照在/,
    targetSlot: STYLE_SLOTS.ATMOSPHERIC_DETAIL,
    candidateVi: "ánh trăng dịu mát rọi xuống",
    signature: createSemanticSignature({
      denotation: "MOONLIGHT_SHINING_PLAIN",
      affectDistribution: { TRANQUIL: 0.85 },
      valence: 0.50,
      intensity: 0.35,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.10 },
    tone: "SERENE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.85,
    expansionCost: 0.05,
    introducedInformation: [],
    dimension: "VISUAL"
  },

  // 2. Scents & Fragrances (幽香阵阵 / 香气扑鼻 - Olfactory)
  {
    targetZh: "幽香阵阵",
    pattern: /幽香阵阵|幽香扑鼻|幽香飘散/,
    targetSlot: STYLE_SLOTS.ATMOSPHERIC_DETAIL,
    candidateVi: "hương thơm thoang thoảng lan tỏa",
    signature: createSemanticSignature({
      denotation: "FAINT_FRAGRANCE",
      affectDistribution: { TRANQUIL: 0.85, ELEVATED: 0.70 },
      valence: 0.65,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.15 },
    tone: "SERENE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.05,
    introducedInformation: [],
    dimension: "OLFACTORY"
  },
  {
    targetZh: "香气扑鼻",
    pattern: /香气扑鼻|异香扑鼻|香气四溢/,
    targetSlot: STYLE_SLOTS.ATMOSPHERIC_DETAIL,
    candidateVi: "hương thơm ngạt ngào xộc vào mũi",
    signature: createSemanticSignature({
      denotation: "STRONG_FRAGRANCE",
      affectDistribution: { TRANQUIL: 0.75, ELEVATED: 0.65 },
      valence: 0.65,
      intensity: 0.55,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.20 },
    tone: "SERENE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: [],
    dimension: "OLFACTORY"
  },

  // 3. Mist & Spiritual Vapor (白雾氤氲 / 灵气氤氲 - Visual / Spatial)
  {
    targetZh: "白雾氤氲",
    pattern: /白雾氤氲|薄雾氤氲|云雾氤氲|白雾缭绕/,
    targetSlot: STYLE_SLOTS.ATMOSPHERIC_DETAIL,
    candidateVi: "mây mù trắng xóa lượn lờ bao phủ",
    signature: createSemanticSignature({
      denotation: "WHITE_MIST_SWIRL",
      affectDistribution: { TRANQUIL: 0.80, ELEVATED: 0.75 },
      valence: 0.50,
      intensity: 0.45,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.15 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: [],
    dimension: "VISUAL"
  },
  {
    targetZh: "灵气氤氲",
    pattern: /灵气氤氲|灵雾氤氲|灵气缭绕/,
    targetSlot: STYLE_SLOTS.TOPOGRAPHY_LANDSCAPE,
    candidateVi: "linh khí mịt mù lượn lờ tụ hội",
    signature: createSemanticSignature({
      denotation: "SPIRITUAL_QI_MIST",
      affectDistribution: { ELEVATED: 0.85, TRANQUIL: 0.70 },
      valence: 0.60,
      intensity: 0.55,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.20 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: [],
    dimension: "SPATIAL"
  },

  // 4. Coldness & Chill (寒意森然 / 寒风阵阵 / 寒光闪烁 - Thermal / Visual)
  {
    targetZh: "寒意森然",
    pattern: /寒意森然|冷意森然|寒气逼人/,
    targetSlot: STYLE_SLOTS.ATMOSPHERIC_DETAIL,
    candidateVi: "khí lạnh buốt giá thấu xương",
    signature: createSemanticSignature({
      denotation: "BITTER_COLD_CHILL",
      affectDistribution: { SOLEMN: 0.75, FIERCE: 0.65 },
      valence: 0.35,
      intensity: 0.65,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: [],
    dimension: "THERMAL"
  },
  {
    targetZh: "寒光闪烁",
    pattern: /寒光闪烁|寒光冷冽|寒芒闪烁|寒芒四射/,
    targetSlot: STYLE_SLOTS.ATMOSPHERIC_DETAIL,
    candidateVi: "ánh lạnh sắc bén lóe lên",
    signature: createSemanticSignature({
      denotation: "COLD_LIGHT_GLINT",
      affectDistribution: { RESOLUTE: 0.80, FIERCE: 0.70 },
      valence: 0.40,
      intensity: 0.65,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.25 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.05,
    introducedInformation: [],
    dimension: "VISUAL" // Strictly VISUAL, no ungrounded thermal injection
  },
  {
    targetZh: "杀气森然",
    pattern: /杀气森然|杀意森然/,
    targetSlot: STYLE_SLOTS.ATMOSPHERIC_DETAIL,
    candidateVi: "sát khí sắc lạnh thấu xương",
    signature: createSemanticSignature({
      denotation: "KILLING_INTENT_CHILL",
      affectDistribution: { FIERCE: 0.85, SOLEMN: 0.80 },
      valence: 0.20,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: [],
    dimension: "THERMAL"
  },

  // 5. Radiance & Cataclysm (血光冲天 / 金光万丈 / 天昏地暗 - Visual / Spatial)
  {
    targetZh: "血光冲天",
    pattern: /血光冲天|血光滔天/,
    targetSlot: STYLE_SLOTS.ATMOSPHERIC_DETAIL,
    candidateVi: "huyết quang đỏ thẫm ngút trời",
    signature: createSemanticSignature({
      denotation: "BLOOD_LIGHT_PILLAR",
      affectDistribution: { FIERCE: 0.90, AWE: 0.75 },
      valence: 0.20,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: [],
    dimension: "VISUAL"
  },
  {
    targetZh: "金光万丈",
    pattern: /金光万丈|金芒万丈|神光万道/,
    targetSlot: STYLE_SLOTS.ATMOSPHERIC_DETAIL,
    candidateVi: "ánh vàng rực rỡ vạn trượng",
    signature: createSemanticSignature({
      denotation: "GOLDEN_LIGHT_RADIANCE",
      affectDistribution: { ELEVATED: 0.90, AWE: 0.80 },
      valence: 0.75,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: [],
    dimension: "VISUAL"
  },
  {
    targetZh: "天昏地暗",
    pattern: /天昏地暗|日月无光|天地昏暗/,
    targetSlot: STYLE_SLOTS.ATMOSPHERIC_DETAIL,
    candidateVi: "trời đất tối sầm mù mịt",
    signature: createSemanticSignature({
      denotation: "DARKENED_SKY_EARTH",
      affectDistribution: { SOLEMN: 0.80, FIERCE: 0.75 },
      valence: 0.30,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: [],
    dimension: "SPATIAL"
  }
];

function createSensoryProvider() {
  return Object.freeze({
    providerId: "sensory-provider",
    domain: "SENSORY_ATMOSPHERE",
    supportedSlots: [STYLE_SLOTS.ATMOSPHERIC_DETAIL, STYLE_SLOTS.TOPOGRAPHY_LANDSCAPE],

    /**
     * Inspects a ClauseIR and produces StylistContributions.
     * 
     * @param {Object} clauseIR
     * @param {Object} [context]
     * @returns {Array<Object>} StylistContribution[]
     */
    contribute(clauseIR, context = {}) {
      if (!clauseIR || !clauseIR.sourceZh) return [];

      const contributions = [];
      const sourceZh = clauseIR.sourceZh;

      for (const def of SENSORY_CONTRIBUTION_DEFINITIONS) {
        if (def.pattern.test(sourceZh)) {
          // Verify semantic requirements
          if (def.semanticRequirements?.minIntensity !== undefined) {
            const currentIntensity = clauseIR.semanticSignature?.intensity ?? 0.5;
            if (currentIntensity < def.semanticRequirements.minIntensity) {
              continue;
            }
          }

          contributions.push(
            createStylistContribution({
              providerId: "sensory-provider",
              domain: "SENSORY_ATMOSPHERE",
              targetSlot: def.targetSlot,
              dimension: def.dimension || "ATMOSPHERIC",
              sourceSpanZh: def.targetZh,
              candidateVi: def.candidateVi,
              semanticRequirements: def.semanticRequirements,
              semanticSignature: def.signature,
              tone: def.tone,
              register: def.signature.register,
              rhythmPreference: def.rhythmPreference,
              lexicalPriority: def.priority,
              confidence: 0.95,
              semanticExpansionCost: def.expansionCost,
              introducedInformation: def.introducedInformation,
              introducedMetaphor: false,
              surfaceRealization: true,
              provenance: `sensory-provider:${def.targetZh}->${def.targetSlot}`
            })
          );
        }
      }

      return contributions;
    }
  });
}

module.exports = {
  createSensoryProvider,
  SENSORY_CONTRIBUTION_DEFINITIONS
};
