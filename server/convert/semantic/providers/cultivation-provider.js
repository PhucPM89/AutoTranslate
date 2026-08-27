"use strict";

/**
 * Cultivation Breakthrough & Heavenly Tribulations Provider (Phase 2)
 * Domain: CULTIVATION_BREAKTHROUGH
 */

const { createSemanticSignature } = require("../contracts");

const CULTIVATION_SUGGESTIONS = [
  {
    targetZh: "九天神雷",
    candidateVi: "cửu thiên thần lôi cuồn cuộn giáng xuống",
    signature: createSemanticSignature({
      denotation: "HEAVENLY_THUNDER",
      affectDistribution: { SOLEMN: 0.90, FEAR: 0.70, RESOLUTE: 0.80 },
      valence: -0.20,
      intensity: 0.95
    }),
    priority: 0.95
  },
  {
    targetZh: "天地异象",
    candidateVi: "dị tượng thiên địa chấn động càn khôn",
    signature: createSemanticSignature({
      denotation: "CELESTIAL_PHENOMENON",
      affectDistribution: { SURPRISE: 0.90, SOLEMN: 0.85 },
      valence: 0.30,
      intensity: 0.90
    }),
    priority: 0.95
  },
  {
    targetZh: "脱胎换骨",
    candidateVi: "tẩy tủy phạt cốt, thoát thai hoán cốt",
    signature: createSemanticSignature({
      denotation: "REBIRTH_PURIFICATION",
      affectDistribution: { JOY: 0.80, TRANQUIL: 0.70 },
      valence: 0.80,
      intensity: 0.85
    }),
    priority: 0.95
  }
];

function createCultivationProvider() {
  return Object.freeze({
    providerId: "cultivation-provider",
    domain: "CULTIVATION_BREAKTHROUGH",
    getSuggestions: (clauseIR, context) => {
      const text = clauseIR.sourceZh || "";
      const matched = [];

      for (const item of CULTIVATION_SUGGESTIONS) {
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
        providerId: "cultivation-provider",
        domain: "CULTIVATION_BREAKTHROUGH",
        confidence: context.domainWeights.CULTIVATION_BREAKTHROUGH || 0.8,
        suggestions: Object.freeze(matched),
        forbiddenPatterns: ["bình dị", "đời thường"]
      });
    }
  });
}

module.exports = {
  createCultivationProvider,
  CULTIVATION_SUGGESTIONS
};
