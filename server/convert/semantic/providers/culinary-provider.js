"use strict";

/**
 * Culinary & Immortal Banquet Contribution Provider (Phase 2B - Wave A)
 * Domain: CULINARY
 * 
 * Target Slots:
 * - CULINARY_DELICACY (Immortal wines, spiritual dishes, feast spreads)
 * - CULINARY_SENSATION (Mouthfeel, lingering aftertaste, banquet toasts)
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const CULINARY_CONTRIBUTION_DEFINITIONS = [
  // 1. CULINARY_DELICACY
  {
    targetZh: "琼浆玉液",
    pattern: /琼浆玉液|琼浆美酒/,
    targetSlot: STYLE_SLOTS.CULINARY_DELICACY,
    candidateVi: "mỹ tửu quỳnh tương ngọc dịch thơm nồng ngất ngây",
    signature: createSemanticSignature({
      denotation: "IMMORTAL_WINE",
      affectDistribution: { JOY: 0.85, TRANQUIL: 0.70 },
      valence: 0.75,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["thơm nồng ngất ngây"]
  },
  {
    targetZh: "珍馐美味",
    pattern: /珍馐美味|山珍海味|珍馐佳肴/,
    targetSlot: STYLE_SLOTS.CULINARY_DELICACY,
    candidateVi: "trân tu mỹ vị, cao lương mỹ vị bày la liệt khắp bàn tiệc",
    signature: createSemanticSignature({
      denotation: "FEAST_DELICACIES",
      affectDistribution: { JOY: 0.80, TRANQUIL: 0.60 },
      valence: 0.70,
      intensity: 0.55,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.35 },
    tone: "ELEVATED",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.92,
    expansionCost: 0.15,
    introducedInformation: ["bàn tiệc"]
  },

  // 2. CULINARY_SENSATION
  {
    targetZh: "入口即化",
    pattern: /入口即化|入口化开/,
    targetSlot: STYLE_SLOTS.CULINARY_SENSATION,
    candidateVi: "vừa chạm vào đầu lưỡi đã tan chảy, đọng lại vị ngọt thanh khiết nơi cuống họng",
    signature: createSemanticSignature({
      denotation: "MELT_IN_MOUTH",
      affectDistribution: { JOY: 0.90, TRANQUIL: 0.75 },
      valence: 0.80,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "SERENE",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.20,
    introducedInformation: ["thanh khiết"]
  },
  {
    targetZh: "齿颊留香",
    pattern: /齿颊留香|口齿留香|唇齿留香/,
    targetSlot: STYLE_SLOTS.CULINARY_SENSATION,
    candidateVi: "dư vị thơm ngát vấn vương mãi nơi đầu môi khóe miệng",
    signature: createSemanticSignature({
      denotation: "LINGERING_FRAGRANCE",
      affectDistribution: { JOY: 0.80, TRANQUIL: 0.80 },
      valence: 0.75,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SERENE",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["vấn vương"]
  },
  {
    targetZh: "推杯换盏",
    pattern: /推杯换盏|觥筹交错/,
    targetSlot: STYLE_SLOTS.CULINARY_SENSATION,
    candidateVi: "chén tạc chén thù, cùng nhau nâng ly cạn chén vô cùng rôm rả",
    signature: createSemanticSignature({
      denotation: "BANQUET_TOASTS",
      affectDistribution: { JOY: 0.85, AMUSEMENT: 0.60 },
      valence: 0.70,
      intensity: 0.65,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["rôm rả"]
  }
];

function createCulinaryProvider() {
  return Object.freeze({
    providerId: "culinary-provider",
    domain: "CULINARY",
    getSuggestions: (clauseIR, context = {}) => {
      const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
      const domainWeight = (context && context.domainWeights && context.domainWeights.CULINARY) || 0.0;
      const contributions = [];

      for (const def of CULINARY_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(sourceZh)) || sourceZh.includes(def.targetZh)) {
          contributions.push(createStylistContribution({
            providerId: "culinary-provider",
            domain: "CULINARY",
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
            forbiddenContexts: ["COMBAT", "SUPERNATURAL_HORROR"],
            semanticExpansionCost: def.expansionCost,
            introducedInformation: def.introducedInformation,
            introducedMetaphor: false,
            provenance: `culinary-provider:${def.targetZh}`
          }));
        }
      }

      return Object.freeze({
        providerId: "culinary-provider",
        domain: "CULINARY",
        confidence: domainWeight,
        contributions: Object.freeze(contributions),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createCulinaryProvider,
  CULINARY_CONTRIBUTION_DEFINITIONS
};
