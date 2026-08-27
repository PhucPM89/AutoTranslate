"use strict";

/**
 * Cosmic Chess & Fate Board Provider (Wave B)
 * 
 * Provides semantic contributions for cosmic chessboards, pawns of destiny,
 * irreversible strategy moves, and sacrifices of pieces for global balance.
 */

const { createSemanticSignature, checkSignatureCompatibility } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const COSMIC_CHESS_CONTRIBUTION_DEFINITIONS = [
  {
    targetZh: "天地为棋盘",
    pattern: /以天地为棋盘|以天地为局|天地为局|lấy trời đất làm cờ|lấy trời đất làm bàn cờ|coi trời đất là bàn cờ/,
    targetSlot: STYLE_SLOTS.COSMIC_CHESS_BOARD,
    candidateVi: "lấy trời đất làm bàn cờ, coi vạn vật chúng sinh tựa như những quân cờ",
    signature: createSemanticSignature({
      denotation: "COSMIC_CHESSBOARD",
      affectDistribution: { SOLEMN: 0.90, TRANQUIL: 0.70 },
      valence: 0.20,
      intensity: 0.80,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "ELEVATED",
    rhythmPreference: "LONG_LYRICAL",
    priority: 0.95,
    expansionCost: 0.20,
    introducedInformation: ["vạn vật chúng sinh"],
    introducedMetaphor: false,
    surfaceRealization: true,
    semanticAssertions: ["METAPHYSICAL_GO_MATCH"]
  },
  {
    targetZh: "众生为子",
    pattern: /众生为棋子|以众生为子|chúng sinh làm quân cờ/,
    targetSlot: STYLE_SLOTS.COSMIC_CHESS_BOARD,
    candidateVi: "coi vạn vật chúng sinh tựa như những quân cờ",
    signature: createSemanticSignature({
      denotation: "BEINGS_AS_PAWNS",
      affectDistribution: { SOLEMN: 0.85, CONTEMPT: 0.40 },
      valence: -0.10,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.15,
    introducedInformation: ["vạn vật"],
    introducedMetaphor: false,
    surfaceRealization: true,
    semanticAssertions: ["MORTAL_PAWNS_OF_FATE"]
  },
  {
    targetZh: "落子无悔",
    pattern: /落子无悔|hạ cờ không hối hận|đặt con cờ không hối hận/,
    targetSlot: STYLE_SLOTS.CHESS_STRATEGY_MOVE,
    candidateVi: "hạ cờ không hối hận, một bước đi định đoạt càn khôn",
    signature: createSemanticSignature({
      denotation: "IRREVERSIBLE_MOVE",
      affectDistribution: { RESOLUTE: 0.95, SOLEMN: 0.80 },
      valence: 0.30,
      intensity: 0.85,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.50 },
    tone: "FIERCE",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.95,
    expansionCost: 0.15,
    introducedInformation: ["định đoạt càn khôn"],
    surfaceRealization: true,
    semanticAssertions: ["DECISIVE_CHESS_MOVE"]
  },
  {
    targetZh: "胜负已分",
    pattern: /胜负已分|胜负已定|thắng bại đã phân|thắng thua đã chia/,
    targetSlot: STYLE_SLOTS.CHESS_STRATEGY_MOVE,
    candidateVi: "thắng bại đã ngã ngũ, thế cờ đã định đoạt",
    signature: createSemanticSignature({
      denotation: "VICTORY_DECREED",
      affectDistribution: { SOLEMN: 0.85, TRANQUIL: 0.60 },
      valence: 0.10,
      intensity: 0.75,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.40 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.90,
    expansionCost: 0.10,
    introducedInformation: ["thế cờ"],
    surfaceRealization: true,
    semanticAssertions: ["GAME_OUTCOME_RESOLVED"]
  },
  {
    targetZh: "弃车保帅",
    pattern: /弃车保帅|bỏ xe giữ tướng/,
    targetSlot: STYLE_SLOTS.CHESS_STRATEGY_MOVE,
    candidateVi: "chấp nhận bỏ xe giữ tướng, bảo toàn đại cục",
    signature: createSemanticSignature({
      denotation: "TACTICAL_SACRIFICE",
      affectDistribution: { RESOLUTE: 0.85, SOLEMN: 0.70 },
      valence: 0.0,
      intensity: 0.70,
      register: "CLASSICAL_LITERARY"
    }),
    semanticRequirements: { minIntensity: 0.30 },
    tone: "SOLEMN",
    rhythmPreference: "FLOWING_BALANCED",
    priority: 0.85,
    expansionCost: 0.10,
    introducedInformation: ["bảo toàn đại cục"],
    surfaceRealization: true,
    semanticAssertions: ["STRATEGIC_PIECE_SACRIFICE"]
  }
];

function createCosmicChessProvider() {
  return Object.freeze({
    id: "cosmic-chess-provider",
    providerId: "cosmic-chess-provider",
    domain: "COSMIC_CHESS",
    supportedSlots: Object.freeze([
      STYLE_SLOTS.COSMIC_CHESS_BOARD,
      STYLE_SLOTS.CHESS_STRATEGY_MOVE
    ]),

    proposeContributions(clause, context = {}) {
      if (!clause || !clause.sourceZh) return [];

      const contributions = [];
      const text = clause.sourceZh;
      const domainWeight = (context && context.domainWeights && context.domainWeights.COSMIC_CHESS) || 0.85;

      for (const def of COSMIC_CHESS_CONTRIBUTION_DEFINITIONS) {
        if ((def.pattern && def.pattern.test(text)) || text.includes(def.targetZh)) {
          contributions.push(
            createStylistContribution({
              providerId: "cosmic-chess-provider",
              domain: "COSMIC_CHESS",
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
              provenance: `cosmic-chess-provider:${def.targetZh}`
            })
          );
        }
      }

      return Object.freeze(contributions);
    }
  });
}

module.exports = {
  createCosmicChessProvider,
  COSMIC_CHESS_CONTRIBUTION_DEFINITIONS
};
