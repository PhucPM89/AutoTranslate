"use strict";

/**
 * Martial Action & Dynamic Combat Provider (Phase 2)
 * 
 * Provides high-impact martial choreography lexical contributions with strict Semantic Signatures.
 * Domain: COMBAT
 */

const { createSemanticSignature } = require("../contracts");

const ACTION_SUGGESTIONS = [
  // Sword & blade strikes
  {
    targetZh: "一剑斩出",
    candidateVi: "vung kiếm chém ra",
    signature: createSemanticSignature({
      denotation: "SWORD_SLASH",
      affectDistribution: { RESOLUTE: 0.85, HOSTILITY: 0.70 },
      valence: -0.20,
      intensity: 0.85
    }),
    priority: 0.95
  },
  {
    targetZh: "一剑斩去",
    candidateVi: "vung kiếm chém tới",
    signature: createSemanticSignature({
      denotation: "SWORD_SLASH",
      affectDistribution: { RESOLUTE: 0.85, HOSTILITY: 0.70 },
      valence: -0.20,
      intensity: 0.85
    }),
    priority: 0.95
  },
  {
    targetZh: "一剑刺出",
    candidateVi: "vung kiếm đâm thẳng tới",
    signature: createSemanticSignature({
      denotation: "SWORD_THRUST",
      affectDistribution: { RESOLUTE: 0.80, HOSTILITY: 0.70 },
      valence: -0.20,
      intensity: 0.85
    }),
    priority: 0.90
  },
  // Palm & fist dynamics
  {
    targetZh: "一掌拍出",
    candidateVi: "tung chưởng đánh tới",
    signature: createSemanticSignature({
      denotation: "PALM_STRIKE",
      affectDistribution: { RESOLUTE: 0.80, HOSTILITY: 0.60 },
      valence: -0.20,
      intensity: 0.80
    }),
    priority: 0.90
  },
  {
    targetZh: "一拳轰出",
    candidateVi: "tung ra một quyền oanh kích",
    signature: createSemanticSignature({
      denotation: "FIST_STRIKE",
      affectDistribution: { WRATH: 0.75, RESOLUTE: 0.80 },
      valence: -0.25,
      intensity: 0.90
    }),
    priority: 0.95
  },
  // Damage feedback
  {
    targetZh: "吐出一口鲜血",
    candidateVi: "hộc ra một ngụm máu tươi",
    signature: createSemanticSignature({
      denotation: "VOMIT_BLOOD",
      affectDistribution: { SORROW: 0.60, FEAR: 0.40 },
      valence: -0.70,
      intensity: 0.85
    }),
    priority: 0.95
  },
  {
    targetZh: "倒飞出去",
    candidateVi: "bị đánh văng ngược ra ngoài",
    signature: createSemanticSignature({
      denotation: "KNOCKED_BACK",
      affectDistribution: { FEAR: 0.50, SURPRISE: 0.60 },
      valence: -0.60,
      intensity: 0.80
    }),
    priority: 0.90
  }
];

function createActionProvider() {
  return Object.freeze({
    providerId: "action-provider",
    domain: "COMBAT",
    getSuggestions: (clauseIR, context) => {
      const text = clauseIR.sourceZh || "";
      const matched = [];

      for (const item of ACTION_SUGGESTIONS) {
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
        providerId: "action-provider",
        domain: "COMBAT",
        confidence: context.domainWeights.COMBAT || 0.8,
        suggestions: Object.freeze(matched),
        forbiddenPatterns: ["nhẹ nhàng mà", "khoan thai", "từ tốn"]
      });
    }
  });
}

module.exports = {
  createActionProvider,
  ACTION_SUGGESTIONS
};
