"use strict";

/**
 * Zen Tea & Taoist Enlightenment Provider (Phase 2)
 * Domain: ZEN_TEA
 */

const { createSemanticSignature } = require("../contracts");

const ZEN_TEA_SUGGESTIONS = [
  {
    targetZh: "品茶",
    candidateVi: "thưởng trà đàm đạo",
    signature: createSemanticSignature({
      denotation: "TASTE_TEA",
      affectDistribution: { TRANQUIL: 0.90, SOLEMN: 0.50 },
      valence: 0.60,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    priority: 0.90
  },
  {
    targetZh: "心如止水",
    candidateVi: "tâm tịnh tựa mặt nước hồ thu",
    signature: createSemanticSignature({
      denotation: "CALM_MIND",
      affectDistribution: { TRANQUIL: 0.95, NEUTRAL: 0.70 },
      valence: 0.70,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    priority: 0.95
  },
  {
    targetZh: "顿悟",
    candidateVi: "bừng tỉnh đại ngộ",
    signature: createSemanticSignature({
      denotation: "EPIPHANY",
      affectDistribution: { TRANQUIL: 0.80, SURPRISE: 0.60, JOY: 0.70 },
      valence: 0.80,
      intensity: 0.85
    }),
    priority: 0.95
  }
];

function createZenTeaProvider() {
  return Object.freeze({
    providerId: "zen-tea-provider",
    domain: "ZEN_TEA",
    getSuggestions: (clauseIR, context) => {
      const text = clauseIR.sourceZh || "";
      const matched = [];

      for (const item of ZEN_TEA_SUGGESTIONS) {
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
        providerId: "zen-tea-provider",
        domain: "ZEN_TEA",
        confidence: context.domainWeights.ZEN_TEA || 0.8,
        suggestions: Object.freeze(matched),
        forbiddenPatterns: ["sát khí", "hung tàn", "điên cuồng"]
      });
    }
  });
}

module.exports = {
  createZenTeaProvider,
  ZEN_TEA_SUGGESTIONS
};
