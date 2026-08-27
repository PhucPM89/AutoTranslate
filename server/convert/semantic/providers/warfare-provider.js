"use strict";

/**
 * Military Strategy & Siege Warfare Provider (Wave B)
 * 
 * Provides semantic contributions for war drums, withdrawal gongs,
 * cavalry/infantry mass charges, battlefield smoke, and bloody siege warfare.
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const WARFARE_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "擂鼓助威",
    pattern: /擂鼓助威|战鼓擂动|đánh trống trợ uy/,
    targetSlot: STYLE_SLOTS.WAR_DRUMS,
    candidateVi: "tiếng trống trận dồn dập rền vang rung chuyển trời đất",
    signature: createSemanticSignature({
      denotation: "WAR_DRUMS",
      affectDistribution: { RESOLUTE: 0.95, SOLEMN: 0.85 },
      valence: 0.20,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["rung chuyển trời đất"],
    surfaceRealization: true,
    semanticAssertions: ["THUNDERING_WAR_DRUMS"]
  },
  {
    targetZh: "鸣金收兵",
    pattern: /鸣金收兵|gõ chiêng thu quân|minh kim thu binh/,
    targetSlot: STYLE_SLOTS.WAR_DRUMS,
    candidateVi: "tiếng chiêng thu quân giục giã vang lên khắp chiến trường",
    signature: createSemanticSignature({
      denotation: "WITHDRAWAL_GONG",
      affectDistribution: { SOLEMN: 0.85, TRANQUIL: 0.60 },
      valence: 0.0,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["khắp chiến trường"],
    surfaceRealization: true,
    semanticAssertions: ["TROOP_RETREAT_SIGNAL"]
  },
  {
    targetZh: "千军万马冲锋",
    pattern: /千军万马冲锋|万马奔腾|thiên quân vạn mã xung phong|thiên quân vạn mã lao tới/,
    targetSlot: STYLE_SLOTS.WARFARE_CHARGE,
    candidateVi: "thiên quân vạn mã gầm thét ầm ầm xông pha trận mạc",
    signature: createSemanticSignature({
      denotation: "TROOP_CHARGE",
      affectDistribution: { RESOLUTE: 0.95, WRATH: 0.80 },
      valence: 0.10,
      intensity: 0.95,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["gầm thét ầm ầm"],
    surfaceRealization: true,
    semanticAssertions: ["MASS_ARMY_CHARGE"]
  },
  {
    targetZh: "烽火连天",
    pattern: /烽火连天|硝烟弥漫|khói lửa ngập trời/,
    targetSlot: STYLE_SLOTS.WARFARE_CHARGE,
    candidateVi: "khói lửa ngút trời bao trùm biên cương quan ải",
    signature: createSemanticSignature({
      denotation: "BATTLEFIELD_SMOKE",
      affectDistribution: { SOLEMN: 0.90, FEAR: 0.60 },
      valence: -0.30,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["biên cương quan ải"],
    surfaceRealization: true,
    semanticAssertions: ["WAR_BEACON_AND_SMOKE"]
  },
  {
    targetZh: "血战沙场",
    pattern: /血战沙场|浴血奋战|huyết chiến sa trường/,
    targetSlot: STYLE_SLOTS.BLOODY_BATTLEFIELD,
    candidateVi: "quyết tử huyết chiến nơi sa trường đẫm máu",
    signature: createSemanticSignature({
      denotation: "BLOODY_WARFARE",
      affectDistribution: { RESOLUTE: 0.95, WRATH: 0.85 },
      valence: -0.40,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["quyết tử"],
    surfaceRealization: true,
    semanticAssertions: ["LIFE_OR_DEATH_BATTLEFIELD_CLASH"]
  }
];

function createWarfareProvider() {
  return Object.freeze({
    id: "warfare-provider",
    providerId: "warfare-provider",
    domain: "WARFARE_SIEGE",
    supportedSlots: Object.freeze([
      STYLE_SLOTS.WAR_DRUMS,
      STYLE_SLOTS.WARFARE_CHARGE,
      STYLE_SLOTS.BLOODY_BATTLEFIELD
    ]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.WARFARE_SIEGE) || 0.85;

      for (const def of WARFARE_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "warfare-provider",
              domain: "WARFARE_SIEGE",
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
              provenance: `warfare-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createWarfareProvider,
  WARFARE_CONTRIBUTION_DEFINITIONS
};
