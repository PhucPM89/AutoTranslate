"use strict";

/**
 * Musical Dao & Zither Provider (Wave B)
 * 
 * Provides semantic contributions for guqin performances, High Mountain Flowing Water,
 * lyrical melodies, and sonic acoustic battle attacks (strictly distinguishing performance vs attack).
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const MUSICAL_DAO_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "琴音袅袅",
    pattern: /琴音袅袅|琴声悠扬|tiếng đàn lượn lờ/,
    targetSlot: STYLE_SLOTS.MUSICAL_PERFORMANCE,
    candidateVi: "tiếng đàn thánh thót du dương lượn lờ giữa không trung",
    signature: createSemanticSignature({
      denotation: "ZITHER_MELODY",
      affectDistribution: { TRANQUIL: 0.90, JOY: 0.70 },
      valence: 0.50,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    forbiddenContexts: ["COMBAT_MELEE"],
    tone: "SERENE",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["thánh thót du dương"],
    surfaceRealization: true,
    semanticAssertions: ["PEACEFUL_MUSIC_MELODY"]
  },
  {
    targetZh: "拨动琴弦",
    pattern: /拨动琴弦|轻抚琴弦|gảy dây đàn|gảy động dây đàn/,
    targetSlot: STYLE_SLOTS.MUSICAL_PERFORMANCE,
    candidateVi: "mười ngón tay nhẹ nhàng gảy từng cung bậc réo rắt",
    signature: createSemanticSignature({
      denotation: "FINGER_PLUCKING",
      affectDistribution: { TRANQUIL: 0.85, SOLEMN: 0.60 },
      valence: 0.30,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.20 },
    forbiddenContexts: ["COMBAT_MELEE"],
    tone: "SERENE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.85,
    expansionCost: 0.15,
    introducedInformation: ["từng cung bậc réo rắt"],
    surfaceRealization: true,
    semanticAssertions: ["GUQIN_PLAYING_GESTURE"]
  },
  {
    targetZh: "高山流水",
    pattern: /高山流水|cao sơn lưu thủy/,
    targetSlot: STYLE_SLOTS.MUSICAL_PERFORMANCE,
    candidateVi: "khúc nhạc Cao Sơn Lưu Thủy tri âm tri kỷ thấu tận tâm can",
    signature: createSemanticSignature({
      denotation: "HIGH_MOUNTAIN_FLOWING_WATER",
      affectDistribution: { TRANQUIL: 0.90, SOLEMN: 0.80 },
      valence: 0.60,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["tri âm tri kỷ"],
    surfaceRealization: true,
    semanticAssertions: ["CLASSICAL_MASTERPIECE_PERFORMANCE"]
  },
  {
    targetZh: "音波杀敌",
    pattern: /音波杀敌|琴音杀敌|âm ba trảm sát kẻ thù|âm ba giết địch/,
    targetSlot: STYLE_SLOTS.MUSICAL_ATTACK,
    candidateVi: "sóng âm sắc lẹm dũng mãnh trảm sát kẻ thù",
    signature: createSemanticSignature({
      denotation: "SONIC_SLASH_ATTACK",
      affectDistribution: { RESOLUTE: 0.90, WRATH: 0.85 },
      valence: -0.20,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: ["sắc lẹm"],
    introducedMetaphor: false,
    surfaceRealization: true,
    semanticAssertions: ["ACOUSTIC_SONIC_ATTACK"]
  },
  {
    targetZh: "曲终人散",
    pattern: /曲终人散|khúc đàn kết thúc người tản đi|bài hát hết người tan/,
    targetSlot: STYLE_SLOTS.MUSICAL_PERFORMANCE,
    candidateVi: "khúc nhạc dứt, tiếng đàn ngưng, người cũng dần tản mác như bọt nước",
    signature: createSemanticSignature({
      denotation: "SONG_CONCLUDES",
      affectDistribution: { TRANQUIL: 0.75, DESPAIR: 0.50 },
      valence: -0.10,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SERENE",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["như bọt nước"],
    introducedMetaphor: true,
    surfaceRealization: true,
    semanticAssertions: ["POIGNANT_MUSIC_CONCLUSION"]
  }
];

function createMusicalDaoProvider() {
  return Object.freeze({
    id: "musical-dao-provider",
    domain: "MUSICAL_DAO",
    supportedSlots: Object.freeze([STYLE_SLOTS.MUSICAL_PERFORMANCE, STYLE_SLOTS.MUSICAL_ATTACK]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.MUSICAL_DAO) || 0.85;

      for (const def of MUSICAL_DAO_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "musical-dao-provider",
              domain: "MUSICAL_DAO",
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
              provenance: `musical-dao-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createMusicalDaoProvider,
  MUSICAL_DAO_CONTRIBUTION_DEFINITIONS
};
