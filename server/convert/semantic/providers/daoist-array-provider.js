"use strict";

/**
 * Daoist Array & Talismanic Contribution Provider (Phase 2B - Wave A)
 * Domain: DAOIST_ARRAY
 * 
 * Target Slots:
 * - ARRAY_NODE (Array cores, array activations, trigram transformations, array breaks)
 * - TALISMAN_ACTIVATION (Talisman combustions, rune flows)
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const DAOIST_ARRAY_CONTRIBUTION_DEFINITIONS = [
  // 1. ARRAY_NODE
  {
    targetZh: "阵眼",
    pattern: /阵眼|大阵阵眼/,
    targetSlot: STYLE_SLOTS.ARRAY_NODE,
    candidateVi: "trận nhãn cốt lõi",
    signature: createSemanticSignature({
      denotation: "ARRAY_EYE_CORE",
      affectDistribution: { SOLEMN: 0.85, RESOLUTE: 0.70 },
      valence: 0.20,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.05,
    introducedInformation: ["cốt lõi"]
  },
  {
    targetZh: "颠倒乾坤",
    pattern: /颠倒乾坤|扭转乾坤/,
    targetSlot: STYLE_SLOTS.ARRAY_NODE,
    candidateVi: "đảo lộn Càn Khôn, xoay chuyển đất trời",
    signature: createSemanticSignature({
      denotation: "REVERSE_UNIVERSE",
      affectDistribution: { SOLEMN: 0.90, RESOLUTE: 0.85 },
      valence: 0.30,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.92,
    expansionCost: 0.15,
    introducedInformation: ["xoay chuyển đất trời"]
  },
  {
    targetZh: "启动大阵",
    pattern: /启动大阵|开启大阵|大阵启动/,
    targetSlot: STYLE_SLOTS.ARRAY_NODE,
    candidateVi: "đại trận ầm ầm kích hoạt",
    signature: createSemanticSignature({
      denotation: "ACTIVATE_ARRAY",
      affectDistribution: { SOLEMN: 0.85, RESOLUTE: 0.80 },
      valence: 0.30,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: ["ầm ầm"]
  },
  {
    targetZh: "破开大阵",
    pattern: /破开大阵|大阵被破|破除大阵/,
    targetSlot: STYLE_SLOTS.ARRAY_NODE,
    candidateVi: "phá toang đại trận",
    signature: createSemanticSignature({
      denotation: "SHATTER_ARRAY",
      affectDistribution: { RESOLUTE: 0.90, WRATH: 0.70 },
      valence: 0.40,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.05,
    introducedInformation: []
  },
  {
    targetZh: "八卦运转",
    pattern: /八卦运转|八卦流转/,
    targetSlot: STYLE_SLOTS.ARRAY_NODE,
    candidateVi: "Bát Quái xoay vần biến ảo khôn lường",
    signature: createSemanticSignature({
      denotation: "TRIGRAM_ROTATE",
      affectDistribution: { SOLEMN: 0.90, TRANQUIL: 0.60 },
      valence: 0.40,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.92,
    expansionCost: 0.15,
    introducedInformation: ["biến ảo khôn lường"]
  },
  {
    targetZh: "剑阵笼罩",
    pattern: /剑阵笼罩|剑阵覆盖/,
    targetSlot: STYLE_SLOTS.ARRAY_NODE,
    candidateVi: "kiếm trận bao trùm cả thiên địa",
    signature: createSemanticSignature({
      denotation: "SWORD_ARRAY_COVERS",
      affectDistribution: { SOLEMN: 0.85, RESOLUTE: 0.85 },
      valence: 0.20,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.92,
    expansionCost: 0.10,
    introducedInformation: ["thiên địa"]
  },

  // 2. TALISMAN_ACTIVATION
  {
    targetZh: "符箓自燃",
    pattern: /符箓自燃|符纸自燃|灵符自燃/,
    targetSlot: STYLE_SLOTS.TALISMAN_ACTIVATION,
    candidateVi: "phù lục tự bốc cháy thành tro bụi",
    signature: createSemanticSignature({
      denotation: "TALISMAN_COMBUST",
      affectDistribution: { SOLEMN: 0.80, RESOLUTE: 0.70 },
      valence: 0.20,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.92,
    expansionCost: 0.10,
    introducedInformation: ["tro bụi"]
  },
  {
    targetZh: "符文流转",
    pattern: /符文流转|符文闪烁/,
    targetSlot: STYLE_SLOTS.TALISMAN_ACTIVATION,
    candidateVi: "phù văn huyền ảo lưu chuyển không ngừng",
    signature: createSemanticSignature({
      denotation: "RUNE_FLOW",
      affectDistribution: { SOLEMN: 0.85, TRANQUIL: 0.50 },
      valence: 0.50,
      intensity: 0.65,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["huyền ảo"]
  }
];

function createDaoistArrayProvider() {
  return Object.freeze({
    providerId: "daoist-array-provider",
    domain: "DAOIST_ARRAY",
    getSuggestions: (clauseIR, context = {}) => {
      const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
      const domainWeight = (context && context.domainWeights && context.domainWeights.DAOIST_ARRAY) || 0.0;
      const contributions = [];

      for (const def of DAOIST_ARRAY_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(sourceZh)) || sourceZh.includes(def.targetZh)) {
          contributions.push(createStylistContribution({
            providerId: "daoist-array-provider",
            domain: "DAOIST_ARRAY",
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
            provenance: `daoist-array-provider:${def.targetZh}`
          }));
        }
      }

      return Object.freeze({
        providerId: "daoist-array-provider",
        domain: "DAOIST_ARRAY",
        confidence: domainWeight,
        contributions: Object.freeze(contributions),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createDaoistArrayProvider,
  DAOIST_ARRAY_CONTRIBUTION_DEFINITIONS
};
