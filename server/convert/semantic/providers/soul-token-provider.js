"use strict";

/**
 * Soul Token & Life-Lamp Contribution Provider (Phase 2B - Wave A)
 * Domain: SOUL_TOKEN
 * 
 * Target Slots:
 * - SOUL_TOKEN_STATE (Life token shattering, soul lamp extinguishing, ancestral hall shocks, life flame extinguishing)
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const SOUL_TOKEN_CONTRIBUTION_DEFINITIONS = [
  // 1. SOUL_TOKEN_STATE
  {
    targetZh: "命牌碎裂",
    pattern: /命牌碎裂|命牌破裂|本命命牌碎裂/,
    targetSlot: STYLE_SLOTS.SOUL_TOKEN_STATE,
    candidateVi: "mệnh bài bản mệnh răng rắc vỡ vụn thành từng mảnh vụn",
    signature: createSemanticSignature({
      denotation: "LIFE_TOKEN_SHATTER",
      affectDistribution: { FEAR: 0.85, SURPRISE: 0.90, SOLEMN: 0.80 },
      valence: -0.70,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["răng rắc"]
  },
  {
    targetZh: "魂灯熄灭",
    pattern: /魂灯熄灭|本命魂灯熄灭/,
    targetSlot: STYLE_SLOTS.SOUL_TOKEN_STATE,
    candidateVi: "ngọn hồn đăng đại diện cho sinh mệnh bỗng nhiên phụt tắt",
    signature: createSemanticSignature({
      denotation: "SOUL_LAMP_EXTINGUISH",
      affectDistribution: { FEAR: 0.85, SOLEMN: 0.85, SURPRISE: 0.80 },
      valence: -0.75,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["sinh mệnh"]
  },
  {
    targetZh: "祖庙震动",
    pattern: /祖庙震动|宗门震动|祖堂震动/,
    targetSlot: STYLE_SLOTS.SOUL_TOKEN_STATE,
    candidateVi: "tổ miếu rung chuyển dữ dội, chấn động toàn bộ tông môn",
    signature: createSemanticSignature({
      denotation: "ANCESTRAL_HALL_SHOCK",
      affectDistribution: { SURPRISE: 0.90, SOLEMN: 0.85, FEAR: 0.70 },
      valence: -0.50,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.92,
    expansionCost: 0.15,
    introducedInformation: ["chấn động"]
  },
  {
    targetZh: "生命之火熄灭",
    pattern: /生命之火熄灭|生命之火消散/,
    targetSlot: STYLE_SLOTS.SOUL_TOKEN_STATE,
    candidateVi: "ngọn lửa sinh mệnh triệt để lụi tàn tiêu tán giữa đất trời",
    signature: createSemanticSignature({
      denotation: "LIFE_FLAME_EXTINGUISHED",
      affectDistribution: { MELANCHOLY: 0.85, SOLEMN: 0.90, FEAR: 0.70 },
      valence: -0.80,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.92,
    expansionCost: 0.15,
    introducedInformation: ["đất trời"]
  }
];

function createSoulTokenProvider() {
  return Object.freeze({
    providerId: "soul-token-provider",
    domain: "SOUL_TOKEN",
    getSuggestions: (clauseIR, context = {}) => {
      const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
      const domainWeight = (context && context.domainWeights && context.domainWeights.SOUL_TOKEN) || 0.0;
      const contributions = [];

      for (const def of SOUL_TOKEN_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(sourceZh)) || sourceZh.includes(def.targetZh)) {
          contributions.push(createStylistContribution({
            providerId: "soul-token-provider",
            domain: "SOUL_TOKEN",
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
            provenance: `soul-token-provider:${def.targetZh}`
          }));
        }
      }

      return Object.freeze({
        providerId: "soul-token-provider",
        domain: "SOUL_TOKEN",
        confidence: domainWeight,
        contributions: Object.freeze(contributions),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createSoulTokenProvider,
  SOUL_TOKEN_CONTRIBUTION_DEFINITIONS
};
