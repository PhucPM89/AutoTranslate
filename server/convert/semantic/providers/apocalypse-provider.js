"use strict";

/**
 * Apocalypse & Genetic Mutant Provider (Wave B)
 * 
 * Provides semantic contributions for doomsday wastelands, zombie tides,
 * genetic lock releases, mutant crystals, and elemental power awakenings.
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const APOCALYPSE_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "丧尸狂潮",
    pattern: /丧尸狂潮|丧尸潮|làn sóng tang thi|tang thi cuồng triều/,
    targetSlot: STYLE_SLOTS.APOCALYPSE_HORDE,
    candidateVi: "thủy triều tang thi cuồng bạo càn quét",
    signature: createSemanticSignature({
      denotation: "ZOMBIE_TIDE",
      affectDistribution: { FEAR: 0.85, DESPAIR: 0.70 },
      valence: -0.60,
      intensity: 0.85,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    forbiddenContexts: ["COMEDY", "MUNDANE_DAILY"],
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: ["cuồng bạo"],
    surfaceRealization: true,
    semanticAssertions: ["SURGING_ZOMBIE_HORDE"]
  },
  {
    targetZh: "末日废土",
    pattern: /末日废土|末世废土|vùng đất hoang tận thế|mạt nhật phế thổ/,
    targetSlot: STYLE_SLOTS.APOCALYPSE_HORDE,
    candidateVi: "vùng đất hoang tàn đổ nát của thời mạt thế",
    signature: createSemanticSignature({
      denotation: "DOOMSDAY_WASTELAND",
      affectDistribution: { DESPAIR: 0.75, SOLEMN: 0.70 },
      valence: -0.40,
      intensity: 0.65,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.85,
    expansionCost: 0.10,
    introducedInformation: ["đổ nát"],
    surfaceRealization: true,
    semanticAssertions: ["RUINED_WASTELAND"]
  },
  {
    targetZh: "基因锁",
    pattern: /解开基因锁|突破基因锁|khóa gen/,
    targetSlot: STYLE_SLOTS.GENETIC_LIMIT,
    candidateVi: "phá vỡ xiềng xích của khóa gen di truyền",
    signature: createSemanticSignature({
      denotation: "GENE_LOCK_RELEASE",
      affectDistribution: { RESOLUTE: 0.90, SURPRISE: 0.70 },
      valence: 0.40,
      intensity: 0.80,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["xiềng xích"],
    surfaceRealization: true,
    semanticAssertions: ["GENETIC_LIMIT_BROKEN"]
  },
  {
    targetZh: "晶核",
    pattern: /变异晶核|晶核|tinh hạch/,
    targetSlot: STYLE_SLOTS.GENETIC_LIMIT,
    candidateVi: "tinh hạch năng lượng lấp lánh bên trong dị thú",
    signature: createSemanticSignature({
      denotation: "MUTANT_ENERGY_CORE",
      affectDistribution: { SURPRISE: 0.60, TRANQUIL: 0.60 },
      valence: 0.20,
      intensity: 0.50,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.20 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.85,
    expansionCost: 0.20,
    introducedInformation: ["lấp lánh"],
    surfaceRealization: true,
    semanticAssertions: ["ENERGY_CRYSTAL_PRESENT"]
  },
  {
    targetZh: "异能觉醒",
    pattern: /异能觉醒|觉醒异能|dị năng thức tỉnh|thức tỉnh dị năng/,
    targetSlot: STYLE_SLOTS.ELEMENTAL_AWAKENING,
    candidateVi: "dị năng nguyên tố bùng nổ thức tỉnh",
    signature: createSemanticSignature({
      denotation: "ELEMENTAL_POWER_AWAKENING",
      affectDistribution: { SURPRISE: 0.85, RESOLUTE: 0.85 },
      valence: 0.50,
      intensity: 0.85,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["bùng nổ"],
    surfaceRealization: true,
    semanticAssertions: ["SUPERNATURAL_ABILITY_AWAKENED"]
  }
];

function createApocalypseProvider() {
  return Object.freeze({
    id: "apocalypse-provider",
    providerId: "apocalypse-provider",
    domain: "APOCALYPSE_SURVIVAL",
    supportedSlots: Object.freeze([
      STYLE_SLOTS.APOCALYPSE_HORDE,
      STYLE_SLOTS.GENETIC_LIMIT,
      STYLE_SLOTS.ELEMENTAL_AWAKENING
    ]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.APOCALYPSE_SURVIVAL) || 0.85;

      for (const def of APOCALYPSE_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "apocalypse-provider",
              domain: "APOCALYPSE_SURVIVAL",
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
              forbiddenContexts: def.forbiddenContexts || ["COMEDY", "MUNDANE_DAILY"],
              semanticExpansionCost: def.expansionCost,
              introducedInformation: def.introducedInformation,
              introducedMetaphor: false,
              surfaceRealization: def.surfaceRealization,
              semanticAssertions: def.semanticAssertions,
              provenance: `apocalypse-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createApocalypseProvider,
  APOCALYPSE_CONTRIBUTION_DEFINITIONS
};
