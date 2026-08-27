"use strict";

/**
 * Cyberpunk, VR & Mecha Contribution Provider (Phase 2B - Wave A)
 * Domain: CYBER_SCIFI
 * 
 * Target Slots:
 * - CYBER_INTERFACE (Neural links, full-dive VR immersion)
 * - CYBER_MECHA (Holographic projections, nuclear mecha power, cybernetic implants)
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const CYBER_CONTRIBUTION_DEFINITIONS = [
  // 1. CYBER_INTERFACE
  {
    targetZh: "脑机接口",
    pattern: /脑机接口|机脑接口/,
    targetSlot: STYLE_SLOTS.CYBER_INTERFACE,
    candidateVi: "giao diện thần kinh não bộ đồng bộ 100%",
    signature: createSemanticSignature({
      denotation: "NEURAL_INTERFACE",
      affectDistribution: { SOLEMN: 0.80, RESOLUTE: 0.70 },
      valence: 0.20,
      intensity: 0.75,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["100%"]
  },
  {
    targetZh: "潜入虚拟",
    pattern: /潜入虚拟|潜入全息|潜入网络/,
    targetSlot: STYLE_SLOTS.CYBER_INTERFACE,
    candidateVi: "thâm nhập không gian thực tế ảo toàn phần",
    signature: createSemanticSignature({
      denotation: "VIRTUAL_DIVE",
      affectDistribution: { SURPRISE: 0.70, SOLEMN: 0.60 },
      valence: 0.30,
      intensity: 0.70,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.92,
    expansionCost: 0.10,
    introducedInformation: ["toàn phần"]
  },

  // 2. CYBER_MECHA
  {
    targetZh: "全息投影",
    pattern: /全息投影|全息影像|全息图/,
    targetSlot: STYLE_SLOTS.CYBER_MECHA,
    candidateVi: "hình chiếu không gian ba chiều holographic lập thể hiện lên sắc nét",
    signature: createSemanticSignature({
      denotation: "HOLOGRAPHIC_PROJECTION",
      affectDistribution: { SURPRISE: 0.75, SOLEMN: 0.65 },
      valence: 0.40,
      intensity: 0.65,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.20,
    introducedInformation: ["holographic", "sắc nét"]
  },
  {
    targetZh: "机甲充能",
    pattern: /机甲充能|机甲充能完毕|机甲充电机/,
    targetSlot: STYLE_SLOTS.CYBER_MECHA,
    candidateVi: "cơ giáp chiến đấu nạp đầy năng lượng nguyên tử sẵn sàng xuất kích",
    signature: createSemanticSignature({
      denotation: "MECHA_CHARGED",
      affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.75 },
      valence: 0.50,
      intensity: 0.85,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.20,
    introducedInformation: ["nguyên tử", "xuất kích"]
  },
  {
    targetZh: "义体植入",
    pattern: /义体植入|植入义体|安装义体/,
    targetSlot: STYLE_SLOTS.CYBER_MECHA,
    candidateVi: "cấy ghép bộ phận cơ khí sinh học công nghệ cao",
    signature: createSemanticSignature({
      denotation: "CYBERNETIC_IMPLANT",
      affectDistribution: { SOLEMN: 0.80, RESOLUTE: 0.70 },
      valence: 0.20,
      intensity: 0.70,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["công nghệ cao"]
  }
];

function createCyberScifiProvider() {
  return Object.freeze({
    providerId: "cyber-scifi-provider",
    domain: "CYBER_SCIFI",
    getSuggestions: (clauseIR, context = {}) => {
      const sourceZh = (clauseIR && clauseIR.sourceZh) || "";
      const domainWeight = (context && context.domainWeights && context.domainWeights.CYBER_SCIFI) || 0.0;
      const contributions = [];

      for (const def of CYBER_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(sourceZh)) || sourceZh.includes(def.targetZh)) {
          contributions.push(createStylistContribution({
            providerId: "cyber-scifi-provider",
            domain: "CYBER_SCIFI",
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
            forbiddenContexts: ["CLASSICAL_DAOISM", "ZEN_TEA"],
            semanticExpansionCost: def.expansionCost,
            introducedInformation: def.introducedInformation,
            introducedMetaphor: false,
            provenance: `cyber-scifi-provider:${def.targetZh}`
          }));
        }
      }

      return Object.freeze({
        providerId: "cyber-scifi-provider",
        domain: "CYBER_SCIFI",
        confidence: domainWeight,
        contributions: Object.freeze(contributions),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createCyberScifiProvider,
  CYBER_CONTRIBUTION_DEFINITIONS
};
