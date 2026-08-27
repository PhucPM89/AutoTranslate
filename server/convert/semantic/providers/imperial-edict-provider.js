"use strict";

/**
 * Imperial Decrees & Royal Proclamations Provider (Wave B)
 * 
 * Provides semantic contributions for imperial edicts, court decrees,
 * royal salutations, diplomatic letters of state, and solemn palace oaths.
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const IMPERIAL_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "奉天承运皇帝诏曰",
    pattern: /奉天承运皇帝诏曰|奉天承运|phụng thiên thừa vận hoàng đế chiếu viết|phụng thiên thừa vận/,
    targetSlot: STYLE_SLOTS.IMPERIAL_PROCLAMATION,
    candidateVi: "Phụng thiên thừa vận, Hoàng đế chiếu viết",
    signature: createSemanticSignature({
      denotation: "IMPERIAL_PROCLAMATION",
      affectDistribution: { SOLEMN: 0.95, RESOLUTE: 0.85 },
      valence: 0.30,
      intensity: 0.85,
      register: "SOLEMN_DECREE"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.05,
    introducedInformation: [],
    surfaceRealization: true,
    semanticAssertions: ["OFFICIAL_IMPERIAL_EDICT_OPENING"]
  },
  {
    targetZh: "钦此",
    pattern: /钦此|khâm thử/,
    targetSlot: STYLE_SLOTS.IMPERIAL_PROCLAMATION,
    candidateVi: "Khâm thử!",
    signature: createSemanticSignature({
      denotation: "IMPERIAL_DISMISSAL",
      affectDistribution: { SOLEMN: 0.95 },
      valence: 0.20,
      intensity: 0.80,
      register: "SOLEMN_DECREE"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SOLEMN",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.0,
    introducedInformation: [],
    surfaceRealization: true,
    semanticAssertions: ["IMPERIAL_EDICT_CLOSING"]
  },
  {
    targetZh: "领旨谢恩",
    pattern: /领旨谢恩|接旨谢恩|lãnh chỉ tạ ân|tiếp chỉ tạ ân/,
    targetSlot: STYLE_SLOTS.IMPERIAL_SALUTATION,
    candidateVi: "khâm tuân thánh chỉ, khấu đầu tạ ơn long ân hạo đãng",
    signature: createSemanticSignature({
      denotation: "DRAGON_THRONE_GRATITUDE",
      affectDistribution: { SOLEMN: 0.90, TRANQUIL: 0.70 },
      valence: 0.40,
      intensity: 0.75,
      register: "SOLEMN_DECREE"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["long ân hạo đãng"],
    surfaceRealization: true,
    semanticAssertions: ["KOWTOW_OF_ROYAL_GRATITUDE"]
  },
  {
    targetZh: "万岁万万岁",
    pattern: /吾皇万岁万岁万万岁|万岁万岁万万岁|万岁万万岁|vạn tuế vạn vạn tuế|vạn tuế vạn tuế vạn vạn tuế/,
    targetSlot: STYLE_SLOTS.IMPERIAL_SALUTATION,
    candidateVi: "tiếng hô vạn tuế, vạn tuế, vạn vạn tuế vang dội khắp cung điện",
    signature: createSemanticSignature({
      denotation: "TEN_THOUSAND_YEARS",
      affectDistribution: { SOLEMN: 0.95, JOY: 0.70 },
      valence: 0.50,
      intensity: 0.85,
      register: "SOLEMN_DECREE"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["vang dội khắp cung điện"],
    surfaceRealization: true,
    semanticAssertions: ["COURT_MASS_SALUTATION"]
  },
  {
    targetZh: "呈递国书",
    pattern: /呈递国书|奉上国书|đệ trình quốc thư|dâng lên quốc thư/,
    targetSlot: STYLE_SLOTS.IMPERIAL_SALUTATION,
    candidateVi: "sứ thần các nước cung kính đệ trình quốc thư giao hảo",
    signature: createSemanticSignature({
      denotation: "STATE_LETTER_PRESENTATION",
      affectDistribution: { SOLEMN: 0.90, TRANQUIL: 0.70 },
      valence: 0.30,
      intensity: 0.70,
      register: "SOLEMN_DECREE"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.85,
    expansionCost: 0.15,
    introducedInformation: ["sứ thần các nước"],
    surfaceRealization: true,
    semanticAssertions: ["DIPLOMATIC_ENVOY_SUBMISSION"]
  }
];

function createImperialEdictProvider() {
  return Object.freeze({
    id: "imperial-edict-provider",
    providerId: "imperial-edict-provider",
    domain: "IMPERIAL_DECREE",
    supportedSlots: Object.freeze([
      STYLE_SLOTS.IMPERIAL_PROCLAMATION,
      STYLE_SLOTS.IMPERIAL_SALUTATION
    ]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.IMPERIAL_DECREE) || 0.85;

      for (const def of IMPERIAL_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "imperial-edict-provider",
              domain: "IMPERIAL_DECREE",
              targetSlot: def.targetSlot,
              sourceSpanZh: def.targetZh,
              candidateVi: def.candidateVi,
              semanticRequirements: def.semanticRequirements,
              semanticSignature: def.signature,
              tone: def.tone,
              register: "SOLEMN_DECREE",
              rhythmPreference: def.rhythmPreference,
              lexicalPriority: def.priority,
              confidence: Math.max(0.70, Number(domainWeight.toFixed(2))),
              forbiddenContexts: ["SLAPSTICK_COMEDY"],
              semanticExpansionCost: def.expansionCost,
              introducedInformation: def.introducedInformation,
              introducedMetaphor: def.introducedMetaphor || false,
              surfaceRealization: def.surfaceRealization,
              semanticAssertions: def.semanticAssertions,
              provenance: `imperial-edict-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createImperialEdictProvider,
  IMPERIAL_CONTRIBUTION_DEFINITIONS
};
