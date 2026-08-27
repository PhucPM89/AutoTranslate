"use strict";

/**
 * Sword Dao & Weapon Intent Provider (Phase 2)
 * Domain: SWORD_DAO
 */

const { createSemanticSignature } = require("../contracts");

const SWORD_SUGGESTIONS = [
  {
    targetZh: "拔出长剑",
    candidateVi: "rút trường kiếm ra",
    signature: createSemanticSignature({
      denotation: "UNSHEATHE_SWORD",
      affectDistribution: { RESOLUTE: 0.85, SOLEMN: 0.60 },
      valence: -0.10,
      intensity: 0.80
    }),
    priority: 0.95
  },
  {
    targetZh: "长剑出鞘",
    candidateVi: "bảo kiếm tuốt khỏi vỏ",
    signature: createSemanticSignature({
      denotation: "UNSHEATHE_SWORD",
      affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.70 },
      valence: -0.10,
      intensity: 0.85
    }),
    priority: 0.95
  },
  {
    targetZh: "剑气纵横",
    candidateVi: "kiếm khí dọc ngang ngút trời",
    signature: createSemanticSignature({
      denotation: "SWORD_QI_SURGE",
      affectDistribution: { RESOLUTE: 0.90, HOSTILITY: 0.75 },
      valence: -0.20,
      intensity: 0.90
    }),
    priority: 0.90
  },
  {
    targetZh: "人剑合一",
    candidateVi: "người và kiếm hòa làm một",
    signature: createSemanticSignature({
      denotation: "SWORD_UNITY",
      affectDistribution: { TRANQUIL: 0.70, RESOLUTE: 0.80 },
      valence: 0.10,
      intensity: 0.85
    }),
    priority: 0.95
  }
];

function createSwordProvider() {
  return Object.freeze({
    providerId: "sword-provider",
    domain: "SWORD_DAO",
    getSuggestions: (clauseIR, context) => {
      const text = clauseIR.sourceZh || "";
      const matched = [];

      for (const item of SWORD_SUGGESTIONS) {
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
        providerId: "sword-provider",
        domain: "SWORD_DAO",
        confidence: context.domainWeights.SWORD_DAO || 0.8,
        suggestions: Object.freeze(matched),
        forbiddenPatterns: ["uốn éo", "mềm yếu"]
      });
    }
  });
}

module.exports = {
  createSwordProvider,
  SWORD_SUGGESTIONS
};
