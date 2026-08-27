"use strict";

/**
 * Topography & Sacred Grounds Provider (Wave B)
 * 
 * Provides semantic contributions for immortal mountain scenery, spiritual mists,
 * sacred paradises, perilous precipices, and zones of severed vitality.
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const TOPOGRAPHY_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "灵气化雾",
    pattern: /灵气化雾|灵气如雾|linh khí hóa vụ|linh khí ngưng tụ thành sương mù/,
    targetSlot: STYLE_SLOTS.TOPOGRAPHY_LANDSCAPE,
    candidateVi: "linh khí đậm đặc ngưng tụ thành từng làn sương mờ ảo",
    signature: createSemanticSignature({
      denotation: "SPIRITUAL_MIST",
      affectDistribution: { TRANQUIL: 0.90, SOLEMN: 0.70 },
      valence: 0.50,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SERENE",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["đậm đặc"],
    surfaceRealization: true,
    semanticAssertions: ["DENSE_SPIRITUAL_ENERGY_MIST"]
  },
  {
    targetZh: "云雾缭绕",
    pattern: /云雾缭绕|烟雾缭绕|mây mù vờn quanh|mây mù lượn lờ/,
    targetSlot: STYLE_SLOTS.TOPOGRAPHY_LANDSCAPE,
    candidateVi: "mây mù lãng đãng vờn quanh đỉnh núi thiêng",
    signature: createSemanticSignature({
      denotation: "SACRED_MOUNTAIN_CLOUD",
      affectDistribution: { TRANQUIL: 0.90, SOLEMN: 0.75 },
      valence: 0.40,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.20 },
    tone: "SERENE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.85,
    expansionCost: 0.15,
    introducedInformation: ["đỉnh núi thiêng"],
    surfaceRealization: true,
    semanticAssertions: ["MOUNTAIN_SURROUNDED_BY_MIST"]
  },
  {
    targetZh: "洞天福地",
    pattern: /洞天福地|động thiên phúc địa/,
    targetSlot: STYLE_SLOTS.TOPOGRAPHY_LANDSCAPE,
    candidateVi: "động thiên phúc địa tràn đầy linh khí đất trời",
    signature: createSemanticSignature({
      denotation: "BLESSED_PARADISE",
      affectDistribution: { TRANQUIL: 0.90, JOY: 0.70 },
      valence: 0.60,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["linh khí đất trời"],
    surfaceRealization: true,
    semanticAssertions: ["SACRED_PARADISE_CULTIVATION_GROUND"]
  },
  {
    targetZh: "万丈悬崖",
    pattern: /万丈悬崖|绝壁万丈|vách đá muôn trượng/,
    targetSlot: STYLE_SLOTS.TOPOGRAPHY_LANDSCAPE,
    candidateVi: "vách đá dựng đứng muôn trượng hiểm trở vô cùng",
    signature: createSemanticSignature({
      denotation: "PRECIPICE_CLIFF",
      affectDistribution: { SOLEMN: 0.85, FEAR: 0.50 },
      valence: -0.10,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.85,
    expansionCost: 0.15,
    introducedInformation: ["hiểm trở vô cùng"],
    surfaceRealization: true,
    semanticAssertions: ["SHEER_DANGEROUS_CLIFF"]
  },
  {
    targetZh: "生机断绝",
    pattern: /生机断绝|sinh cơ đoạn tuyệt/,
    targetSlot: STYLE_SLOTS.SEVERED_VITALITY,
    candidateVi: "ngập tràn tử khí, sinh cơ đoạn tuyệt",
    signature: createSemanticSignature({
      denotation: "SEVERED_VITALITY",
      affectDistribution: { DESPAIR: 0.85, SOLEMN: 0.80 },
      valence: -0.60,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["ngập tràn tử khí"],
    surfaceRealization: true,
    semanticAssertions: ["TOTAL_ABSENCE_OF_LIFE"]
  },
  {
    targetZh: "死气滔天",
    pattern: /死气滔天|死气弥漫|tử khí ngập trời/,
    targetSlot: STYLE_SLOTS.SEVERED_VITALITY,
    candidateVi: "tử khí u ám cuồn cuộn ngút trời",
    signature: createSemanticSignature({
      denotation: "BILLOWING_DEATH_AURA",
      affectDistribution: { FEAR: 0.85, SOLEMN: 0.80 },
      valence: -0.70,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: ["u ám"],
    surfaceRealization: true,
    semanticAssertions: ["OMINOUS_DEATH_ENERGY"]
  }
];

function createTopographyProvider() {
  return Object.freeze({
    id: "topography-provider",
    providerId: "topography-provider",
    domain: "TOPOGRAPHY_LANDSCAPE",
    supportedSlots: Object.freeze([
      STYLE_SLOTS.TOPOGRAPHY_LANDSCAPE,
      STYLE_SLOTS.SEVERED_VITALITY
    ]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.TOPOGRAPHY_LANDSCAPE) || 0.85;

      for (const def of TOPOGRAPHY_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "topography-provider",
              domain: "TOPOGRAPHY_LANDSCAPE",
              targetSlot: def.targetSlot,
              sourceSpanZh: def.targetZh,
              candidateVi: def.candidateVi,
              semanticRequirements: def.semanticRequirements,
              semanticSignature: def.signature,
              tone: def.tone,
              register: "CLASSICAL_LITERARY",
              rhythmPreference: def.rhythmPreference,
              lexicalPriority: def.priority,
              confidence: Math.max(0.70, Number(domainWeight.toFixed(2))),
              forbiddenContexts: ["SLAPSTICK_COMEDY"],
              semanticExpansionCost: def.expansionCost,
              introducedInformation: def.introducedInformation,
              introducedMetaphor: def.introducedMetaphor || false,
              surfaceRealization: def.surfaceRealization,
              semanticAssertions: def.semanticAssertions,
              provenance: `topography-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createTopographyProvider,
  TOPOGRAPHY_CONTRIBUTION_DEFINITIONS
};
