"use strict";

/**
 * Auction House & Bidding War Contribution Provider (Phase 2B - Wave A)
 * Domain: AUCTION
 * 
 * Target Slots:
 * - AUCTION_EVENT (Hall silence, gasps of awe, hammer strikes, astronomical bids)
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const AUCTION_CONTRIBUTION_DEFINITIONS = [
  // 1. AUCTION_EVENT
  {
    targetZh: "全场寂静",
    pattern: /全场寂静|全场死寂|全场一片寂静/,
    targetSlot: STYLE_SLOTS.AUCTION_EVENT,
    candidateVi: "toàn bộ hội trường im phăng phắc như tờ, không một tiếng động",
    signature: createSemanticSignature({
      denotation: "HALL_SILENCE",
      affectDistribution: { SURPRISE: 0.85, SOLEMN: 0.80 },
      valence: -0.10,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.92,
    expansionCost: 0.15,
    introducedInformation: ["như tờ"]
  },
  {
    targetZh: "倒吸一口凉气",
    pattern: /倒吸一口凉气|倒抽一口凉气/,
    targetSlot: STYLE_SLOTS.AUCTION_EVENT,
    candidateVi: "hít vào một hơi khí lạnh",
    signature: createSemanticSignature({
      denotation: "GASP_COLD_AIR",
      affectDistribution: { SURPRISE: 0.90, FEAR: 0.60 },
      valence: -0.30,
      intensity: 0.75,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.05,
    introducedInformation: []
  },
  {
    targetZh: "一锤定音",
    pattern: /一锤定音|落锤定音/,
    targetSlot: STYLE_SLOTS.AUCTION_EVENT,
    candidateVi: "tiếng búa chốt giá dứt khoát vang lên giòn giã",
    signature: createSemanticSignature({
      denotation: "HAMMER_DROP",
      affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.80 },
      valence: 0.50,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["giòn giã"]
  },
  {
    targetZh: "势在必得",
    pattern: /势在必得|志在必得/,
    targetSlot: STYLE_SLOTS.AUCTION_EVENT,
    candidateVi: "ánh mắt rực lửa quyết tâm đoạt bằng được",
    signature: createSemanticSignature({
      denotation: "DETERMINED_TO_WIN",
      affectDistribution: { RESOLUTE: 0.95, SOLEMN: 0.70 },
      valence: 0.40,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.92,
    expansionCost: 0.15,
    introducedInformation: ["rực lửa"]
  },
  {
    targetZh: "天价",
    pattern: /天价|惊人天价/,
    targetSlot: STYLE_SLOTS.AUCTION_EVENT,
    candidateVi: "mức giá trên trời không tưởng",
    signature: createSemanticSignature({
      denotation: "ASTRONOMICAL_PRICE",
      affectDistribution: { SURPRISE: 0.90, SOLEMN: 0.60 },
      valence: 0.30,
      intensity: 0.80,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: ["không tưởng"]
  }
];

function createAuctionProvider() {
  return Object.freeze({
    providerId: "auction-provider",
    domain: "AUCTION",
    getSuggestions: (clauseIR, context = {}) => {
      const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
      const domainWeight = (context && context.domainWeights && context.domainWeights.AUCTION) || 0.0;
      const contributions = [];

      for (const def of AUCTION_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(sourceZh)) || sourceZh.includes(def.targetZh)) {
          contributions.push(createStylistContribution({
            providerId: "auction-provider",
            domain: "AUCTION",
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
            provenance: `auction-provider:${def.targetZh}`
          }));
        }
      }

      return Object.freeze({
        providerId: "auction-provider",
        domain: "AUCTION",
        confidence: domainWeight,
        contributions: Object.freeze(contributions),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createAuctionProvider,
  AUCTION_CONTRIBUTION_DEFINITIONS
};
