"use strict";

/**
 * Forensic & Detective Mystery Provider (Wave B)
 * 
 * Provides semantic contributions for locked room murders, ironclad alibis,
 * minute forensic clues, and dramatic revelation of truth.
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const FORENSIC_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "密室杀人",
    pattern: /密室杀人|密室谋杀|mật thất sát nhân|án mạng mật thất/,
    targetSlot: STYLE_SLOTS.FORENSIC_MYSTERY,
    candidateVi: "vụ án mạng bí ẩn trong mật thất phong tỏa hoàn toàn",
    signature: createSemanticSignature({
      denotation: "LOCKED_ROOM_MURDER",
      affectDistribution: { SOLEMN: 0.85, SURPRISE: 0.70 },
      valence: -0.40,
      intensity: 0.75,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["phong tỏa hoàn toàn"],
    surfaceRealization: true,
    semanticAssertions: ["LOCKED_ROOM_CRIME_SCENE"]
  },
  {
    targetZh: "不在场证明",
    pattern: /不在场证明|bằng chứng ngoại phạm/,
    targetSlot: STYLE_SLOTS.FORENSIC_MYSTERY,
    candidateVi: "bằng chứng ngoại phạm hoàn hảo không một kẽ hở",
    signature: createSemanticSignature({
      denotation: "ALIBI_PROOF",
      affectDistribution: { RESOLUTE: 0.80, TRANQUIL: 0.60 },
      valence: 0.20,
      intensity: 0.65,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.85,
    expansionCost: 0.15,
    introducedInformation: ["không một kẽ hở"],
    surfaceRealization: true,
    semanticAssertions: ["IRONCLAD_ALIBI_VERIFIED"]
  },
  {
    targetZh: "蛛丝马迹",
    pattern: /蛛丝马迹|manh mối tơ nhện|dấu vết tơ nhện/,
    targetSlot: STYLE_SLOTS.FORENSIC_MYSTERY,
    candidateVi: "từng manh mối vụn vặt và dấu vết tơ nhện khó nhận ra nhất",
    signature: createSemanticSignature({
      denotation: "MINUTE_CLUES",
      affectDistribution: { TRANQUIL: 0.75, SOLEMN: 0.70 },
      valence: 0.10,
      intensity: 0.60,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SERENE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["khó nhận ra nhất"],
    surfaceRealization: true,
    semanticAssertions: ["SUBTLE_CRIME_SCENE_TRACE"]
  },
  {
    targetZh: "真相大白",
    pattern: /真相大白|水落石出|chân tướng đại bạch/,
    targetSlot: STYLE_SLOTS.FORENSIC_TRUTH,
    candidateVi: "toàn bộ chân tướng cuối cùng cũng được phơi bày ra ánh sáng",
    signature: createSemanticSignature({
      denotation: "TRUTH_REVEALED",
      affectDistribution: { SURPRISE: 0.85, RESOLUTE: 0.80 },
      valence: 0.40,
      intensity: 0.80,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["ra ánh sáng"],
    surfaceRealization: true,
    semanticAssertions: ["CASE_SOLVED_TRUTH_EXPOSED"]
  }
];

function createForensicDeductionProvider() {
  return Object.freeze({
    id: "forensic-deduction-provider",
    providerId: "forensic-deduction-provider",
    domain: "FORENSIC_DEDUCTION",
    supportedSlots: Object.freeze([
      STYLE_SLOTS.FORENSIC_MYSTERY,
      STYLE_SLOTS.FORENSIC_TRUTH
    ]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.FORENSIC_DEDUCTION) || 0.85;

      for (const def of FORENSIC_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "forensic-deduction-provider",
              domain: "FORENSIC_DEDUCTION",
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
              forbiddenContexts: ["SLAPSTICK_COMEDY"],
              semanticExpansionCost: def.expansionCost,
              introducedInformation: def.introducedInformation,
              introducedMetaphor: def.introducedMetaphor || false,
              surfaceRealization: def.surfaceRealization,
              semanticAssertions: def.semanticAssertions,
              provenance: `forensic-deduction-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createForensicDeductionProvider,
  FORENSIC_CONTRIBUTION_DEFINITIONS
};
