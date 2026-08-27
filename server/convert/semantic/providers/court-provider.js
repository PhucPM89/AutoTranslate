"use strict";

/**
 * Court Politics & Imperial Decrees Provider (Phase 2)
 * Domain: COURT_POLITICS
 */

const { createSemanticSignature } = require("../contracts");

const COURT_SUGGESTIONS = [
  {
    targetZh: "奉天承运",
    candidateVi: "Phụng thiên thừa vận",
    signature: createSemanticSignature({
      denotation: "IMPERIAL_PROCLAMATION",
      affectDistribution: { SOLEMN: 0.95, RESOLUTE: 0.80 },
      valence: 0.20,
      intensity: 0.90,
      register: "SOLEMN_DECREE"
    }),
    priority: 0.98
  },
  {
    targetZh: "钦此",
    candidateVi: "Khâm thử!",
    signature: createSemanticSignature({
      denotation: "IMPERIAL_CONCLUSION",
      affectDistribution: { SOLEMN: 0.95 },
      valence: 0.0,
      intensity: 0.90,
      register: "SOLEMN_DECREE"
    }),
    priority: 0.98
  },
  {
    targetZh: "欺君之罪",
    candidateVi: "tội tày đình khi quân phạm thượng",
    signature: createSemanticSignature({
      denotation: "TREASON_CRIME",
      affectDistribution: { WRATH: 0.90, SOLEMN: 0.80 },
      valence: -0.80,
      intensity: 0.90
    }),
    priority: 0.95
  },
  {
    targetZh: "诛九族",
    candidateVi: "tội đáng tru di cửu tộc",
    signature: createSemanticSignature({
      denotation: "EXECUTION_NINE_CLANS",
      affectDistribution: { WRATH: 0.95, HOSTILITY: 0.90 },
      valence: -0.90,
      intensity: 0.98
    }),
    priority: 0.95
  }
];

function createCourtProvider() {
  return Object.freeze({
    providerId: "court-provider",
    domain: "COURT_POLITICS",
    getSuggestions: (clauseIR, context) => {
      const text = clauseIR.sourceZh || "";
      const matched = [];

      for (const item of COURT_SUGGESTIONS) {
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
        providerId: "court-provider",
        domain: "COURT_POLITICS",
        confidence: context.domainWeights.COURT_POLITICS || 0.8,
        suggestions: Object.freeze(matched),
        forbiddenPatterns: ["bỡn cợt", "tiếu lâm"]
      });
    }
  });
}

module.exports = {
  createCourtProvider,
  COURT_SUGGESTIONS
};
