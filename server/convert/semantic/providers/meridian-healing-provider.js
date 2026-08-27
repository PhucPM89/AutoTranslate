"use strict";

/**
 * Medical Diagnostics & Acupuncture Contribution Provider (Phase 2B - Wave A)
 * Domain: MEDICAL_HEALING
 * 
 * Target Slots:
 * - MERIDIAN_ACUPOINT (Acupuncture, needling techniques, meridian unclogging)
 * - HEALING_PURGE (Poison extraction, qi-blood stabilization)
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const MERIDIAN_HEALING_CONTRIBUTION_DEFINITIONS = [
  // 1. MERIDIAN_ACUPOINT
  {
    targetZh: "银针封穴",
    pattern: /银针封穴|金针封穴|下针封穴/,
    targetSlot: STYLE_SLOTS.MERIDIAN_ACUPOINT,
    candidateVi: "đầu ngón tay thoăn thoắt hạ ngân châm chuẩn xác phong tỏa đại huyệt",
    signature: createSemanticSignature({
      denotation: "ACUPUNCTURE_BLOCK",
      affectDistribution: { SOLEMN: 0.85, RESOLUTE: 0.80 },
      valence: 0.50,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.20,
    introducedInformation: ["chuẩn xác"]
  },
  {
    targetZh: "疏通经脉",
    pattern: /疏通经脉|打通经脉|开通经脉/,
    targetSlot: STYLE_SLOTS.MERIDIAN_ACUPOINT,
    candidateVi: "khai thông từng đường kinh mạch bế tắc",
    signature: createSemanticSignature({
      denotation: "UNCLOG_MERIDIAN",
      affectDistribution: { SOLEMN: 0.80, TRANQUIL: 0.60 },
      valence: 0.60,
      intensity: 0.65,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: ["bế tắc"]
  },

  // 2. HEALING_PURGE
  {
    targetZh: "逼出毒素",
    pattern: /逼出毒素|排出毒素|逼出体内剧毒/,
    targetSlot: STYLE_SLOTS.HEALING_PURGE,
    candidateVi: "ép toàn bộ độc tố đen kịt ra ngoài qua đầu ngón tay",
    signature: createSemanticSignature({
      denotation: "PURGE_TOXIN",
      affectDistribution: { SOLEMN: 0.85, RESOLUTE: 0.80 },
      valence: 0.50,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["đen kịt", "đầu ngón tay"]
  },
  {
    targetZh: "气血平复",
    pattern: /气血平复|气血平稳|气血平息/,
    targetSlot: STYLE_SLOTS.HEALING_PURGE,
    candidateVi: "khí huyết vốn đang nghịch loạn dần dần bình ổn trở lại",
    signature: createSemanticSignature({
      denotation: "STABILIZE_BLOOD_QI",
      affectDistribution: { TRANQUIL: 0.90, SOLEMN: 0.60 },
      valence: 0.70,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SERENE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["nghịch loạn"]
  }
];

function createMeridianHealingProvider() {
  return Object.freeze({
    providerId: "meridian-healing-provider",
    domain: "MEDICAL_HEALING",
    getSuggestions: (clauseIR, context = {}) => {
      const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
      const domainWeight = (context && context.domainWeights && context.domainWeights.MEDICAL_HEALING) || 0.0;
      const contributions = [];

      for (const def of MERIDIAN_HEALING_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(sourceZh)) || sourceZh.includes(def.targetZh)) {
          contributions.push(createStylistContribution({
            providerId: "meridian-healing-provider",
            domain: "MEDICAL_HEALING",
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
            introducedMetaphor: false,
            provenance: `meridian-healing-provider:${def.targetZh}`
          }));
        }
      }

      return Object.freeze({
        providerId: "meridian-healing-provider",
        domain: "MEDICAL_HEALING",
        confidence: domainWeight,
        contributions: Object.freeze(contributions),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createMeridianHealingProvider,
  MERIDIAN_HEALING_CONTRIBUTION_DEFINITIONS
};
