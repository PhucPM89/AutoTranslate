"use strict";

/**
 * Folklore Supernatural & Taoist Exorcism Provider (Wave B)
 * 
 * Provides semantic contributions for red-clothed specters, Yin-Yang sight,
 * Taoist peach wood swords, cinnabar warding, ghost weddings (Minghun),
 * Yin-soldier processions, and Jiangshi mutations.
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const SUPERNATURAL_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "红衣厉鬼",
    pattern: /红衣厉鬼|红衣鬼|lệ quỷ áo đỏ|quỷ áo đỏ/,
    targetSlot: STYLE_SLOTS.SUPERNATURAL_SPECTER,
    candidateVi: "lệ quỷ áo đỏ oán khí ngút trời",
    signature: createSemanticSignature({
      denotation: "RED_GHOST_SPECTER",
      affectDistribution: { FEAR: 0.95, WRATH: 0.85 },
      valence: -0.80,
      intensity: 0.95,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["sát khí nồng nặc"],
    surfaceRealization: true,
    semanticAssertions: ["VENGEFUL_RED_SPECTER"]
  },
  {
    targetZh: "阴阳眼",
    pattern: /阴阳眼|mắt âm dương|âm dương nhãn/,
    targetSlot: STYLE_SLOTS.SUPERNATURAL_SPECTER,
    candidateVi: "đôi mắt âm dương có thể nhìn thấu âm hồn quỷ khí",
    signature: createSemanticSignature({
      denotation: "YIN_YANG_EYES",
      affectDistribution: { SURPRISE: 0.75, SOLEMN: 0.75 },
      valence: 0.10,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["nhìn thấu âm hồn quỷ khí"],
    surfaceRealization: true,
    semanticAssertions: ["SUPERNATURAL_SPECTRAL_SIGHT"]
  },
  {
    targetZh: "桃木剑",
    pattern: /桃木剑|八卦镜|kiếm gỗ đào|bát quái kính/,
    targetSlot: STYLE_SLOTS.TAOIST_EXORCISM,
    candidateVi: "kiếm gỗ đào cùng gương Bát Quái trấn áp tà ma",
    signature: createSemanticSignature({
      denotation: "PEACH_WOOD_SWORD",
      affectDistribution: { SOLEMN: 0.90, RESOLUTE: 0.85 },
      valence: 0.30,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["trấn áp tà ma"],
    surfaceRealization: true,
    semanticAssertions: ["TAOIST_EXORCISM_ARTIFACT"]
  },
  {
    targetZh: "黑狗血",
    pattern: /黑狗血|朱砂|máu chó mực|bột chu sa/,
    targetSlot: STYLE_SLOTS.TAOIST_EXORCISM,
    candidateVi: "máu chó mực cùng bột chu sa xua tan tà uế",
    signature: createSemanticSignature({
      denotation: "BLACK_DOG_BLOOD_WARDING",
      affectDistribution: { RESOLUTE: 0.80, SOLEMN: 0.70 },
      valence: 0.20,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.85,
    expansionCost: 0.15,
    introducedInformation: ["xua tan tà uế"],
    surfaceRealization: true,
    semanticAssertions: ["FOLKLORE_EVIL_WARDING"]
  },
  {
    targetZh: "冥婚",
    pattern: /冥婚|鬼迎亲|đoàn rước dâu minh hôn|minh hôn|đám cưới ma/,
    targetSlot: STYLE_SLOTS.SUPERNATURAL_SPECTER,
    candidateVi: "đoàn rước dâu minh hôn quỷ dị trong sương đêm",
    signature: createSemanticSignature({
      denotation: "GHOST_WEDDING",
      affectDistribution: { FEAR: 0.90, SOLEMN: 0.75 },
      valence: -0.70,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["trong sương đêm"],
    surfaceRealization: true,
    semanticAssertions: ["SPECTRAL_MARRIAGE_PROCESSION"]
  },
  {
    targetZh: "阴兵借道",
    pattern: /阴兵借道|黑白无常|âm binh mượn đường|hắc bạch vô thường/,
    targetSlot: STYLE_SLOTS.NETHERWORLD_PARADE,
    candidateVi: "đoàn âm binh mượn đường câu hồn đoạt phách",
    signature: createSemanticSignature({
      denotation: "YIN_SOLDIERS_MARCH",
      affectDistribution: { FEAR: 0.95, SOLEMN: 0.85 },
      valence: -0.75,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "SOLEMN",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["câu hồn đoạt phách"],
    surfaceRealization: true,
    semanticAssertions: ["NETHERWORLD_ARMY_MARCH"]
  },
  {
    targetZh: "尸变",
    pattern: /尸变|僵尸复活|thi thể thi biến|thi biến thành cương thi|thi biến/,
    targetSlot: STYLE_SLOTS.NETHERWORLD_PARADE,
    candidateVi: "thi thể đột ngột thi biến hóa thành cương thi",
    signature: createSemanticSignature({
      denotation: "JIANGSHI_MUTATION",
      affectDistribution: { FEAR: 0.95, SURPRISE: 0.85 },
      valence: -0.80,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: ["đột ngột"],
    surfaceRealization: true,
    semanticAssertions: ["CORPSE_MUTATING_INTO_JIANGSHI"]
  }
];

function createSupernaturalProvider() {
  return Object.freeze({
    id: "supernatural-provider",
    providerId: "supernatural-provider",
    domain: "SUPERNATURAL_HORROR",
    supportedSlots: Object.freeze([
      STYLE_SLOTS.SUPERNATURAL_SPECTER,
      STYLE_SLOTS.TAOIST_EXORCISM,
      STYLE_SLOTS.NETHERWORLD_PARADE
    ]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.SUPERNATURAL_HORROR) || 0.85;

      for (const def of SUPERNATURAL_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "supernatural-provider",
              domain: "SUPERNATURAL_HORROR",
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
              provenance: `supernatural-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createSupernaturalProvider,
  SUPERNATURAL_CONTRIBUTION_DEFINITIONS
};
