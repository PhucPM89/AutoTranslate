"use strict";

/**
 * Mythical Bestiary & Demonic Contribution Provider (Phase 2B - Wave A)
 * Domain: BESTIARY_DEMONIC
 * 
 * Target Slots:
 * - BEAST_ROAR (Demonic auras, beast roars, howling)
 * - BEAST_EVOLUTION (Predatory eyes, spatial claws, primordial bloodline suppressions)
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const BESTIARY_CONTRIBUTION_DEFINITIONS = [
  // 1. BEAST_ROAR
  {
    targetZh: "妖气冲天",
    pattern: /妖气冲天|妖气滔天|妖气滚滚/,
    targetSlot: STYLE_SLOTS.BEAST_ROAR,
    candidateVi: "yêu khí cuồn cuộn ngút trời",
    signature: createSemanticSignature({
      denotation: "DEMONIC_AURA",
      affectDistribution: { FEAR: 0.80, SOLEMN: 0.70 },
      valence: -0.50,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.92,
    expansionCost: 0.10,
    introducedInformation: ["cuồn cuộn"]
  },
  {
    targetZh: "凶兽咆哮",
    pattern: /凶兽咆哮|凶兽怒吼/,
    targetSlot: STYLE_SLOTS.BEAST_ROAR,
    candidateVi: "hung thú gầm rống rung chuyển sơn hà",
    signature: createSemanticSignature({
      denotation: "BEAST_ROAR",
      affectDistribution: { FEAR: 0.85, WRATH: 0.80 },
      valence: -0.40,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["rung chuyển sơn hà"]
  },
  {
    targetZh: "妖兽嘶吼",
    pattern: /妖兽嘶吼|妖兽咆哮|兽吼声/,
    targetSlot: STYLE_SLOTS.BEAST_ROAR,
    candidateVi: "tiếng yêu thú gào thét vang dội núi rừng",
    signature: createSemanticSignature({
      denotation: "DEMON_BEAST_HOWL",
      affectDistribution: { FEAR: 0.75, SOLEMN: 0.60 },
      valence: -0.30,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: ["núi rừng"]
  },

  // 2. BEAST_EVOLUTION & Predatory traits
  {
    targetZh: "竖瞳",
    pattern: /瞳孔竖立|竖瞳/,
    targetSlot: STYLE_SLOTS.BEAST_EVOLUTION,
    candidateVi: "đồng tử dựng đứng lóe lên hung quang dữ tợn",
    signature: createSemanticSignature({
      denotation: "PREDATORY_EYES",
      affectDistribution: { FEAR: 0.80, HOSTILITY: 0.85 },
      valence: -0.60,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.92,
    expansionCost: 0.15,
    introducedInformation: ["hung quang"]
  },
  {
    targetZh: "利爪撕裂空间",
    pattern: /利爪撕裂空间|利爪撕裂虚空|利爪撕开虚空/,
    targetSlot: STYLE_SLOTS.BEAST_EVOLUTION,
    candidateVi: "móng vuốt sắc lẹm xé toạc hư không",
    signature: createSemanticSignature({
      denotation: "VOID_CLAWS",
      affectDistribution: { FEAR: 0.80, WRATH: 0.80 },
      valence: -0.40,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.70 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: ["sắc lẹm"]
  },
  {
    targetZh: "血脉压制",
    pattern: /血脉压制|远古血脉压制/,
    targetSlot: STYLE_SLOTS.BEAST_EVOLUTION,
    candidateVi: "huyết mạch thượng cổ áp chế tuyệt đối",
    signature: createSemanticSignature({
      denotation: "BLOODLINE_SUPPRESSION",
      affectDistribution: { SOLEMN: 0.90, FEAR: 0.70 },
      valence: 0.10,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: ["thượng cổ"]
  },
  {
    targetZh: "远古气息",
    pattern: /远古气息|洪荒气息/,
    targetSlot: STYLE_SLOTS.BEAST_EVOLUTION,
    candidateVi: "khí tức viễn cổ hồng hoang hùng hậu",
    signature: createSemanticSignature({
      denotation: "PRIMORDIAL_AURA",
      affectDistribution: { SOLEMN: 0.95, TRANQUIL: 0.50 },
      valence: 0.40,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.92,
    expansionCost: 0.10,
    introducedInformation: ["hùng hậu"]
  }
];

function createBestiaryProvider() {
  return Object.freeze({
    providerId: "bestiary-provider",
    domain: "BESTIARY_DEMONIC",
    getSuggestions: (clauseIR, context = {}) => {
      const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
      const domainWeight = (context && context.domainWeights && context.domainWeights.BESTIARY_DEMONIC) || 0.0;
      const contributions = [];

      for (const def of BESTIARY_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(sourceZh)) || sourceZh.includes(def.targetZh)) {
          contributions.push(createStylistContribution({
            providerId: "bestiary-provider",
            domain: "BESTIARY_DEMONIC",
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
            provenance: `bestiary-provider:${def.targetZh}`
          }));
        }
      }

      return Object.freeze({
        providerId: "bestiary-provider",
        domain: "BESTIARY_DEMONIC",
        confidence: domainWeight,
        contributions: Object.freeze(contributions),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createBestiaryProvider,
  BESTIARY_CONTRIBUTION_DEFINITIONS
};
