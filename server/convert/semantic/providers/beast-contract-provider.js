"use strict";

/**
 * Beast Taming & Familiar Contract Contribution Provider (Phase 2B - Wave A)
 * Domain: BEAST_TAMING
 * 
 * Target Slots:
 * - BEAST_CONTRACT (Soul pact arrays, equal symbiote contracts, master-servant binds)
 * - BEAST_EVOLUTION (Mythical beast breakthroughs, bloodline rank awakenings)
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const BEAST_CONTRACT_CONTRIBUTION_DEFINITIONS = [
  // 1. BEAST_CONTRACT
  {
    targetZh: "契约法阵",
    pattern: /契约法阵|契约阵法|契约之阵/,
    targetSlot: STYLE_SLOTS.BEAST_CONTRACT,
    candidateVi: "trận pháp khế ước linh hồn rực sáng hào quang rực rỡ",
    signature: createSemanticSignature({
      denotation: "CONTRACT_ARRAY",
      affectDistribution: { SOLEMN: 0.85, RESOLUTE: 0.70 },
      valence: 0.50,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["linh hồn", "hào quang"]
  },
  {
    targetZh: "平等契约",
    pattern: /平等契约|共生契约/,
    targetSlot: STYLE_SLOTS.BEAST_CONTRACT,
    candidateVi: "lạc ấn khế ước bình đẳng cộng sinh khắc sâu vào thức hải",
    signature: createSemanticSignature({
      denotation: "EQUAL_CONTRACT",
      affectDistribution: { SOLEMN: 0.85, TRANQUIL: 0.60 },
      valence: 0.60,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "ELEVATED",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["thức hải"]
  },
  {
    targetZh: "主仆契约",
    pattern: /主仆契约|主奴契约/,
    targetSlot: STYLE_SLOTS.BEAST_CONTRACT,
    candidateVi: "khế ước chủ nô tuyệt đối trói buộc linh hồn",
    signature: createSemanticSignature({
      denotation: "MASTER_SERVANT_CONTRACT",
      affectDistribution: { SOLEMN: 0.90, HOSTILITY: 0.50 },
      valence: 0.10,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["linh hồn"]
  },

  // 2. BEAST_EVOLUTION
  {
    targetZh: "灵兽进阶",
    pattern: /本命灵兽进化|灵兽进阶|灵宠进阶|妖兽进阶/,
    targetSlot: STYLE_SLOTS.BEAST_EVOLUTION,
    candidateVi: "bản mệnh linh thú bứt phá tiến hóa lên đẳng cấp thần thoại",
    signature: createSemanticSignature({
      denotation: "BEAST_EVOLUTION",
      affectDistribution: { JOY: 0.90, SOLEMN: 0.80 },
      valence: 0.80,
      intensity: 0.90,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.60 },
    tone: "ELEVATED",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["thần thoại"]
  }
];

function createBeastContractProvider() {
  return Object.freeze({
    providerId: "beast-contract-provider",
    domain: "BEAST_TAMING",
    getSuggestions: (clauseIR, context = {}) => {
      const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
      const domainWeight = (context && context.domainWeights && context.domainWeights.BEAST_TAMING) || 0.0;
      const contributions = [];

      for (const def of BEAST_CONTRACT_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(sourceZh)) || sourceZh.includes(def.targetZh)) {
          contributions.push(createStylistContribution({
            providerId: "beast-contract-provider",
            domain: "BEAST_TAMING",
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
            provenance: `beast-contract-provider:${def.targetZh}`
          }));
        }
      }

      return Object.freeze({
        providerId: "beast-contract-provider",
        domain: "BEAST_TAMING",
        confidence: domainWeight,
        contributions: Object.freeze(contributions),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createBeastContractProvider,
  BEAST_CONTRACT_CONTRIBUTION_DEFINITIONS
};
