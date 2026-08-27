"use strict";

/**
 * Necropolis, Ancient Tombs & Corpse Contribution Provider (Phase 2B - Wave A)
 * Domain: NECROPOLIS_TOMB
 * 
 * Target Slots:
 * - NECROPOLIS_ATMOSPHERE (Ancient tombs, thousand-year coffins, corpse miasma, lethal traps, tomb guardian beasts)
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const NECROPOLIS_CONTRIBUTION_DEFINITIONS = [
  // 1. NECROPOLIS_ATMOSPHERE
  {
    targetZh: "古墓之中",
    pattern: /古墓之中|古墓内|在古墓中/,
    targetSlot: STYLE_SLOTS.NECROPOLIS_ATMOSPHERE,
    candidateVi: "bên trong cổ mộ âm u ngập tràn tử khí lạnh lẽo",
    signature: createSemanticSignature({
      denotation: "INSIDE_ANCIENT_TOMB",
      affectDistribution: { FEAR: 0.85, SOLEMN: 0.70 },
      valence: -0.60,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "FIERCE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.92,
    expansionCost: 0.15,
    introducedInformation: ["lạnh lẽo"]
  },
  {
    targetZh: "棺椁",
    pattern: /千年棺椁|古老棺椁|巨大的棺椁|棺椁/,
    targetSlot: STYLE_SLOTS.NECROPOLIS_ATMOSPHERE,
    candidateVi: "cỗ quan quách ngàn năm tỏa ra hàn khí lạnh thấu xương",
    signature: createSemanticSignature({
      denotation: "COFFIN_SARCOPHAGUS",
      affectDistribution: { FEAR: 0.85, SOLEMN: 0.80 },
      valence: -0.65,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["lạnh thấu xương"]
  },
  {
    targetZh: "死气与尸气",
    pattern: /死气与尸气|浓郁的尸气|尸气弥漫/,
    targetSlot: STYLE_SLOTS.NECROPOLIS_ATMOSPHERE,
    candidateVi: "tử khí và thi khí độc hại nồng nặc đến nghẹt thở",
    signature: createSemanticSignature({
      denotation: "CORPSE_MIASMA",
      affectDistribution: { FEAR: 0.90, DISGUST: 0.80 },
      valence: -0.80,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.92,
    expansionCost: 0.15,
    introducedInformation: ["nghẹt thở"]
  },
  {
    targetZh: "机关暗器",
    pattern: /机关暗器|机关陷阱|墓穴机关/,
    targetSlot: STYLE_SLOTS.NECROPOLIS_ATMOSPHERE,
    candidateVi: "cơ quan cạm bẫy trùng trùng điệp điệp kích hoạt ám khí sắc lẹm",
    signature: createSemanticSignature({
      denotation: "TOMB_TRAPS",
      affectDistribution: { FEAR: 0.80, SURPRISE: 0.80 },
      valence: -0.50,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.20,
    introducedInformation: ["trùng trùng điệp điệp", "sắc lẹm"]
  },
  {
    targetZh: "护陵兽",
    pattern: /护陵兽|守墓兽/,
    targetSlot: STYLE_SLOTS.NECROPOLIS_ATMOSPHERE,
    candidateVi: "thú hộ lăng thượng cổ gầm gừ phát ra uy áp rợn tóc gáy",
    signature: createSemanticSignature({
      denotation: "TOMB_GUARDIAN_BEAST",
      affectDistribution: { FEAR: 0.90, HOSTILITY: 0.80 },
      valence: -0.60,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.20,
    introducedInformation: ["thượng cổ", "rợn tóc gáy"]
  }
];

function createNecropolisProvider() {
  return Object.freeze({
    providerId: "necropolis-provider",
    domain: "NECROPOLIS_TOMB",
    getSuggestions: (clauseIR, context = {}) => {
      const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
      const domainWeight = (context && context.domainWeights && context.domainWeights.NECROPOLIS_TOMB) || 0.0;
      const contributions = [];

      for (const def of NECROPOLIS_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(sourceZh)) || sourceZh.includes(def.targetZh)) {
          contributions.push(createStylistContribution({
            providerId: "necropolis-provider",
            domain: "NECROPOLIS_TOMB",
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
            forbiddenContexts: ["SLAPSTICK_COMEDY", "ROMANCE_AESTHETICS"],
            semanticExpansionCost: def.expansionCost,
            introducedInformation: def.introducedInformation,
            introducedMetaphor: false,
            provenance: `necropolis-provider:${def.targetZh}`
          }));
        }
      }

      return Object.freeze({
        providerId: "necropolis-provider",
        domain: "NECROPOLIS_TOMB",
        confidence: domainWeight,
        contributions: Object.freeze(contributions),
        forbiddenPatterns: ["ngọt ngào", "hài hước"]
      });
    }
  });
}

module.exports = {
  createNecropolisProvider,
  NECROPOLIS_CONTRIBUTION_DEFINITIONS
};
