"use strict";

/**
 * Zen Tea & Taoist Enlightenment Contribution Provider (Phase 2A)
 * 
 * Generates structured StylistContributions targeting StyleSlots:
 * - TEA_PREPARATION (Brewing, pouring, placing cups)
 * - TEA_DISCOURSE (Tasting tea, philosophical dialogue)
 * - ZEN_STATE (Tranquil mind, epiphanies, mortal transcendence)
 * 
 * Domain: ZEN_TEA
 * STRICT ANTI-OVERWRITING: Simple actions (放下茶杯) MUST NOT hallucinate profound metaphors!
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const ZEN_TEA_CONTRIBUTION_DEFINITIONS = [
  // 1. TEA_PREPARATION
  {
    targetZh: "放下茶杯",
    pattern: /放下(?:了)?茶杯/,
    targetSlot: STYLE_SLOTS.TEA_PREPARATION,
    candidateVi: "đặt chén trà xuống",
    signature: createSemanticSignature({
      denotation: "PUT_DOWN_TEACUP",
      affectDistribution: { TRANQUIL: 0.60, NEUTRAL: 0.80 },
      valence: 0.10,
      intensity: 0.30,
      register: "VERNACULAR"
    }),
    semanticRequirements: { maxIntensity: 0.50 },
    tone: "SERENE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.0, // Zero expansion for simple physical actions!
    introducedInformation: []
  },
  {
    targetZh: "烹茶",
    pattern: /烹茶|煮茶|沏茶/,
    targetSlot: STYLE_SLOTS.TEA_PREPARATION,
    candidateVi: "đun nước pha trà",
    signature: createSemanticSignature({
      denotation: "BREW_TEA",
      affectDistribution: { TRANQUIL: 0.80, SOLEMN: 0.40 },
      valence: 0.30,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { maxIntensity: 0.60 },
    tone: "SERENE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: []
  },

  // 2. TEA_DISCOURSE
  {
    targetZh: "品茶",
    pattern: /品茶|品茗/,
    targetSlot: STYLE_SLOTS.TEA_DISCOURSE,
    candidateVi: "thưởng trà đàm đạo",
    signature: createSemanticSignature({
      denotation: "TASTE_TEA",
      affectDistribution: { TRANQUIL: 0.85, SOLEMN: 0.50 },
      valence: 0.30,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { maxIntensity: 0.60 },
    tone: "SERENE",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: ["đàm đạo"]
  },
  {
    targetZh: "烹茶论道",
    targetSlot: STYLE_SLOTS.TEA_DISCOURSE,
    candidateVi: "đun nước pha trà, cùng nhau đàm đạo",
    signature: createSemanticSignature({
      denotation: "TEA_DAO_DISCOURSE",
      affectDistribution: { TRANQUIL: 0.90, SOLEMN: 0.70 },
      valence: 0.60,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { maxIntensity: 0.60 },
    tone: "SERENE",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["cùng nhau đàm đạo"]
  },
  {
    targetZh: "茶香四溢",
    targetSlot: STYLE_SLOTS.TEA_DISCOURSE,
    candidateVi: "hương trà thanh khiết thoang thoảng bốn phía",
    signature: createSemanticSignature({
      denotation: "TEA_FRAGRANCE_DIFFUSE",
      affectDistribution: { TRANQUIL: 0.90, JOY: 0.50 },
      valence: 0.70,
      intensity: 0.45,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { maxIntensity: 0.60 },
    tone: "SERENE",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.92,
    expansionCost: 0.15,
    introducedInformation: ["thanh khiết"]
  },

  // 3. ZEN_STATE
  {
    targetZh: "心如止水",
    targetSlot: STYLE_SLOTS.ZEN_STATE,
    candidateVi: "tâm tịnh tựa mặt nước hồ thu",
    signature: createSemanticSignature({
      denotation: "CALM_MIND",
      affectDistribution: { TRANQUIL: 0.95, NEUTRAL: 0.70 },
      valence: 0.70,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { maxIntensity: 0.50 },
    tone: "SERENE",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.20,
    introducedInformation: ["mặt nước hồ thu"]
  },
  {
    targetZh: "顿悟",
    targetSlot: STYLE_SLOTS.ZEN_STATE,
    candidateVi: "trong khoảnh khắc bừng tỉnh đại ngộ",
    signature: createSemanticSignature({
      denotation: "EPIPHANY",
      affectDistribution: { TRANQUIL: 0.80, SURPRISE: 0.60, JOY: 0.70 },
      valence: 0.80,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["khoảnh khắc"]
  }
];

function createZenTeaProvider() {
  return Object.freeze({
    providerId: "zen-tea-provider",
    domain: "ZEN_TEA",
    getSuggestions: (clauseIR, context = {}) => {
      const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
      const domainWeight = (context && context.domainWeights && context.domainWeights.ZEN_TEA) || 0.0;
      const contributions = [];

      for (const def of ZEN_TEA_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(sourceZh)) || sourceZh.includes(def.targetZh)) {
          contributions.push(createStylistContribution({
            providerId: "zen-tea-provider",
            domain: "ZEN_TEA",
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
            forbiddenContexts: ["COMBAT", "SUPERNATURAL_HORROR", "VULGAR_SLANG"],
            semanticExpansionCost: def.expansionCost,
            introducedInformation: def.introducedInformation,
            introducedMetaphor: Boolean(def.introducedMetaphor),
            provenance: `zen-tea-provider:${def.targetZh}`
          }));
        }
      }

      return Object.freeze({
        providerId: "zen-tea-provider",
        domain: "ZEN_TEA",
        confidence: domainWeight,
        contributions: Object.freeze(contributions),
        forbiddenPatterns: ["sát khí", "hung tàn", "cuồng bạo", "oanh kích"]
      });
    }
  });
}

module.exports = {
  createZenTeaProvider,
  ZEN_TEA_CONTRIBUTION_DEFINITIONS
};
