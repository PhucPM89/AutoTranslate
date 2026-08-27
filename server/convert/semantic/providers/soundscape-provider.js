"use strict";

/**
 * Soundscape & Onomatopoeia Contribution Provider (Phase 2B - Wave C1)
 * Domain: SOUNDSCAPE
 * 
 * Target Slots:
 * - SOUNDSCAPE_EFFECT (Acoustic resonance, impacts, bone fractures, liquid bursts, metallic clashes)
 * 
 * Architecture Invariants:
 * - Preserves source intensity: Low-intensity snaps/clashes must NOT escalate into cosmic cataclysms.
 * - Dimension: AUDITORY / RHYTHMIC.
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const SOUNDSCAPE_CONTRIBUTION_DEFINITIONS = [
  // 1. Impacts & Explosions (砰的一声 / 轰隆隆)
  {
    targetZh: "砰的一声",
    pattern: /砰的一声响起|砰的一声震响|砰的一声/,
    targetSlot: STYLE_SLOTS.SOUNDSCAPE_EFFECT,
    candidateVi: "rầm một tiếng vang dội",
    signature: createSemanticSignature({
      denotation: "IMPACT_CRASH_SOUND",
      affectDistribution: { FIERCE: 0.80, RESOLUTE: 0.70 },
      valence: 0.40,
      intensity: 0.75,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: []
  },
  {
    targetZh: "轰隆隆",
    pattern: /轰隆隆的巨响|轰隆隆巨响|轰隆隆作响|轰隆隆/,
    targetSlot: STYLE_SLOTS.SOUNDSCAPE_EFFECT,
    candidateVi: "tiếng nổ ầm ầm rền vang",
    signature: createSemanticSignature({
      denotation: "RUMBLING_EXPLOSION_SOUND",
      affectDistribution: { FIERCE: 0.85, SOLEMN: 0.75 },
      valence: 0.40,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: []
  },

  // 2. Fractures & Bone Cracks (咔嚓 / 咯吱)
  {
    targetZh: "咔嚓一声",
    pattern: /咔嚓一声脆响|咔嚓一声响起|咔嚓一声|咔嚓作响/,
    targetSlot: STYLE_SLOTS.SOUNDSCAPE_EFFECT,
    candidateVi: "rắc một tiếng giòn giã",
    signature: createSemanticSignature({
      denotation: "CRACKING_FRACTURE_SOUND",
      affectDistribution: { FIERCE: 0.75, RESOLUTE: 0.70 },
      valence: 0.35,
      intensity: 0.70,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.05,
    introducedInformation: []
  },

  // 3. Liquid Bursts & Blood Spits (噗的一声 / 噗嗤)
  {
    targetZh: "噗的一声",
    pattern: /噗的一声喷出|噗嗤一声|噗的一声/,
    targetSlot: STYLE_SLOTS.SOUNDSCAPE_EFFECT,
    candidateVi: "phụt một tiếng hộc ra",
    signature: createSemanticSignature({
      denotation: "SPURT_SPIT_SOUND",
      affectDistribution: { FIERCE: 0.70, AWE: 0.50 },
      valence: 0.30,
      intensity: 0.65,
      register: "VERNACULAR"
    }),
    semanticRequirements: { minIntensity: 0.25 },
    tone: "FIERCE",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.05,
    introducedInformation: []
  },

  // 4. Weapon Resonance & Clangs (剑鸣嗡嗡 / 叮叮当当 / 铿锵)
  {
    targetZh: "剑鸣嗡嗡",
    pattern: /剑鸣嗡嗡|长剑嗡鸣|剑身嗡鸣|长剑轻吟/,
    targetSlot: STYLE_SLOTS.SOUNDSCAPE_EFFECT,
    candidateVi: "thanh kiếm rung lên ong ong rền rĩ",
    signature: createSemanticSignature({
      denotation: "SWORD_HUM_SOUND",
      affectDistribution: { ELEVATED: 0.80, SOLEMN: 0.75 },
      valence: 0.50,
      intensity: 0.65,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "ELEVATED",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.10,
    introducedInformation: []
  },
  {
    targetZh: "叮的一声",
    pattern: /叮的一声脆响|叮的一声响起|叮的一声|叮叮当当|铿锵作响/,
    targetSlot: STYLE_SLOTS.SOUNDSCAPE_EFFECT,
    candidateVi: "keng một tiếng sắc lẹm",
    signature: createSemanticSignature({
      denotation: "METALLIC_CLASH_SOUND",
      affectDistribution: { RESOLUTE: 0.80, FIERCE: 0.70 },
      valence: 0.50,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "NEUTRAL",
    rhythmPreference: "FAST_PUNCHY",
    priority: 0.90,
    expansionCost: 0.05,
    introducedInformation: []
  },

  // 5. Wind Howling & Rushes (呼呼风声 / 狂风呼啸)
  {
    targetZh: "呼呼作响",
    pattern: /呼呼作响|狂风呼啸|风声呼呼|呼啸之声/,
    targetSlot: STYLE_SLOTS.SOUNDSCAPE_EFFECT,
    candidateVi: "tiếng gió rít gào vù vù",
    signature: createSemanticSignature({
      denotation: "WIND_HOWLING_SOUND",
      affectDistribution: { SOLEMN: 0.70, FIERCE: 0.65 },
      valence: 0.45,
      intensity: 0.60,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.20 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.85,
    expansionCost: 0.05,
    introducedInformation: []
  }
];

function createSoundscapeProvider() {
  return Object.freeze({
    providerId: "soundscape-provider",
    domain: "SOUNDSCAPE",
    supportedSlots: [STYLE_SLOTS.SOUNDSCAPE_EFFECT],

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

      for (const def of SOUNDSCAPE_CONTRIBUTION_DEFINITIONS) {
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
              providerId: "soundscape-provider",
              domain: "SOUNDSCAPE",
              targetSlot: def.targetSlot,
              dimension: "RHYTHMIC",
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
              provenance: `soundscape-provider:${def.targetZh}->${def.targetSlot}`
            })
          );
        }
      }

      return contributions;
    }
  });
}

module.exports = {
  createSoundscapeProvider,
  SOUNDSCAPE_CONTRIBUTION_DEFINITIONS
};
