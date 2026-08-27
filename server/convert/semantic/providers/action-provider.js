"use strict";

/**
 * Martial Action & Dynamic Combat Contribution Provider (Phase 2A)
 * 
 * Generates structured StylistContributions targeting StyleSlots:
 * - ACTION_STRIKE (Fist, palm, kick strikes)
 * - ACTION_MOVE (Footwork, dodging, leaping)
 * - ACTION_DAMAGE (Damage feedback, vomiting blood, knocked back)
 * - WEAPON_STRIKE (Direct physical weapon attacks)
 * 
 * Domain: COMBAT
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const ACTION_CONTRIBUTION_DEFINITIONS = [
  // 1. ACTION_STRIKE
  {
    targetZh: "一拳轰出",
    targetSlot: STYLE_SLOTS.ACTION_STRIKE,
    candidateVi: "tung ra một quyền oanh kích",
    signature: createSemanticSignature({
      denotation: "FIST_STRIKE",
      affectDistribution: { WRATH: 0.70, RESOLUTE: 0.85 },
      valence: -0.20,
      intensity: 0.90
    }),
    semanticRequirements: { minIntensity: 0.70, requiredRoles: ["ACTION"] },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["oanh kích"]
  },
  {
    targetZh: "一掌拍出",
    targetSlot: STYLE_SLOTS.ACTION_STRIKE,
    candidateVi: "tung chưởng đánh tới",
    signature: createSemanticSignature({
      denotation: "PALM_STRIKE",
      affectDistribution: { RESOLUTE: 0.80, HOSTILITY: 0.60 },
      valence: -0.20,
      intensity: 0.80
    }),
    semanticRequirements: { minIntensity: 0.60, requiredRoles: ["ACTION"] },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: []
  },
  {
    targetZh: "一掌拍来",
    targetSlot: STYLE_SLOTS.ACTION_STRIKE,
    candidateVi: "vung chưởng vỗ tới",
    signature: createSemanticSignature({
      denotation: "PALM_STRIKE",
      affectDistribution: { HOSTILITY: 0.75, RESOLUTE: 0.70 },
      valence: -0.30,
      intensity: 0.80
    }),
    semanticRequirements: { minIntensity: 0.60, requiredRoles: ["ACTION"] },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: []
  },

  // 2. ACTION_MOVE
  {
    targetZh: "纵身跃起",
    targetSlot: STYLE_SLOTS.ACTION_MOVE,
    candidateVi: "tung người nhảy vọt lên",
    signature: createSemanticSignature({
      denotation: "LEAP_UP",
      affectDistribution: { RESOLUTE: 0.80, NEUTRAL: 0.40 },
      valence: 0.0,
      intensity: 0.75
    }),
    semanticRequirements: { minIntensity: 0.50, requiredRoles: ["ACTION"] },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: []
  },
  {
    targetZh: "身形一闪",
    targetSlot: STYLE_SLOTS.ACTION_MOVE,
    candidateVi: "thân hình thoắt lóe",
    signature: createSemanticSignature({
      denotation: "DODGE_FLASH",
      affectDistribution: { RESOLUTE: 0.70, NEUTRAL: 0.50 },
      valence: 0.0,
      intensity: 0.70
    }),
    semanticRequirements: { minIntensity: 0.50, requiredRoles: ["ACTION"] },
    tone: "NEUTRAL",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.05,
    introducedInformation: []
  },

  // 3. ACTION_DAMAGE
  {
    targetZh: "吐出一口鲜血",
    targetSlot: STYLE_SLOTS.ACTION_DAMAGE,
    candidateVi: "hộc ra một ngụm máu tươi",
    signature: createSemanticSignature({
      denotation: "VOMIT_BLOOD",
      affectDistribution: { SORROW: 0.60, FEAR: 0.50 },
      valence: -0.70,
      intensity: 0.85
    }),
    semanticRequirements: { minIntensity: 0.70 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.0,
    introducedInformation: []
  },
  {
    targetZh: "倒飞出去",
    targetSlot: STYLE_SLOTS.ACTION_DAMAGE,
    candidateVi: "bị đánh văng ngược ra ngoài",
    signature: createSemanticSignature({
      denotation: "KNOCKED_BACK",
      affectDistribution: { FEAR: 0.50, SURPRISE: 0.60 },
      valence: -0.60,
      intensity: 0.80
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: ["ngược ra ngoài"]
  },

  // 4. WEAPON_STRIKE (Physical strike action)
  {
    targetZh: "拔剑斩去",
    targetSlot: STYLE_SLOTS.WEAPON_STRIKE,
    candidateVi: "vung kiếm chém tới",
    signature: createSemanticSignature({
      denotation: "SWORD_SLASH",
      affectDistribution: { RESOLUTE: 0.85, HOSTILITY: 0.75 },
      valence: -0.25,
      intensity: 0.85
    }),
    semanticRequirements: { minIntensity: 0.70, requiredRoles: ["ACTION"] },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: []
  },
  {
    targetZh: "一剑斩出",
    targetSlot: STYLE_SLOTS.WEAPON_STRIKE,
    candidateVi: "vung kiếm chém ra",
    signature: createSemanticSignature({
      denotation: "SWORD_SLASH",
      affectDistribution: { RESOLUTE: 0.85, HOSTILITY: 0.70 },
      valence: -0.20,
      intensity: 0.85
    }),
    semanticRequirements: { minIntensity: 0.70, requiredRoles: ["ACTION"] },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.05,
    introducedInformation: []
  }
];

function createActionProvider() {
  return Object.freeze({
    providerId: "action-provider",
    domain: "COMBAT",
    getSuggestions: (clauseIR, context = {}) => {
      const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
      const domainWeight = (context && context.domainWeights && context.domainWeights.COMBAT) || 0.0;
      const contributions = [];

      for (const def of ACTION_CONTRIBUTION_DEFINITIONS) {
        if (sourceZh.includes(def.targetZh)) {
          // Check role requirement
          if (def.semanticRequirements && def.semanticRequirements.requiredRoles) {
            if (clauseIR.role && !def.semanticRequirements.requiredRoles.includes(clauseIR.role)) {
              continue;
            }
          }

          contributions.push(createStylistContribution({
            providerId: "action-provider",
            domain: "COMBAT",
            targetSlot: def.targetSlot,
            sourceSpanZh: def.targetZh,
            candidateVi: def.candidateVi,
            semanticRequirements: def.semanticRequirements,
            semanticSignature: def.signature,
            tone: def.tone,
            register: "VERNACULAR",
            rhythmPreference: def.rhythmPreference,
            lexicalPriority: def.priority,
            confidence: Math.max(0.70, Number(domainWeight.toFixed(2))),
            forbiddenContexts: ["ZEN_TEA", "ROMANCE_AESTHETICS"],
            semanticExpansionCost: def.expansionCost,
            introducedInformation: def.introducedInformation,
            introducedMetaphor: false,
            provenance: `action-provider:${def.targetZh}`
          }));
        }
      }

      return Object.freeze({
        providerId: "action-provider",
        domain: "COMBAT",
        confidence: domainWeight,
        contributions: Object.freeze(contributions),
        forbiddenPatterns: ["an nhiên", "thanh tịnh", "thư thái", "chậm rãi"]
      });
    }
  });
}

module.exports = {
  createActionProvider,
  ACTION_CONTRIBUTION_DEFINITIONS
};
