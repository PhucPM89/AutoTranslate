"use strict";

/**
 * Eldritch & Cosmic Horror Provider (Wave B)
 * 
 * Provides semantic contributions for unspeakable horrors, cosmic insanity,
 * void whispers, sanity collapse, and grotesque demonic mutations.
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const ELDRITCH_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "不可名状",
    pattern: /不可名状|bất khả danh trạng/,
    targetSlot: STYLE_SLOTS.ELDRITCH_HORROR,
    candidateVi: "bất khả danh trạng, quái dị vượt xa tầm hiểu biết của nhân loại",
    signature: createSemanticSignature({
      denotation: "UNSPEAKABLE_HORROR",
      affectDistribution: { FEAR: 0.90, SURPRISE: 0.80 },
      valence: -0.70,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "SOLEMN",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.20,
    introducedInformation: ["vượt xa tầm hiểu biết"],
    surfaceRealization: true,
    semanticAssertions: ["CTHULHU_UNFATHOMABLE_ENTITY"]
  },
  {
    targetZh: "疯狂呓语",
    pattern: /疯狂呓语|疯狂低语|tiếng lẩm bẩm điên cuồng|lời nói mộng mị|lời lẩm bẩm điên cuồng/,
    targetSlot: STYLE_SLOTS.ELDRITCH_HORROR,
    candidateVi: "những lời thì thầm điên loạn tà ác vang vọng từ cõi vô tận",
    signature: createSemanticSignature({
      denotation: "VOID_WHISPERS",
      affectDistribution: { FEAR: 0.85, DESPAIR: 0.75 },
      valence: -0.60,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["từ cõi vô tận"],
    surfaceRealization: true,
    semanticAssertions: ["MAD_COSMIC_VOICES"]
  },
  {
    targetZh: "理智崩溃",
    pattern: /理智崩溃|精神崩溃|lý trí sụp đổ|tinh thần sụp đổ/,
    targetSlot: STYLE_SLOTS.SANITY_COLLAPSE,
    candidateVi: "tâm trí điên cuồng sụp đổ, hoàn toàn mất đi lý trí",
    signature: createSemanticSignature({
      denotation: "SANITY_COLLAPSE",
      affectDistribution: { FEAR: 0.95, DESPAIR: 0.90 },
      valence: -0.80,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["hoàn toàn mất đi lý trí"],
    surfaceRealization: true,
    semanticAssertions: ["COMPLETE_SANITY_LOSS"]
  },
  {
    targetZh: "污染畸变",
    pattern: /污染畸变|变异扭曲|ô nhiễm biến dạng|ô nhiễm biến dị/,
    targetSlot: STYLE_SLOTS.SANITY_COLLAPSE,
    candidateVi: "bị tà năng ăn mòn làm biến dị méo mó kinh tởm",
    signature: createSemanticSignature({
      denotation: "DEMONIC_CORRUPTION",
      affectDistribution: { FEAR: 0.85, CONTEMPT: 0.80 },
      valence: -0.70,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["kinh tởm"],
    surfaceRealization: true,
    semanticAssertions: ["GROTESQUE_PHYSICAL_MUTATION"]
  },
  {
    targetZh: "直视神明",
    pattern: /直视神明|直视邪神|nhìn thẳng vào thần linh/,
    targetSlot: STYLE_SLOTS.FORBIDDEN_GAZE,
    candidateVi: "liều lĩnh nhìn thẳng vào thần minh cổ xưa",
    signature: createSemanticSignature({
      denotation: "GAZING_AT_DEITY",
      affectDistribution: { FEAR: 0.90, SURPRISE: 0.85 },
      valence: -0.60,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "SOLEMN",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: ["cổ xưa"],
    surfaceRealization: true,
    semanticAssertions: ["FORBIDDEN_COSMIC_GAZE"]
  }
];

function createEldritchProvider() {
  return Object.freeze({
    id: "eldritch-provider",
    providerId: "eldritch-provider",
    domain: "ELDRITCH_HORROR",
    supportedSlots: Object.freeze([
      STYLE_SLOTS.ELDRITCH_HORROR,
      STYLE_SLOTS.FORBIDDEN_GAZE,
      STYLE_SLOTS.SANITY_COLLAPSE
    ]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.ELDRITCH_HORROR) || 0.85;

      for (const def of ELDRITCH_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "eldritch-provider",
              domain: "ELDRITCH_HORROR",
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
              forbiddenContexts: ["COMEDY", "MUNDANE_DAILY"],
              semanticExpansionCost: def.expansionCost,
              introducedInformation: def.introducedInformation,
              introducedMetaphor: def.introducedMetaphor || false,
              surfaceRealization: def.surfaceRealization,
              semanticAssertions: def.semanticAssertions,
              provenance: `eldritch-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createEldritchProvider,
  ELDRITCH_CONTRIBUTION_DEFINITIONS
};
