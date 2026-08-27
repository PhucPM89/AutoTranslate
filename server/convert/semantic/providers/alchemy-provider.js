"use strict";

/**
 * Alchemy & Artifact Crafting Contribution Provider (Phase 2B - Wave A)
 * Domain: ALCHEMY
 * 
 * Target Slots:
 * - ALCHEMY_AROMA (Pill aromas, fragrance diffusion)
 * - ALCHEMY_FLAME (Cauldron dynamics, earth/true fire refinement, pill tribulation)
 * - ALCHEMY_POTENCY (Pill manifestation, pill lines, medicinal potency)
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const ALCHEMY_CONTRIBUTION_DEFINITIONS = [
  // 1. ALCHEMY_AROMA
  {
    targetZh: "丹香四溢",
    pattern: /丹香四溢|丹香四散|丹香弥漫|丹香飘散/,
    targetSlot: STYLE_SLOTS.ALCHEMY_AROMA,
    candidateVi: "đan hương ngào ngạt lan tỏa khắp bốn phía",
    signature: createSemanticSignature({
      denotation: "PILL_AROMA_DIFFUSE",
      affectDistribution: { JOY: 0.70, TRANQUIL: 0.60 },
      valence: 0.60,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.92,
    expansionCost: 0.10,
    introducedInformation: ["bốn phía"]
  },
  {
    targetZh: "丹香扑鼻",
    pattern: /丹香扑鼻|丹香扑面/,
    targetSlot: STYLE_SLOTS.ALCHEMY_AROMA,
    candidateVi: "đan hương ngào ngạt phả vào mặt",
    signature: createSemanticSignature({
      denotation: "PILL_AROMA_FACE",
      affectDistribution: { JOY: 0.65, SURPRISE: 0.50 },
      valence: 0.55,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: []
  },
  {
    targetZh: "药香浓郁",
    pattern: /药香浓郁|浓郁的药香/,
    targetSlot: STYLE_SLOTS.ALCHEMY_AROMA,
    candidateVi: "dược hương ngào ngạt xông vào mũi",
    signature: createSemanticSignature({
      denotation: "MEDICINE_AROMA",
      affectDistribution: { JOY: 0.60, TRANQUIL: 0.50 },
      valence: 0.50,
      intensity: 0.45,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: []
  },

  // 2. ALCHEMY_FLAME
  {
    targetZh: "炸炉",
    pattern: /炸炉|丹炉炸裂|丹炉爆炸/,
    targetSlot: STYLE_SLOTS.ALCHEMY_FLAME,
    candidateVi: "lò luyện đan nổ tung kinh hoàng",
    signature: createSemanticSignature({
      denotation: "CAULDRON_EXPLODE",
      affectDistribution: { FEAR: 0.70, SURPRISE: 0.85, WRATH: 0.50 },
      valence: -0.60,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["kinh hoàng"]
  },
  {
    targetZh: "地火淬炼",
    pattern: /地火淬炼|地火熔炼/,
    targetSlot: STYLE_SLOTS.ALCHEMY_FLAME,
    candidateVi: "tôi luyện trong Địa Hỏa cuộn trào",
    signature: createSemanticSignature({
      denotation: "EARTH_FIRE_REFINE",
      affectDistribution: { SOLEMN: 0.80, RESOLUTE: 0.70 },
      valence: 0.10,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.92,
    expansionCost: 0.10,
    introducedInformation: ["cuộn trào"]
  },
  {
    targetZh: "真火淬炼",
    pattern: /真火淬炼|真火熔炼|三昧真火/,
    targetSlot: STYLE_SLOTS.ALCHEMY_FLAME,
    candidateVi: "tôi luyện trong Chân Hỏa cuộn trào",
    signature: createSemanticSignature({
      denotation: "TRUE_FIRE_REFINE",
      affectDistribution: { SOLEMN: 0.85, RESOLUTE: 0.75 },
      valence: 0.15,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.92,
    expansionCost: 0.10,
    introducedInformation: ["cuộn trào"]
  },
  {
    targetZh: "丹劫降临",
    pattern: /丹劫降临|引动丹劫|丹劫/,
    targetSlot: STYLE_SLOTS.ALCHEMY_FLAME,
    candidateVi: "đan kiếp ầm ầm giáng lâm",
    signature: createSemanticSignature({
      denotation: "PILL_TRIBULATION",
      affectDistribution: { SOLEMN: 0.90, SURPRISE: 0.70, RESOLUTE: 0.70 },
      valence: 0.30,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: ["ầm ầm"]
  },

  // 3. ALCHEMY_POTENCY
  {
    targetZh: "凝丹",
    pattern: /凝丹出世|成丹出世|成丹|凝丹/,
    targetSlot: STYLE_SLOTS.ALCHEMY_POTENCY,
    candidateVi: "đan thành viên mãn, ngưng đan xuất thế",
    signature: createSemanticSignature({
      denotation: "PILL_FORMATION",
      affectDistribution: { JOY: 0.75, SOLEMN: 0.75 },
      valence: 0.35,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["viên mãn"]
  },
  {
    targetZh: "药力发作",
    pattern: /药力发作|药效发作/,
    targetSlot: STYLE_SLOTS.ALCHEMY_POTENCY,
    candidateVi: "dược lực hùng hậu bắt đầu phát huy tác dụng",
    signature: createSemanticSignature({
      denotation: "POTENCY_EFFECT",
      affectDistribution: { SOLEMN: 0.70, RESOLUTE: 0.65 },
      valence: 0.30,
      intensity: 0.65,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: ["hùng hậu"]
  },
  {
    targetZh: "药力精纯",
    pattern: /药力精纯|药效精纯/,
    targetSlot: STYLE_SLOTS.ALCHEMY_POTENCY,
    candidateVi: "dược lực hùng hậu tinh thuần",
    signature: createSemanticSignature({
      denotation: "PURE_POTENCY",
      affectDistribution: { JOY: 0.70, SOLEMN: 0.65 },
      valence: 0.60,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.05,
    introducedInformation: ["hùng hậu"]
  },
  {
    targetZh: "九道丹纹",
    pattern: /九道丹纹|九纹/,
    targetSlot: STYLE_SLOTS.ALCHEMY_POTENCY,
    candidateVi: "chín đạo đan văn tuyệt phẩm",
    signature: createSemanticSignature({
      denotation: "NINE_PILL_LINES",
      affectDistribution: { JOY: 0.90, SURPRISE: 0.80 },
      valence: 0.80,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: ["tuyệt phẩm"]
  }
];

function createAlchemyProvider() {
  return Object.freeze({
    providerId: "alchemy-provider",
    domain: "ALCHEMY",
    getSuggestions: (clauseIR, context = {}) => {
      const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
      const domainWeight = (context && context.domainWeights && context.domainWeights.ALCHEMY) || 0.0;
      const contributions = [];

      for (const def of ALCHEMY_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(sourceZh)) || sourceZh.includes(def.targetZh)) {
          contributions.push(createStylistContribution({
            providerId: "alchemy-provider",
            domain: "ALCHEMY",
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
            forbiddenContexts: ["SLAPSTICK_COMEDY", "VULGAR_SLANG"],
            semanticExpansionCost: def.expansionCost,
            introducedInformation: def.introducedInformation,
            introducedMetaphor: false,
            provenance: `alchemy-provider:${def.targetZh}`
          }));
        }
      }

      return Object.freeze({
        providerId: "alchemy-provider",
        domain: "ALCHEMY",
        confidence: domainWeight,
        contributions: Object.freeze(contributions),
        forbiddenPatterns: ["cợt nhả", "hài hước nhảm nhí"]
      });
    }
  });
}

module.exports = {
  createAlchemyProvider,
  ALCHEMY_CONTRIBUTION_DEFINITIONS
};
