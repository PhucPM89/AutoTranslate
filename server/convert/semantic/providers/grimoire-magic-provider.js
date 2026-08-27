"use strict";

/**
 * Grimoire & Western Magic Provider (Wave B)
 * 
 * Provides semantic contributions for forbidden curses, surging mana,
 * solemn incantations, arcane magic circles, and ancient grimoires.
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const GRIMOIRE_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "魔法禁咒",
    pattern: /魔法禁咒|禁咒魔法|ma pháp cấm chú|cấm chú/,
    targetSlot: STYLE_SLOTS.GRIMOIRE_CURSE,
    candidateVi: "đại cấm chú ma pháp hủy thiên diệt địa",
    signature: createSemanticSignature({
      denotation: "FORBIDDEN_MAGIC_CURSE",
      affectDistribution: { SOLEMN: 0.90, FEAR: 0.70 },
      valence: -0.20,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["hủy thiên diệt địa"],
    surfaceRealization: true,
    semanticAssertions: ["FORBIDDEN_ARCANE_SPELL"]
  },
  {
    targetZh: "魔力涌动",
    pattern: /魔力涌动|魔力狂暴|ma lực dâng trào|ma lực cuộn trào/,
    targetSlot: STYLE_SLOTS.GRIMOIRE_CURSE,
    candidateVi: "ma lực vô tận cuồn cuộn dâng trào như bão táp",
    signature: createSemanticSignature({
      denotation: "MANA_SURGE",
      affectDistribution: { RESOLUTE: 0.85, SURPRISE: 0.70 },
      valence: 0.20,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["như bão táp"],
    introducedMetaphor: false,
    surfaceRealization: true,
    semanticAssertions: ["MANA_OCEAN_SURGE"]
  },
  {
    targetZh: "吟唱咒语",
    pattern: /吟唱咒语|吟诵魔法|ngâm xướng ma pháp|ngâm xướng chú ngữ/,
    targetSlot: STYLE_SLOTS.MAGIC_INCANTATION,
    candidateVi: "cất giọng ngâm xướng cổ ngữ ma pháp âm vang trang nghiêm",
    signature: createSemanticSignature({
      denotation: "INCANTATION_CHANT",
      affectDistribution: { SOLEMN: 0.90, TRANQUIL: 0.60 },
      valence: 0.20,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["âm vang trang nghiêm"],
    surfaceRealization: true,
    semanticAssertions: ["ARCANE_INCANTATION_RESONANCE"]
  },
  {
    targetZh: "魔法阵",
    pattern: /魔法阵|ma pháp trận/,
    targetSlot: STYLE_SLOTS.MAGIC_INCANTATION,
    candidateVi: "ma pháp trận rực sáng những ký tự cổ ngữ thần bí",
    signature: createSemanticSignature({
      denotation: "MAGIC_CIRCLE",
      affectDistribution: { SURPRISE: 0.75, SOLEMN: 0.75 },
      valence: 0.30,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["ký tự cổ ngữ"],
    surfaceRealization: true,
    semanticAssertions: ["RUNE_MAGIC_CIRCLE_ACTIVE"]
  },
  {
    targetZh: "魔导书",
    pattern: /魔导书|魔法书|sách ma đạo|ma đạo thư/,
    targetSlot: STYLE_SLOTS.MAGIC_INCANTATION,
    candidateVi: "ma đạo thư cổ xưa lưu truyền ngàn năm",
    signature: createSemanticSignature({
      denotation: "ANCIENT_GRIMOIRE",
      affectDistribution: { SOLEMN: 0.85, TRANQUIL: 0.60 },
      valence: 0.20,
      intensity: 0.65,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.85,
    expansionCost: 0.20,
    introducedInformation: ["lưu truyền ngàn năm"],
    surfaceRealization: true,
    semanticAssertions: ["LEGACY_GRIMOIRE_TOME"]
  }
];

function createGrimoireMagicProvider() {
  return Object.freeze({
    id: "grimoire-magic-provider",
    providerId: "grimoire-magic-provider",
    domain: "GRIMOIRE_MAGIC",
    supportedSlots: Object.freeze([
      STYLE_SLOTS.GRIMOIRE_CURSE,
      STYLE_SLOTS.MAGIC_INCANTATION
    ]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.GRIMOIRE_MAGIC) || 0.85;

      for (const def of GRIMOIRE_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "grimoire-magic-provider",
              domain: "GRIMOIRE_MAGIC",
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
              provenance: `grimoire-magic-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createGrimoireMagicProvider,
  GRIMOIRE_CONTRIBUTION_DEFINITIONS
};
