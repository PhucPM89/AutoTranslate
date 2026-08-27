"use strict";

/**
 * Spatiotemporal & Void Contribution Provider (Phase 2B - Wave A)
 * Domain: SPATIAL_VOID
 * 
 * Target Slots:
 * - SPATIAL_VOID (Spatial tears, void collapses, cosmic turbulence, shattering void, ancient realms opening)
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const SPATIAL_CONTRIBUTION_DEFINITIONS = [
  // 1. SPATIAL_VOID
  {
    targetZh: "空间撕裂",
    pattern: /空间撕裂|撕裂空间|虚空撕裂/,
    targetSlot: STYLE_SLOTS.SPATIAL_VOID,
    candidateVi: "khe nứt không gian xé toạc chân trời phát ra tiếng rít chói tai",
    signature: createSemanticSignature({
      denotation: "SPATIAL_TEAR",
      affectDistribution: { FEAR: 0.80, SOLEMN: 0.85 },
      valence: -0.40,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["chân trời"]
  },
  {
    targetZh: "虚空坍塌",
    pattern: /虚空坍塌|空间坍塌|虚空崩塌/,
    targetSlot: STYLE_SLOTS.SPATIAL_VOID,
    candidateVi: "hư không xung quanh sụp đổ vỡ vụn thành từng mảng lớn",
    signature: createSemanticSignature({
      denotation: "VOID_COLLAPSE",
      affectDistribution: { FEAR: 0.85, SOLEMN: 0.90 },
      valence: -0.50,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["vỡ vụn"]
  },
  {
    targetZh: "空间乱流",
    pattern: /空间乱流|虚空乱流/,
    targetSlot: STYLE_SLOTS.SPATIAL_VOID,
    candidateVi: "dòng loạn lưu không gian cuồng bạo cuốn phăng mọi thứ thành tro bụi",
    signature: createSemanticSignature({
      denotation: "VOID_TURBULENCE",
      affectDistribution: { FEAR: 0.90, SOLEMN: 0.85 },
      valence: -0.60,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.92,
    expansionCost: 0.20,
    introducedInformation: ["cuồng bạo", "tro bụi"]
  },
  {
    targetZh: "破碎虚空",
    pattern: /破碎虚空|踏空而去/,
    targetSlot: STYLE_SLOTS.SPATIAL_VOID,
    candidateVi: "phá toái hư không, đạp không mà đi",
    signature: createSemanticSignature({
      denotation: "SHATTER_VOID_ASCEND",
      affectDistribution: { SOLEMN: 0.95, RESOLUTE: 0.90 },
      valence: 0.60,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: []
  },
  {
    targetZh: "开启秘境",
    pattern: /开启秘境|秘境开启|秘境大门开启/,
    targetSlot: STYLE_SLOTS.SPATIAL_VOID,
    candidateVi: "cửa ngõ bí cảnh thượng cổ ầm ầm khai mở",
    signature: createSemanticSignature({
      denotation: "REALM_OPENS",
      affectDistribution: { SOLEMN: 0.85, SURPRISE: 0.70, JOY: 0.60 },
      valence: 0.50,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.92,
    expansionCost: 0.15,
    introducedInformation: ["thượng cổ", "ầm ầm"]
  }
];

function createSpatialProvider() {
  return Object.freeze({
    providerId: "spatial-provider",
    domain: "SPATIAL_VOID",
    getSuggestions: (clauseIR, context = {}) => {
      const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
      const domainWeight = (context && context.domainWeights && context.domainWeights.SPATIAL_VOID) || 0.0;
      const contributions = [];

      for (const def of SPATIAL_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(sourceZh)) || sourceZh.includes(def.targetZh)) {
          contributions.push(createStylistContribution({
            providerId: "spatial-provider",
            domain: "SPATIAL_VOID",
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
            provenance: `spatial-provider:${def.targetZh}`
          }));
        }
      }

      return Object.freeze({
        providerId: "spatial-provider",
        domain: "SPATIAL_VOID",
        confidence: domainWeight,
        contributions: Object.freeze(contributions),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createSpatialProvider,
  SPATIAL_CONTRIBUTION_DEFINITIONS
};
