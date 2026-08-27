"use strict";

/**
 * Ancient Inscriptions & Jade Slip Contribution Provider (Phase 2B - Wave A)
 * Domain: ANCIENT_INSCRIPTIONS
 * 
 * Target Slots:
 * - INSCRIPTION_LEGACY (Jade slips, ancient scrolls, stone steles, legacy imprints)
 * - TALISMAN_ACTIVATION (Glowing runes, ancient script flashes)
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const INSCRIPT_CONTRIBUTION_DEFINITIONS = [
  // 1. INSCRIPTION_LEGACY
  {
    targetZh: "玉简记载",
    pattern: /玉简记载|玉简中记载|玉简记载着/,
    targetSlot: STYLE_SLOTS.INSCRIPTION_LEGACY,
    candidateVi: "bên trong ngọc giản cổ xưa lưu lại thông tin ngàn năm",
    signature: createSemanticSignature({
      denotation: "JADE_SLIP_RECORD",
      affectDistribution: { SOLEMN: 0.85, TRANQUIL: 0.70 },
      valence: 0.40,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.35 },
    tone: "ELEVATED",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["cổ xưa", "ngàn năm"]
  },
  {
    targetZh: "古籍记载",
    pattern: /古籍记载|古籍中记载|古籍记载着/,
    targetSlot: STYLE_SLOTS.INSCRIPTION_LEGACY,
    candidateVi: "cổ tịch ố vàng ngàn năm ghi chép",
    signature: createSemanticSignature({
      denotation: "ANCIENT_BOOK_RECORD",
      affectDistribution: { SOLEMN: 0.85, TRANQUIL: 0.70 },
      valence: 0.35,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.35 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.92,
    expansionCost: 0.15,
    introducedInformation: ["ố vàng"]
  },
  {
    targetZh: "石碑文字",
    pattern: /石碑文字|石碑上的文字|石碑刻字/,
    targetSlot: STYLE_SLOTS.INSCRIPTION_LEGACY,
    candidateVi: "những nét chữ rồng bay phượng múa cứng cáp khắc sâu trên bia đá cổ",
    signature: createSemanticSignature({
      denotation: "STELE_INSCRIPTION",
      affectDistribution: { SOLEMN: 0.90, TRANQUIL: 0.60 },
      valence: 0.50,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.20,
    introducedInformation: ["rồng bay phượng múa", "cứng cáp"]
  },
  {
    targetZh: "传承印记",
    pattern: /传承印记|烙印传承|传承烙印/,
    targetSlot: STYLE_SLOTS.INSCRIPTION_LEGACY,
    candidateVi: "lạc ấn truyền thừa khắc sâu vào tận linh hồn",
    signature: createSemanticSignature({
      denotation: "LEGACY_IMPRINT",
      affectDistribution: { SOLEMN: 0.90, JOY: 0.70 },
      valence: 0.60,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["linh hồn"]
  },

  // 2. TALISMAN_ACTIVATION (Runes on steles)
  {
    targetZh: "符文闪烁",
    pattern: /符文闪烁|符文明灭|符文亮起/,
    targetSlot: STYLE_SLOTS.TALISMAN_ACTIVATION,
    candidateVi: "phù văn cổ xưa lập lòe phát ra vầng sáng kỳ bí",
    signature: createSemanticSignature({
      denotation: "RUNE_FLASH",
      affectDistribution: { SOLEMN: 0.80, SURPRISE: 0.60 },
      valence: 0.40,
      intensity: 0.65,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["cổ xưa", "kỳ bí"]
  }
];

function createInscriptProvider() {
  return Object.freeze({
    providerId: "inscript-provider",
    domain: "ANCIENT_INSCRIPTIONS",
    getSuggestions: (clauseIR, context = {}) => {
      const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
      const domainWeight = (context && context.domainWeights && context.domainWeights.ANCIENT_INSCRIPTIONS) || 0.0;
      const contributions = [];

      for (const def of INSCRIPT_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(sourceZh)) || sourceZh.includes(def.targetZh)) {
          contributions.push(createStylistContribution({
            providerId: "inscript-provider",
            domain: "ANCIENT_INSCRIPTIONS",
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
            provenance: `inscript-provider:${def.targetZh}`
          }));
        }
      }

      return Object.freeze({
        providerId: "inscript-provider",
        domain: "ANCIENT_INSCRIPTIONS",
        confidence: domainWeight,
        contributions: Object.freeze(contributions),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createInscriptProvider,
  INSCRIPT_CONTRIBUTION_DEFINITIONS
};
