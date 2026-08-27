"use strict";

/**
 * Tribulation & Breakthrough Provider (Wave B)
 * 
 * Provides semantic contributions for heavenly tribulations, celestial lightning,
 * cosmic phenomena, Dao resonance, realm breakthroughs, and inner demons.
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const TRIBULATION_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "劫云滚滚",
    pattern: /劫云滚滚|劫云密布|mây kiếp cuồn cuộn|kiếp vân cuồn cuộn/,
    targetSlot: STYLE_SLOTS.TRIBULATION_LIGHTNING,
    candidateVi: "mây kiếp đen kịt cuồn cuộn giăng kín vòm trời",
    signature: createSemanticSignature({
      denotation: "TRIBULATION_CLOUDS",
      affectDistribution: { SOLEMN: 0.90, FEAR: 0.60 },
      valence: -0.20,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["giăng kín vòm trời"],
    surfaceRealization: true,
    semanticAssertions: ["OMINOUS_TRIBULATION_CLOUD_GATHERING"]
  },
  {
    targetZh: "紫霄神雷",
    pattern: /紫霄神雷|九天神雷|tử tiêu thần lôi/,
    targetSlot: STYLE_SLOTS.TRIBULATION_LIGHTNING,
    candidateVi: "Tử Tiêu Thần Lôi xé toạc tầng mây ầm ầm giáng xuống",
    signature: createSemanticSignature({
      denotation: "PURPLE_CELESTIAL_LIGHTNING",
      affectDistribution: { SOLEMN: 0.95, SURPRISE: 0.80 },
      valence: 0.0,
      intensity: 0.95,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["xé toạc tầng mây"],
    surfaceRealization: true,
    semanticAssertions: ["DIVINE_LIGHTNING_STRIKE"]
  },
  {
    targetZh: "天劫降临",
    pattern: /天劫降临|引动天劫|thiên kiếp giáng lâm/,
    targetSlot: STYLE_SLOTS.TRIBULATION_LIGHTNING,
    candidateVi: "thiên kiếp kinh hoàng ầm ầm giáng lâm",
    signature: createSemanticSignature({
      denotation: "HEAVENLY_TRIBULATION_FALLS",
      affectDistribution: { SOLEMN: 0.95, FEAR: 0.70 },
      valence: -0.10,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: ["kinh hoàng"],
    surfaceRealization: true,
    semanticAssertions: ["HEAVENLY_TRIBULATION_ARRIVAL"]
  },
  {
    targetZh: "九九天劫",
    pattern: /九九天劫|九九雷劫|cửu cửu thiên kiếp/,
    targetSlot: STYLE_SLOTS.TRIBULATION_LIGHTNING,
    candidateVi: "Cửu Cửu Thiên Kiếp hủy diệt thế gian",
    signature: createSemanticSignature({
      denotation: "NINE_NINE_TRIBULATION",
      affectDistribution: { SOLEMN: 0.95, FEAR: 0.80 },
      valence: -0.30,
      intensity: 0.95,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["hủy diệt thế gian"],
    surfaceRealization: true,
    semanticAssertions: ["APOCALYPTIC_LEVEL_TRIBULATION"]
  },
  {
    targetZh: "天地异象",
    pattern: /天地异象|天降异象|thiên địa dị tượng/,
    targetSlot: STYLE_SLOTS.CELESTIAL_PHENOMENON,
    candidateVi: "thiên địa dị tượng chấn động cả bát hoang",
    signature: createSemanticSignature({
      denotation: "CELESTIAL_PHENOMENA",
      affectDistribution: { SURPRISE: 0.90, SOLEMN: 0.90 },
      valence: 0.30,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["chấn động cả bát hoang"],
    surfaceRealization: true,
    semanticAssertions: ["HEAVEN_EARTH_MIRACLE_PHENOMENON"]
  },
  {
    targetZh: "万道霞光",
    pattern: /万道霞光|霞光万道|vạn đạo ráng mây|ráng mây vạn đạo|hà quang vạn đạo/,
    targetSlot: STYLE_SLOTS.CELESTIAL_PHENOMENON,
    candidateVi: "vạn trượng ráng mây hào quang rực rỡ chiếu rọi cửu thiên",
    signature: createSemanticSignature({
      denotation: "RADIANT_RAYS_OF_DAWN",
      affectDistribution: { JOY: 0.85, SOLEMN: 0.85 },
      valence: 0.70,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["chiếu rọi cửu thiên"],
    surfaceRealization: true,
    semanticAssertions: ["AUSPICIOUS_HEAVENLY_GLOW"]
  },
  {
    targetZh: "道音袅袅",
    pattern: /道音袅袅|道音回荡|đạo âm lượn lờ|đạo âm ngân vang/,
    targetSlot: STYLE_SLOTS.CELESTIAL_PHENOMENON,
    candidateVi: "tiếng đạo âm ngân vang vang vọng giữa đất trời",
    signature: createSemanticSignature({
      denotation: "DAO_RESONANCE",
      affectDistribution: { TRANQUIL: 0.85, SOLEMN: 0.90 },
      valence: 0.40,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "SOLEMN",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["vang vọng giữa đất trời"],
    surfaceRealization: true,
    semanticAssertions: ["GREAT_DAO_CELESTIAL_RESONANCE"]
  },
  {
    targetZh: "突破瓶颈",
    pattern: /突破瓶颈|打破桎梏|đột phá bình cảnh/,
    targetSlot: STYLE_SLOTS.REALM_BREAKTHROUGH,
    candidateVi: "phá toang bình cảnh gông cùm xiềng xích",
    signature: createSemanticSignature({
      denotation: "BOTTLENECK_BREAKTHROUGH",
      affectDistribution: { RESOLUTE: 0.95, JOY: 0.80 },
      valence: 0.50,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["gông cùm xiềng xích"],
    surfaceRealization: true,
    semanticAssertions: ["CULTIVATION_BREAKTHROUGH"]
  },
  {
    targetZh: "心魔侵蚀",
    pattern: /心魔侵蚀|心魔作祟|tâm ma xâm thực/,
    targetSlot: STYLE_SLOTS.REALM_BREAKTHROUGH,
    candidateVi: "tâm ma xâm thực làm dao động đạo tâm",
    signature: createSemanticSignature({
      denotation: "INNER_DEMON_INVASION",
      affectDistribution: { FEAR: 0.85, DESPAIR: 0.70 },
      valence: -0.60,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: ["làm dao động đạo tâm"],
    surfaceRealization: true,
    semanticAssertions: ["SPIRITUAL_HEART_DEMON_ATTACK"]
  }
];

function createTribulationProvider() {
  return Object.freeze({
    id: "tribulation-provider",
    providerId: "tribulation-provider",
    domain: "TRIBULATION_BREAKTHROUGH",
    supportedSlots: Object.freeze([
      STYLE_SLOTS.TRIBULATION_LIGHTNING,
      STYLE_SLOTS.CELESTIAL_PHENOMENON,
      STYLE_SLOTS.REALM_BREAKTHROUGH
    ]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.TRIBULATION_BREAKTHROUGH) || 0.85;

      for (const def of TRIBULATION_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "tribulation-provider",
              domain: "TRIBULATION_BREAKTHROUGH",
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
              provenance: `tribulation-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createTribulationProvider,
  TRIBULATION_CONTRIBUTION_DEFINITIONS
};
