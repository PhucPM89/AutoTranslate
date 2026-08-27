"use strict";

/**
 * Divine Sense & Soul Pressure Provider (Wave B)
 * 
 * Provides semantic contributions for psychic divine sense scans, consciousness seas,
 * soul pressure, soul agony, and absolute domain expansions.
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const DIVINE_SENSE_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "神识扫过",
    pattern: /神识扫过|神念扫过|thần thức quét qua|thần niệm quét qua/,
    targetSlot: STYLE_SLOTS.DIVINE_SENSE_SCAN,
    candidateVi: "thần thức mênh mông như thủy triều cuồn cuộn quét qua",
    signature: createSemanticSignature({
      denotation: "DIVINE_SENSE_SCAN",
      affectDistribution: { SOLEMN: 0.85, SURPRISE: 0.60 },
      valence: 0.20,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["như thủy triều"],
    introducedMetaphor: false,
    surfaceRealization: true,
    semanticAssertions: ["PSYCHIC_AREA_SWEEP"]
  },
  {
    targetZh: "神念如潮",
    pattern: /神念如潮|神识如潮|thần niệm như triều/,
    targetSlot: STYLE_SLOTS.DIVINE_SENSE_SCAN,
    candidateVi: "thần niệm cuồn cuộn như sóng triều gầm thét",
    signature: createSemanticSignature({
      denotation: "SOUL_FORCE_TIDE",
      affectDistribution: { SOLEMN: 0.85, RESOLUTE: 0.80 },
      valence: 0.10,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["gầm thét"],
    introducedMetaphor: false,
    surfaceRealization: true,
    semanticAssertions: ["SURGING_PSYCHIC_WAVES"]
  },
  {
    targetZh: "威压降临",
    pattern: /威压降临|庞大威压|uy áp giáng lâm/,
    targetSlot: STYLE_SLOTS.SOUL_PRESSURE,
    candidateVi: "uy áp kinh thiên động địa ầm ầm giáng xuống",
    signature: createSemanticSignature({
      denotation: "DIVINE_PRESSURE_FALLS",
      affectDistribution: { SOLEMN: 0.95, FEAR: 0.60 },
      valence: -0.10,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["kinh thiên động địa"],
    surfaceRealization: true,
    semanticAssertions: ["OVERWHELMING_SOUL_AURA"]
  },
  {
    targetZh: "识海震荡",
    pattern: /识海震荡|识海剧震|thức hải chấn động|biển ý thức rung động/,
    targetSlot: STYLE_SLOTS.SOUL_PRESSURE,
    candidateVi: "thức hải dậy sóng dữ dội chấn động kịch liệt",
    signature: createSemanticSignature({
      denotation: "CONSCIOUSNESS_SEA_SHOCK",
      affectDistribution: { FEAR: 0.70, SURPRISE: 0.80 },
      valence: -0.30,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: ["dậy sóng"],
    surfaceRealization: true,
    semanticAssertions: ["INTERNAL_PSYCHIC_TURMOIL"]
  },
  {
    targetZh: "灵魂剧痛",
    pattern: /灵魂剧痛|灵魂撕裂|linh hồn đau đớn/,
    targetSlot: STYLE_SLOTS.SOUL_PRESSURE,
    candidateVi: "linh hồn đau đớn như bị xé toạc",
    signature: createSemanticSignature({
      denotation: "SOUL_AGONY",
      affectDistribution: { FEAR: 0.85, DESPAIR: 0.80 },
      valence: -0.60,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: ["như bị xé toạc"],
    surfaceRealization: true,
    semanticAssertions: ["SEVERE_SPIRITUAL_DAMAGE"]
  },
  {
    targetZh: "展开领域",
    pattern: /展开领域|释放领域|lĩnh vực triển khai|mở ra lĩnh vực/,
    targetSlot: STYLE_SLOTS.DOMAIN_EXPANSION,
    candidateVi: "lĩnh vực tuyệt đối ầm ầm mở rộng bao trùm vạn dặm",
    signature: createSemanticSignature({
      denotation: "ABSOLUTE_DOMAIN_EXPANSION",
      affectDistribution: { SOLEMN: 0.90, RESOLUTE: 0.90 },
      valence: 0.30,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.20,
    introducedInformation: ["vạn dặm"],
    surfaceRealization: true,
    semanticAssertions: ["SOUL_DOMAIN_ACTIVATED"]
  }
];

function createDivineSenseProvider() {
  return Object.freeze({
    id: "divine-sense-provider",
    providerId: "divine-sense-provider",
    domain: "DIVINE_SENSE",
    supportedSlots: Object.freeze([
      STYLE_SLOTS.DIVINE_SENSE_SCAN,
      STYLE_SLOTS.SOUL_PRESSURE,
      STYLE_SLOTS.DOMAIN_EXPANSION
    ]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.DIVINE_SENSE) || 0.85;

      for (const def of DIVINE_SENSE_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "divine-sense-provider",
              domain: "DIVINE_SENSE",
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
              provenance: `divine-sense-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createDivineSenseProvider,
  DIVINE_SENSE_CONTRIBUTION_DEFINITIONS
};
