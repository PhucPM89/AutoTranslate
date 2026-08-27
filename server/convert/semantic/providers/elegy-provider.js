"use strict";

/**
 * Elegy & Memorial Epitaph Provider (Wave B)
 * 
 * Provides semantic contributions for tomb sacrifices, fallen heroes,
 * departed masters, soul calling, and solemn grief.
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const ELEGY_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "魂归来兮",
    pattern: /魂归来兮|hồn quy lai hề/,
    targetSlot: STYLE_SLOTS.ELEGY_SOUL_CALL,
    candidateVi: "hồn hỡi hồn ơi, xin hãy quy hồi nơi cố hương!",
    signature: createSemanticSignature({
      denotation: "SOUL_CALLING",
      affectDistribution: { DESPAIR: 0.85, SOLEMN: 0.90 },
      valence: -0.40,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "SOLEMN",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["xin hãy quy hồi"],
    surfaceRealization: true,
    semanticAssertions: ["SACRED_SOUL_SUMMONING"]
  },
  {
    targetZh: "含笑九泉",
    pattern: /含笑九泉|ngậm cười nơi chín suối|ngậm cười chín suối/,
    targetSlot: STYLE_SLOTS.ELEGY_SOUL_CALL,
    candidateVi: "nguyện cho người an lòng ngậm cười nơi chín suối",
    signature: createSemanticSignature({
      denotation: "NINE_SPRINGS_SMILE",
      affectDistribution: { TRANQUIL: 0.80, SOLEMN: 0.80 },
      valence: 0.10,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SERENE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["nguyện cho người an lòng"],
    surfaceRealization: true,
    semanticAssertions: ["PEACEFUL_AFTERLIFE_WISH"]
  },
  {
    targetZh: "英魂不灭",
    pattern: /英魂不灭|英魂永存|anh hồn bất diệt/,
    targetSlot: STYLE_SLOTS.ELEGY_HEROIC_SPIRIT,
    candidateVi: "anh hồn bất diệt, muôn đời khắc ghi",
    signature: createSemanticSignature({
      denotation: "HEROIC_SPIRIT_IMMORTAL",
      affectDistribution: { SOLEMN: 0.95, RESOLUTE: 0.85 },
      valence: 0.20,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: ["muôn đời khắc ghi"],
    surfaceRealization: true,
    semanticAssertions: ["HEROIC_SPIRIT_COMMEMORATION"]
  },
  {
    targetZh: "音容宛在",
    pattern: /音容宛在|âm dung uyển tại/,
    targetSlot: STYLE_SLOTS.ELEGY_HEROIC_SPIRIT,
    candidateVi: "nụ cười và giọng nói ấm áp tựa như vẫn còn văng vẳng bên tai",
    signature: createSemanticSignature({
      denotation: "DEPARTED_PRESENCE_REMAINS",
      affectDistribution: { DESPAIR: 0.60, TRANQUIL: 0.70 },
      valence: 0.0,
      intensity: 0.65,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SERENE",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["ấm áp"],
    surfaceRealization: true,
    semanticAssertions: ["MEMORY_OF_DECEASED"]
  },
  {
    targetZh: "阴阳隔绝",
    pattern: /阴阳两隔|阴阳隔绝|âm dương cách biệt/,
    targetSlot: STYLE_SLOTS.ELEGY_SOUL_CALL,
    candidateVi: "âm dương cách biệt, đôi ngả chia lìa đau xót",
    signature: createSemanticSignature({
      denotation: "YIN_YANG_SEPARATION",
      affectDistribution: { DESPAIR: 0.90, SOLEMN: 0.80 },
      valence: -0.70,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["đôi ngả chia lìa"],
    surfaceRealization: true,
    semanticAssertions: ["MORTAL_DEATH_PARTING"]
  }
];

function createElegyProvider() {
  return Object.freeze({
    id: "elegy-provider",
    providerId: "elegy-provider",
    domain: "ELEGY_LAMENT",
    supportedSlots: Object.freeze([
      STYLE_SLOTS.ELEGY_SOUL_CALL,
      STYLE_SLOTS.ELEGY_HEROIC_SPIRIT
    ]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.ELEGY_LAMENT) || 0.85;

      for (const def of ELEGY_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "elegy-provider",
              domain: "ELEGY_LAMENT",
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
              forbiddenContexts: ["SLAPSTICK_COMEDY", "VULGAR_SLANG"],
              semanticExpansionCost: def.expansionCost,
              introducedInformation: def.introducedInformation,
              introducedMetaphor: def.introducedMetaphor || false,
              surfaceRealization: def.surfaceRealization,
              semanticAssertions: def.semanticAssertions,
              provenance: `elegy-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createElegyProvider,
  ELEGY_CONTRIBUTION_DEFINITIONS
};
