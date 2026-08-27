"use strict";

/**
 * Ancient Chronology & Temporal Measure Contribution Provider (Phase 2B - Wave C1)
 * Domain: CHRONOLOGY
 * 
 * Target Slots:
 * - TEMPORAL_MEASURE (Ancient durations: incense sticks, tea intervals, breaths, night watches)
 * - TRANSCENDENCE_TIME (Time passage perception)
 * 
 * Architecture Invariants:
 * - Lexical normalization of ancient duration measures WITHOUT inventing ungrounded modifiers (e.g. "ngắn ngủi", "rất lâu").
 * - Preserves temporal aspects and durations as stated in source.
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const CHRONOLOGY_CONTRIBUTION_DEFINITIONS = [
  // 1. Incense Burning Time (一炷香 / 半炷香)
  {
    targetZh: "一炷香功夫",
    pattern: /一炷香功夫|一炷香的时间|一炷香时间|一炷香之久|一炷香/,
    targetSlot: STYLE_SLOTS.TEMPORAL_MEASURE,
    candidateVi: "chừng tàn một nén nhang",
    signature: createSemanticSignature({
      denotation: "INCENSE_DURATION",
      affectDistribution: { TRANQUIL: 0.70, SOLEMN: 0.60 },
      valence: 0.50,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.10 },
    tone: "NEUTRAL",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.05,
    introducedInformation: []
  },
  {
    targetZh: "半炷香功夫",
    pattern: /半炷香功夫|半炷香的时间|半炷香时间|半炷香/,
    targetSlot: STYLE_SLOTS.TEMPORAL_MEASURE,
    candidateVi: "chừng tàn nửa nén nhang",
    signature: createSemanticSignature({
      denotation: "HALF_INCENSE_DURATION",
      affectDistribution: { TRANQUIL: 0.70, SOLEMN: 0.60 },
      valence: 0.50,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.10 },
    tone: "NEUTRAL",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.05,
    introducedInformation: []
  },

  // 2. Tea Drinking Time (一盏茶 / 半盏茶)
  {
    targetZh: "一盏茶功夫",
    pattern: /一盏茶功夫|一盏茶的时间|一盏茶时间|一盏茶之久|一盏茶/,
    targetSlot: STYLE_SLOTS.TEMPORAL_MEASURE,
    candidateVi: "chừng tàn một tuần trà",
    signature: createSemanticSignature({
      denotation: "TEA_DURATION",
      affectDistribution: { TRANQUIL: 0.80, SOLEMN: 0.50 },
      valence: 0.50,
      intensity: 0.35,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.10 },
    tone: "SERENE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.05,
    introducedInformation: []
  },
  {
    targetZh: "半盏茶功夫",
    pattern: /半盏茶功夫|半盏茶的时间|半盏茶时间|半盏茶/,
    targetSlot: STYLE_SLOTS.TEMPORAL_MEASURE,
    candidateVi: "chừng tàn nửa tuần trà",
    signature: createSemanticSignature({
      denotation: "HALF_TEA_DURATION",
      affectDistribution: { TRANQUIL: 0.80, SOLEMN: 0.50 },
      valence: 0.50,
      intensity: 0.35,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.10 },
    tone: "SERENE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.05,
    introducedInformation: []
  },

  // 3. Breath and Finger-snap Moments (几个呼吸 / 弹指之间)
  {
    targetZh: "几个呼吸",
    pattern: /几个呼吸间|几个呼吸的时间|几个呼吸时间|几个呼吸之后|几个呼吸/,
    targetSlot: STYLE_SLOTS.TEMPORAL_MEASURE,
    candidateVi: "trong vài nhịp thở",
    signature: createSemanticSignature({
      denotation: "FEW_BREATHS_DURATION",
      affectDistribution: { RESOLUTE: 0.60, SOLEMN: 0.50 },
      valence: 0.50,
      intensity: 0.50,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.10 },
    tone: "NEUTRAL",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.0,
    introducedInformation: [] // strictly ZERO ungrounded "ngắn ngủi"
  },
  {
    targetZh: "弹指之间",
    pattern: /弹指之间|一弹指间|弹指顷|弹指/,
    targetSlot: STYLE_SLOTS.TEMPORAL_MEASURE,
    candidateVi: "chỉ trong cái búng tay",
    signature: createSemanticSignature({
      denotation: "FINGER_SNAP_MOMENT",
      affectDistribution: { RESOLUTE: 0.70, SOLEMN: 0.60 },
      valence: 0.50,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.20 },
    tone: "NEUTRAL",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.05,
    introducedInformation: []
  },

  // 4. Night Watches & Passage (半夜三更 / 时光荏苒)
  {
    targetZh: "半夜三更",
    pattern: /半夜三更|三更半夜|三更时分/,
    targetSlot: STYLE_SLOTS.TEMPORAL_MEASURE,
    candidateVi: "nửa đêm canh ba",
    signature: createSemanticSignature({
      denotation: "THIRD_NIGHT_WATCH",
      affectDistribution: { TRANQUIL: 0.60, SOLEMN: 0.70 },
      valence: 0.50,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.10 },
    tone: "NEUTRAL",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.0,
    introducedInformation: []
  },
  {
    targetZh: "时光荏苒",
    pattern: /时光荏苒|岁月如梭|时间过得真快/,
    targetSlot: STYLE_SLOTS.TRANSCENDENCE_TIME,
    candidateVi: "thời gian thấm thoắt trôi qua",
    signature: createSemanticSignature({
      denotation: "TIME_PASSAGE_POETIC",
      affectDistribution: { TRANQUIL: 0.75, ELEVATED: 0.70 },
      valence: 0.50,
      intensity: 0.45,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.20 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.85,
    expansionCost: 0.10,
    introducedInformation: []
  },
  {
    targetZh: "没过多久",
    pattern: /没过多久|不多时|不消多时|未几/,
    targetSlot: STYLE_SLOTS.TEMPORAL_MEASURE,
    candidateVi: "không bao lâu sau",
    signature: createSemanticSignature({
      denotation: "SHORTLY_AFTER",
      affectDistribution: { TRANQUIL: 0.60 },
      valence: 0.50,
      intensity: 0.30,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.05 },
    tone: "NEUTRAL",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.85,
    expansionCost: 0.0,
    introducedInformation: []
  }
];

function createChronologyProvider() {
  return Object.freeze({
    providerId: "chronology-provider",
    domain: "CHRONOLOGY",
    supportedSlots: [STYLE_SLOTS.TEMPORAL_MEASURE, STYLE_SLOTS.TRANSCENDENCE_TIME],

    /**
     * Inspects a ClauseIR and produces StylistContributions.
     * 
     * @param {Object} clauseIR
     * @param {Object} [context]
     * @returns {Array<Object>} StylistContribution[]
     */
    contribute(clauseIR, context = {}) {
      if (!clauseIR || !clauseIR.sourceZh) return [];

      const contributions = [];
      const sourceZh = clauseIR.sourceZh;

      for (const def of CHRONOLOGY_CONTRIBUTION_DEFINITIONS) {
        if (def.pattern.test(sourceZh)) {
          // Verify semantic requirements
          if (def.semanticRequirements?.minIntensity !== undefined) {
            const currentIntensity = clauseIR.semanticSignature?.intensity ?? 0.5;
            if (currentIntensity < def.semanticRequirements.minIntensity) {
              continue;
            }
          }

          contributions.push(
            createStylistContribution({
              providerId: "chronology-provider",
              domain: "CHRONOLOGY",
              targetSlot: def.targetSlot,
              dimension: "LEXICAL",
              sourceSpanZh: def.targetZh,
              candidateVi: def.candidateVi,
              semanticRequirements: def.semanticRequirements,
              semanticSignature: def.signature,
              tone: def.tone,
              register: def.signature.register,
              rhythmPreference: def.rhythmPreference,
              lexicalPriority: def.priority,
              confidence: 0.95,
              semanticExpansionCost: def.expansionCost,
              introducedInformation: def.introducedInformation,
              introducedMetaphor: false,
              surfaceRealization: true,
              provenance: `chronology-provider:${def.targetZh}->${def.targetSlot}`
            })
          );
        }
      }

      return contributions;
    }
  });
}

module.exports = {
  createChronologyProvider,
  CHRONOLOGY_CONTRIBUTION_DEFINITIONS
};
