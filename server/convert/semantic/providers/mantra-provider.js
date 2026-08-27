"use strict";

/**
 * Mantra & Hand-Seal Mudra Provider (Wave B)
 * 
 * Provides semantic contributions for Daoist hand seals, mudras,
 * Great Dao mantras, incantations, and divine decrees ("Word as Law").
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const MANTRA_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "掐诀念咒",
    pattern: /掐诀念咒|捏诀念咒|bấm quyết niệm chú|bắt quyết niệm chú/,
    targetSlot: STYLE_SLOTS.MANTRA_SEAL,
    candidateVi: "mười ngón tay thoăn thoắt bấm niệm pháp quyết biến ảo khôn lường",
    signature: createSemanticSignature({
      denotation: "HAND_SEAL_INCANTATION",
      affectDistribution: { SOLEMN: 0.85, RESOLUTE: 0.85 },
      valence: 0.20,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["mười ngón tay thoăn thoắt"],
    surfaceRealization: true,
    semanticAssertions: ["NIMBLE_HAND_SEAL_EXECUTION"]
  },
  {
    targetZh: "口诵真言",
    pattern: /口诵真言|口诵道音|miệng tụng chân ngôn|miệng đọc chân ngôn/,
    targetSlot: STYLE_SLOTS.MANTRA_SEAL,
    candidateVi: "miệng ngâm xướng đại đạo chân ngôn vang vọng đất trời",
    signature: createSemanticSignature({
      denotation: "GREAT_DAO_MANTRA",
      affectDistribution: { SOLEMN: 0.95, TRANQUIL: 0.70 },
      valence: 0.30,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["vang vọng đất trời"],
    surfaceRealization: true,
    semanticAssertions: ["SACRED_DAO_MANTRA_CHANTING"]
  },
  {
    targetZh: "结出手印",
    pattern: /结出手印|结手印|kết xuất thủ ấn|kết thủ ấn/,
    targetSlot: STYLE_SLOTS.MANTRA_SEAL,
    candidateVi: "kết thủ ấn thần tốc triệu hoán sức mạnh thiên địa",
    signature: createSemanticSignature({
      denotation: "HAND_SEAL_MUDRAS",
      affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.80 },
      valence: 0.20,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["triệu hoán sức mạnh"],
    surfaceRealization: true,
    semanticAssertions: ["MUDRA_POWER_INVOCATION"]
  },
  {
    targetZh: "言出法随",
    pattern: /言出法随|ngôn xuất pháp tùy/,
    targetSlot: STYLE_SLOTS.WORD_AS_LAW,
    candidateVi: "ngôn xuất pháp tùy, lời nói ra tức là quy tắc của thiên địa",
    signature: createSemanticSignature({
      denotation: "WORD_AS_LAW",
      affectDistribution: { SOLEMN: 0.95, RESOLUTE: 0.90 },
      valence: 0.40,
      intensity: 0.95,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["quy tắc thiên địa"],
    surfaceRealization: true,
    semanticAssertions: ["REALITY_WARPING_DIVINE_COMMAND"]
  }
];

function createMantraProvider() {
  return Object.freeze({
    id: "mantra-provider",
    providerId: "mantra-provider",
    domain: "MANTRA_SEAL",
    supportedSlots: Object.freeze([
      STYLE_SLOTS.MANTRA_SEAL,
      STYLE_SLOTS.WORD_AS_LAW
    ]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.MANTRA_SEAL) || 0.85;

      for (const def of MANTRA_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "mantra-provider",
              domain: "MANTRA_SEAL",
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
              introducedMetaphor: def.introducedMetaphor || false,
              surfaceRealization: def.surfaceRealization,
              semanticAssertions: def.semanticAssertions,
              provenance: `mantra-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createMantraProvider,
  MANTRA_CONTRIBUTION_DEFINITIONS
};
