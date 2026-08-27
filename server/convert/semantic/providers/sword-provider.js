"use strict";

/**
 * Sword Dao & Weapon Intent Contribution Provider (Phase 2A)
 * 
 * Generates structured StylistContributions targeting StyleSlots:
 * - WEAPON_DRAW (Unsheathing, drawing blades)
 * - WEAPON_STRIKE (Sword slashes, sword rays)
 * - WEAPON_INTENT (Sword spirit, Dao harmony, sword clarity)
 * 
 * Domain: SWORD_DAO
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const SWORD_CONTRIBUTION_DEFINITIONS = [
  // 1. WEAPON_DRAW
  {
    targetZh: "拔剑",
    targetSlot: STYLE_SLOTS.WEAPON_DRAW,
    candidateVi: "tuốt kiếm rời vỏ",
    signature: createSemanticSignature({
      denotation: "UNSHEATHE_SWORD",
      affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.70 },
      valence: -0.10,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "ELEVATED",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: ["rời vỏ"]
  },
  {
    targetZh: "拔出长剑",
    targetSlot: STYLE_SLOTS.WEAPON_DRAW,
    candidateVi: "rút trường kiếm ra",
    signature: createSemanticSignature({
      denotation: "UNSHEATHE_SWORD",
      affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.70 },
      valence: -0.10,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "ELEVATED",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: ["khỏi vỏ"]
  },
  {
    targetZh: "长剑出鞘",
    targetSlot: STYLE_SLOTS.WEAPON_DRAW,
    candidateVi: "bảo kiếm tuốt khỏi vỏ",
    signature: createSemanticSignature({
      denotation: "UNSHEATHE_SWORD",
      affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.75 },
      valence: -0.10,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "ELEVATED",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: []
  },

  // 2. WEAPON_STRIKE
  {
    targetZh: "一剑斩出",
    targetSlot: STYLE_SLOTS.WEAPON_STRIKE,
    candidateVi: "vung kiếm chém ra",
    signature: createSemanticSignature({
      denotation: "SWORD_SLASH",
      affectDistribution: { RESOLUTE: 0.90, HOSTILITY: 0.70 },
      valence: -0.20,
      intensity: 0.85
    }),
    semanticRequirements: { minIntensity: 0.70 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.92,
    expansionCost: 0.05,
    introducedInformation: []
  },
  {
    targetZh: "剑气纵横",
    targetSlot: STYLE_SLOTS.WEAPON_INTENT,
    candidateVi: "kiếm khí tung hoành ngang dọc",
    signature: createSemanticSignature({
      denotation: "SWORD_QI_SURGE",
      affectDistribution: { RESOLUTE: 0.90, HOSTILITY: 0.80 },
      valence: -0.20,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.75 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["ngang dọc"]
  },

  // 3. WEAPON_INTENT
  {
    targetZh: "人剑合一",
    targetSlot: STYLE_SLOTS.WEAPON_INTENT,
    candidateVi: "người và kiếm hòa làm một",
    signature: createSemanticSignature({
      denotation: "SWORD_UNITY",
      affectDistribution: { TRANQUIL: 0.70, RESOLUTE: 0.85 },
      valence: 0.20,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.70 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: []
  },
  {
    targetZh: "剑意通天",
    targetSlot: STYLE_SLOTS.WEAPON_INTENT,
    candidateVi: "kiếm ý thông thiên ngút trời",
    signature: createSemanticSignature({
      denotation: "SWORD_INTENT_HEAVEN",
      affectDistribution: { RESOLUTE: 0.95, SOLEMN: 0.80 },
      valence: 0.10,
      intensity: 0.95,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.80 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["ngút trời"]
  }
];

function createSwordProvider() {
  return Object.freeze({
    providerId: "sword-provider",
    domain: "SWORD_DAO",
    getSuggestions: (clauseIR, context = {}) => {
      const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
      const domainWeight = (context && context.domainWeights && context.domainWeights.SWORD_DAO) || 0.0;
      const contributions = [];

      for (const def of SWORD_CONTRIBUTION_DEFINITIONS) {
        if (sourceZh.includes(def.targetZh)) {
          contributions.push(createStylistContribution({
            providerId: "sword-provider",
            domain: "SWORD_DAO",
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
            introducedMetaphor: Boolean(def.introducedMetaphor),
            provenance: `sword-provider:${def.targetZh}`
          }));
        }
      }

      return Object.freeze({
        providerId: "sword-provider",
        domain: "SWORD_DAO",
        confidence: domainWeight,
        contributions: Object.freeze(contributions),
        forbiddenPatterns: ["yếu ớt", "mềm nhũn"]
      });
    }
  });
}

module.exports = {
  createSwordProvider,
  SWORD_CONTRIBUTION_DEFINITIONS
};
