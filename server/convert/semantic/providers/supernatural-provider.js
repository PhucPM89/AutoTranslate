"use strict";

/**
 * Folklore Supernatural & Taoist Exorcism Provider (Phase 2)
 * Domain: SUPERNATURAL_HORROR
 */

const { createSemanticSignature } = require("../contracts");

const SUPERNATURAL_SUGGESTIONS = [
  {
    targetZh: "红衣厉鬼",
    candidateVi: "lệ quỷ áo đỏ oán khí ngút trời",
    signature: createSemanticSignature({
      denotation: "RED_GHOST",
      affectDistribution: { FEAR: 0.90, HOSTILITY: 0.85 },
      valence: -0.85,
      intensity: 0.95,
      register: "CLASSICAL_LITERARY"
    }),
    priority: 0.95
  },
  {
    targetZh: "桃木剑",
    candidateVi: "kiếm gỗ đào trừ tà",
    signature: createSemanticSignature({
      denotation: "PEACH_WOOD_SWORD",
      affectDistribution: { SOLEMN: 0.85, RESOLUTE: 0.75 },
      valence: 0.10,
      intensity: 0.80
    }),
    priority: 0.90
  },
  {
    targetZh: "冥婚",
    candidateVi: "đoàn rước dâu minh hôn quỷ dị",
    signature: createSemanticSignature({
      denotation: "GHOST_MARRIAGE",
      affectDistribution: { FEAR: 0.85, MELANCHOLY: 0.70 },
      valence: -0.75,
      intensity: 0.90
    }),
    priority: 0.95
  },
  {
    targetZh: "阴兵借道",
    candidateVi: "đoàn âm binh mượn đường",
    signature: createSemanticSignature({
      denotation: "GHOST_ARMY_MARCH",
      affectDistribution: { FEAR: 0.90, SOLEMN: 0.80 },
      valence: -0.80,
      intensity: 0.95
    }),
    priority: 0.95
  },
  {
    targetZh: "尸变",
    candidateVi: "thi thể thi biến thành cương thi",
    signature: createSemanticSignature({
      denotation: "CORPSE_TRANSFORMATION",
      affectDistribution: { FEAR: 0.90, SURPRISE: 0.70 },
      valence: -0.80,
      intensity: 0.90
    }),
    priority: 0.95
  }
];

function createSupernaturalProvider() {
  return Object.freeze({
    providerId: "supernatural-provider",
    domain: "SUPERNATURAL_HORROR",
    getSuggestions: (clauseIR, context) => {
      const text = clauseIR.sourceZh || "";
      const matched = [];

      for (const item of SUPERNATURAL_SUGGESTIONS) {
        if (text.includes(item.targetZh)) {
          matched.push({
            slotId: item.targetZh,
            candidateVi: item.candidateVi,
            signature: item.signature,
            priority: item.priority
          });
        }
      }

      return Object.freeze({
        providerId: "supernatural-provider",
        domain: "SUPERNATURAL_HORROR",
        confidence: context.domainWeights.SUPERNATURAL_HORROR || 0.8,
        suggestions: Object.freeze(matched),
        forbiddenPatterns: ["hài hước", "cợt nhả", "ngọt ngào"]
      });
    }
  });
}

module.exports = {
  createSupernaturalProvider,
  SUPERNATURAL_SUGGESTIONS
};
