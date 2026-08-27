"use strict";

/**
 * Time Skips & Solitary Transcendence Provider (Wave B)
 * 
 * Provides semantic contributions for millennium time jumps, transience of mortals,
 * solitary pursuit of the Great Dao, and observing mortal worldly epochs.
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const TRANSCENDENCE_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "弹指千年",
    pattern: /弹指千年|岁月如梭|时光飞逝|búng tay ngàn năm|tuế nguyệt như thoi|năm tháng như thoi/,
    targetSlot: STYLE_SLOTS.TRANSCENDENCE_TIME,
    candidateVi: "thấm thoắt ngàn năm trôi qua chỉ tựa một cái chớp mắt",
    signature: createSemanticSignature({
      denotation: "MILLENNIUM_TIME_SKIP",
      affectDistribution: { SOLEMN: 0.90, TRANQUIL: 0.80 },
      valence: 0.10,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "SERENE",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["chỉ tựa một cái chớp mắt"],
    introducedMetaphor: false,
    surfaceRealization: true,
    semanticAssertions: ["IMMORTAL_TIME_DILATION_PERCEPTION"]
  },
  {
    targetZh: "物是人非",
    pattern: /物是人非|vật là người phi|vật còn người mất/,
    targetSlot: STYLE_SLOTS.TRANSCENDENCE_TIME,
    candidateVi: "cảnh còn người mất, vật đổi sao dời",
    signature: createSemanticSignature({
      denotation: "MORTAL_CHANGE_TRANSIENCE",
      affectDistribution: { DESPAIR: 0.60, SOLEMN: 0.80 },
      valence: -0.20,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["vật đổi sao dời"],
    surfaceRealization: true,
    semanticAssertions: ["EPHEMERAL_MORTAL_EPOCH"]
  },
  {
    targetZh: "大道独行",
    pattern: /大道独行|đại đạo độc hành/,
    targetSlot: STYLE_SLOTS.SOLITARY_DAO,
    candidateVi: "độc bước trên con đường đại đạo thênh thang nhưng cô tịch",
    signature: createSemanticSignature({
      denotation: "SOLITARY_DAO",
      affectDistribution: { SOLEMN: 0.95, RESOLUTE: 0.85 },
      valence: 0.10,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["nhưng cô tịch"],
    surfaceRealization: true,
    semanticAssertions: ["LONELY_IMMORTAL_PATH"]
  },
  {
    targetZh: "看尽人间繁华",
    pattern: /看尽人间繁华|阅尽人间繁华|nhìn hết nhân gian phồn hoa|ngắm nhìn hết phồn hoa nhân gian/,
    targetSlot: STYLE_SLOTS.TRANSCENDENCE_TIME,
    candidateVi: "ngắm nhìn hết thăng trầm dâu bể và phồn hoa chốn nhân gian",
    signature: createSemanticSignature({
      denotation: "OBSERVING_MORTAL_EPOCHS",
      affectDistribution: { TRANQUIL: 0.90, SOLEMN: 0.75 },
      valence: 0.30,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SERENE",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["thăng trầm dâu bể"],
    surfaceRealization: true,
    semanticAssertions: ["IMMORTAL_WATCHING_MORTALITY"]
  }
];

function createTranscendenceProvider() {
  return Object.freeze({
    id: "transcendence-provider",
    providerId: "transcendence-provider",
    domain: "TRANSCENDENCE_TIME",
    supportedSlots: Object.freeze([
      STYLE_SLOTS.TRANSCENDENCE_TIME,
      STYLE_SLOTS.SOLITARY_DAO
    ]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.TRANSCENDENCE_TIME) || 0.85;

      for (const def of TRANSCENDENCE_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "transcendence-provider",
              domain: "TRANSCENDENCE_TIME",
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
              provenance: `transcendence-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createTranscendenceProvider,
  TRANSCENDENCE_CONTRIBUTION_DEFINITIONS
};
