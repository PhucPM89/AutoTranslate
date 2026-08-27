"use strict";

/**
 * Karma, Reincarnation & Destiny Provider (Wave B)
 * 
 * Provides semantic contributions for karmic entanglements, severing karma,
 * nine samsara reincarnations, past-life awakenings, and destined duels.
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const KARMA_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "因果缠绕",
    pattern: /因果缠身|因果缠绕|nhân quả quấn quanh|nhân quả quấn thân/,
    targetSlot: STYLE_SLOTS.KARMA_SAMSARA,
    candidateVi: "sợi tơ nhân quả chằng chịt quấn quanh số phận",
    signature: createSemanticSignature({
      denotation: "KARMIC_THREAD",
      affectDistribution: { SOLEMN: 0.85, DESPAIR: 0.50 },
      valence: -0.20,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["sợi tơ"],
    introducedMetaphor: false,
    surfaceRealization: true,
    semanticAssertions: ["KARMIC_ENTANGLEMENT"]
  },
  {
    targetZh: "斩断因果",
    pattern: /斩断因果|chém đứt nhân quả/,
    targetSlot: STYLE_SLOTS.KARMA_SAMSARA,
    candidateVi: "vung kiếm chém đứt mọi sợi tơ nhân quả nghiệp duyên",
    signature: createSemanticSignature({
      denotation: "SEVER_KARMA",
      affectDistribution: { RESOLUTE: 0.95, SOLEMN: 0.85 },
      valence: 0.30,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["vung kiếm"],
    introducedMetaphor: false,
    surfaceRealization: true,
    semanticAssertions: ["SEVERING_REINCARNATION_TIES"]
  },
  {
    targetZh: "九世轮回",
    pattern: /九世轮回|百世轮回|chín kiếp luân hồi|cửu thế luân hồi/,
    targetSlot: STYLE_SLOTS.KARMA_SAMSARA,
    candidateVi: "trải qua chín kiếp luân hồi chìm nổi trong bể khổ",
    signature: createSemanticSignature({
      denotation: "NINE_REINCARNATIONS",
      affectDistribution: { SOLEMN: 0.90, DESPAIR: 0.60 },
      valence: -0.30,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["trong bể khổ"],
    surfaceRealization: true,
    semanticAssertions: ["SAMSARA_CYCLES_EXPERIENCED"]
  },
  {
    targetZh: "宿慧觉醒",
    pattern: /宿慧觉醒|前世记忆觉醒|túc huệ thức tỉnh|ký ức kiếp trước thức tỉnh/,
    targetSlot: STYLE_SLOTS.DESTINED_DUEL,
    candidateVi: "ký ức tiền kiếp từ thời hồng hoang ầm ầm thức tỉnh",
    signature: createSemanticSignature({
      denotation: "PAST_LIFE_AWAKENING",
      affectDistribution: { SURPRISE: 0.85, SOLEMN: 0.85 },
      valence: 0.40,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.20,
    introducedInformation: ["từ thời hồng hoang"],
    surfaceRealization: true,
    semanticAssertions: ["ANCIENT_MEMORY_RECALL"]
  },
  {
    targetZh: "宿命对决",
    pattern: /宿命对决|命运对决|trận đấu định mệnh|quyết đấu số mệnh/,
    targetSlot: STYLE_SLOTS.DESTINED_DUEL,
    candidateVi: "trận quyết đấu định mệnh đã được an bài từ ngàn năm trước",
    signature: createSemanticSignature({
      denotation: "DESTINED_DUEL",
      affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.85 },
      valence: 0.10,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.20,
    introducedInformation: ["từ ngàn năm trước"],
    surfaceRealization: true,
    semanticAssertions: ["DESTINED_FATAL_CLASH"]
  }
];

function createKarmaProvider() {
  return Object.freeze({
    id: "karma-provider",
    providerId: "karma-provider",
    domain: "KARMA_SAMSARA",
    supportedSlots: Object.freeze([
      STYLE_SLOTS.KARMA_SAMSARA,
      STYLE_SLOTS.DESTINED_DUEL
    ]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.KARMA_SAMSARA) || 0.85;

      for (const def of KARMA_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "karma-provider",
              domain: "KARMA_SAMSARA",
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
              provenance: `karma-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createKarmaProvider,
  KARMA_CONTRIBUTION_DEFINITIONS
};
