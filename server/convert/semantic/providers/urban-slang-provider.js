"use strict";

/**
 * Urban & Internet Slang Localization Provider (Phase 2B - Wave C2B-2.1 Hardened)
 * Domain: URBAN_SLANG
 *
 * Semantic Model:
 * - Register-aware localization provider mapping contemporary Chinese internet slang,
 *   gaming jargon, and modern social meme expressions into Vietnamese equivalents.
 * - StyleSlot: MODERN_VERNACULAR (semanticRole: NARRATIVE_FUNCTION, dimensions: [LEXICAL, REGISTER]).
 * - Target stylistic register does NOT construct source-state facts.
 *
 * Boundary & Context Gating Rules (Wave C2B-2.1):
 * 1. Genre Safety:
 *    - PERMITTED_GENRES: MODERN, URBAN, SCI_FI, GAME, CYBERPUNK, CONTEMPORARY, PARODY, TRANSMIGRATION, SYSTEM.
 *    - RESTRICTED_GENRES: XIANXIA, WUXIA, HISTORICAL, IMPERIAL, RELIGIOUS, COURT, DAOIST, ANCIENT.
 * 2. Text-Role Safety in Restricted Genres:
 *    - Narration / Description / Exposition / Action: 100% ABSTAIN (zero modern slang pollution in classical prose).
 *    - Inner Thought: ABSTAIN unless thinker persona has explicit modern/transmigrator tag.
 *    - Dialogue: ABSTAIN unless speaker persona/speechStyle has explicit modern/transmigrator tag.
 * 3. Persona Safety in Permitted Genres:
 *    - Archaic/formal speakers (e.g. ancient master, formal imperial dignitary) suppress modern slang.
 * 4. Zero Discourse Creation:
 *    - Never invents Dialogue Acts, speaker intentions, or relationship facts.
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

// =========================================================================
// Genre Categorization Constants
// =========================================================================
const PERMITTED_SLANG_GENRES = Object.freeze(new Set([
  "MODERN",
  "URBAN",
  "SCI_FI",
  "SCIFI",
  "GAME",
  "CYBERPUNK",
  "CONTEMPORARY",
  "PARODY",
  "TRANSMIGRATION",
  "SYSTEM",
  "CYBER_SCIFI"
]));

const RESTRICTED_CLASSICAL_GENRES = Object.freeze(new Set([
  "XIANXIA",
  "WUXIA",
  "HISTORICAL",
  "IMPERIAL",
  "RELIGIOUS",
  "COURT",
  "DAOIST",
  "ANCIENT",
  "CULTIVATION"
]));

const MODERN_SPEAKER_PERSONAS = Object.freeze(new Set([
  "MODERN_CASUAL",
  "GAMER",
  "TRANSMIGRATOR",
  "SLANG",
  "MODERN",
  "NETIZEN",
  "CASUAL"
]));

const ARCHAIC_FORMAL_PERSONAS = Object.freeze(new Set([
  "ARCHAIC_FORMAL",
  "ANCIENT_MASTER",
  "FORMAL_COURT",
  "SOLEMN",
  "IMPERIAL_NOBLE",
  "DAOIST_ELDER"
]));

// =========================================================================
// Slang Categories
// =========================================================================
const SLANG_CATEGORIES = Object.freeze({
  LIFE_ATTITUDE: "LIFE_ATTITUDE",
  SOCIAL_PHENOMENON: "SOCIAL_PHENOMENON",
  FACE_SHAME: "FACE_SHAME",
  FACE_PRETENSION: "FACE_PRETENSION",
  FACE_SLAP: "FACE_SLAP",
  GAMING_TECH: "GAMING_TECH",
  SCI_FI_TECH: "SCI_FI_TECH"
});

// =========================================================================
// Urban Slang Contribution Definitions (11 Migrated Rules)
// =========================================================================
const URBAN_SLANG_CONTRIBUTION_DEFINITIONS = Object.freeze([
  // Rule 1: Tang ping / Lying flat (生活态度)
  {
    ruleId: "URBAN_R01",
    targetVi: "thảng bình|nằm phẳng",
    pattern: /(?:thảng bình|nằm phẳng)/i,
    candidateVi: "buông xuôi mặc kệ đời",
    slangCategory: SLANG_CATEGORIES.LIFE_ATTITUDE,
    signature: createSemanticSignature({
      denotation: "LYING_FLAT_LIFESTYLE",
      affectDistribution: { TRANQUIL: 0.50 },
      valence: -0.10,
      intensity: 0.30,
      register: "MODERN_INTERNET"
    }),
    tone: "RESIGNED",
    priority: 0.85
  },

  // Rule 2: Involution / Toxic competition (内卷)
  {
    ruleId: "URBAN_R02",
    targetVi: "nội quyển",
    pattern: /nội quyển/i,
    candidateVi: "cạnh tranh khốc liệt",
    slangCategory: SLANG_CATEGORIES.SOCIAL_PHENOMENON,
    signature: createSemanticSignature({
      denotation: "INVOLUTION_TOXIC_COMPETITION",
      affectDistribution: { SOLEMN: 0.55 },
      valence: -0.20,
      intensity: 0.45,
      register: "MODERN_INTERNET"
    }),
    tone: "CRITICAL",
    priority: 0.85
  },

  // Rule 3: Humble-bragging (凡尔赛)
  {
    ruleId: "URBAN_R03",
    targetVi: "phàm nhĩ tái",
    pattern: /phàm nhĩ tái/i,
    candidateVi: "khoe mẽ ngầm",
    slangCategory: SLANG_CATEGORIES.SOCIAL_PHENOMENON,
    signature: createSemanticSignature({
      denotation: "HUMBLE_BRAGGING",
      affectDistribution: { AMUSEMENT: 0.60, CONTEMPT: 0.40 },
      valence: -0.10,
      intensity: 0.40,
      register: "MODERN_INTERNET"
    }),
    tone: "IRONIC",
    priority: 0.85
  },

  // Rule 4: Leading the narrative / Gatekeeping (带节奏)
  {
    ruleId: "URBAN_R04",
    targetVi: "đái tiết tấu",
    pattern: /đái tiết tấu/i,
    candidateVi: "dắt mũi dư luận",
    slangCategory: SLANG_CATEGORIES.SOCIAL_PHENOMENON,
    signature: createSemanticSignature({
      denotation: "NARRATIVE_MANIPULATION",
      affectDistribution: { SOLEMN: 0.50, CONTEMPT: 0.40 },
      valence: -0.30,
      intensity: 0.50,
      register: "MODERN_INTERNET"
    }),
    tone: "CRITICAL",
    priority: 0.85
  },

  // Rule 5: Social death / Public humiliation (社死)
  {
    ruleId: "URBAN_R05",
    targetVi: "xã tử",
    pattern: /(?:xã tử|xã hội tính tử vong)/i,
    candidateVi: "mất mặt trước đám đông",
    slangCategory: SLANG_CATEGORIES.FACE_SHAME,
    signature: createSemanticSignature({
      denotation: "PUBLIC_HUMILIATION_SHAME",
      affectDistribution: { SOLEMN: 0.70 },
      valence: -0.50,
      intensity: 0.60,
      register: "MODERN_INTERNET"
    }),
    tone: "EMBARRASSED",
    priority: 0.88
  },

  // Rule 6: Activating cheats / Hacking (开挂)
  {
    ruleId: "URBAN_R06",
    targetVi: "khai quải|mở quải",
    pattern: /(?:khai quải|mở quải)/i,
    candidateVi: "bật hack",
    slangCategory: SLANG_CATEGORIES.GAMING_TECH,
    signature: createSemanticSignature({
      denotation: "CHEAT_CODE_ACTIVATION",
      affectDistribution: { ELEVATED: 0.65, AMUSEMENT: 0.50 },
      valence: 0.40,
      intensity: 0.50,
      register: "MODERN_INTERNET"
    }),
    tone: "EXCITED",
    priority: 0.85
  },

  // Rule 7: Krypton / Pay-to-win (氪金)
  {
    ruleId: "URBAN_R07",
    targetVi: "khắc kim",
    pattern: /khắc kim/i,
    candidateVi: "nạp tiền cày game",
    slangCategory: SLANG_CATEGORIES.GAMING_TECH,
    signature: createSemanticSignature({
      denotation: "PAY_TO_WIN_GAMING",
      affectDistribution: { AMUSEMENT: 0.55 },
      valence: -0.10,
      intensity: 0.40,
      register: "MODERN_INTERNET"
    }),
    tone: "IRONIC",
    priority: 0.85
  },

  // Rule 8: Black technology / Advanced dark tech (黑科技)
  {
    ruleId: "URBAN_R08",
    targetVi: "hắc khoa kỹ",
    pattern: /hắc khoa kỹ/i,
    candidateVi: "siêu công nghệ hắc ám",
    slangCategory: SLANG_CATEGORIES.SCI_FI_TECH,
    signature: createSemanticSignature({
      denotation: "BLACK_TECHNOLOGY_SCIFI",
      affectDistribution: { SOLEMN: 0.60, ELEVATED: 0.50 },
      valence: 0.30,
      intensity: 0.55,
      register: "MODERN_INTERNET"
    }),
    tone: "AWE",
    priority: 0.85
  },

  // Rule 9 & 10: Pretension / Showing off (装逼 / 装X)
  {
    ruleId: "URBAN_R09",
    targetVi: "trang bức|trang x",
    pattern: /(?:trang bức|trang x\b)/i,
    candidateVi: "làm màu ra vẻ",
    slangCategory: SLANG_CATEGORIES.FACE_PRETENSION,
    signature: createSemanticSignature({
      denotation: "PRETENTIOUS_POSTURING",
      affectDistribution: { CONTEMPT: 0.60, AMUSEMENT: 0.50 },
      valence: -0.20,
      intensity: 0.50,
      register: "MODERN_INTERNET"
    }),
    tone: "CONTEMPTUOUS",
    priority: 0.85
  },

  // Rule 11: Face slap (打脸)
  {
    ruleId: "URBAN_R11",
    targetVi: "đánh mặt",
    pattern: /đánh mặt(?!\s+thật)/i,
    candidateVi: "vả mặt bôm bốp",
    slangCategory: SLANG_CATEGORIES.FACE_SLAP,
    signature: createSemanticSignature({
      denotation: "FACE_SLAPPING_HUMILIATION",
      affectDistribution: { CONTEMPT: 0.75, ELEVATED: 0.50 },
      valence: -0.40,
      intensity: 0.65,
      register: "MODERN_INTERNET"
    }),
    tone: "TRIUMPHANT",
    priority: 0.88
  },

  // Rule 12: Face slap (hard)
  {
    ruleId: "URBAN_R12",
    targetVi: "vả mặt thật đau",
    pattern: /vả mặt thật đau/i,
    candidateVi: "vả mặt đau điếng",
    slangCategory: SLANG_CATEGORIES.FACE_SLAP,
    signature: createSemanticSignature({
      denotation: "FACE_SLAP_PAINFUL_EMPHASIS",
      affectDistribution: { CONTEMPT: 0.70, ELEVATED: 0.60 },
      valence: -0.45,
      intensity: 0.65,
      register: "MODERN_INTERNET"
    }),
    tone: "TRIUMPHANT",
    priority: 0.88
  }
]);

// =========================================================================
// Context Gating Evaluator
// =========================================================================

/**
 * Determines whether urban slang realization is permitted for a given clause and context.
 *
 * @param {Object} clauseIR
 * @param {Object} context
 * @returns {{ allowed: boolean, reason: string, genre: string }}
 */
function evaluateSlangContextEligibility(clauseIR, context = {}) {
  const rawGenre = String(
    context.genre ||
    clauseIR.genre ||
    (context.profilerState && context.profilerState.genre) ||
    ""
  ).toUpperCase();

  const primaryDomain = String(context.primaryDomain || "").toUpperCase();
  const role = String(clauseIR.role || "NARRATION").toUpperCase();

  // Extract persona / speech style if available
  const dialogueCtx = context.dialogueContext || {};
  const speakerObj = dialogueCtx.speaker || {};
  const speakerStyle = String(
    speakerObj.speechStyle ||
    speakerObj.persona ||
    context.speakerStyle ||
    context.speakerPersona ||
    ""
  ).toUpperCase();

  const thinkerObj = (clauseIR.cognitiveEvent && clauseIR.cognitiveEvent.thinker) || {};
  const thinkerStyle = String(
    thinkerObj.speechStyle ||
    thinkerObj.persona ||
    context.thinkerStyle ||
    ""
  ).toUpperCase();

  // Determine effective genre
  let effectiveGenre = rawGenre;
  if (!effectiveGenre) {
    if (primaryDomain === "URBAN_SLANG" || (context.domainWeights && context.domainWeights.URBAN_SLANG >= 0.5)) {
      effectiveGenre = "URBAN";
    }
  }

  // 1. Restricted Classical Genres: XIANXIA, WUXIA, HISTORICAL, IMPERIAL, RELIGIOUS, etc.
  if (effectiveGenre && RESTRICTED_CLASSICAL_GENRES.has(effectiveGenre)) {
    // Non-dialogue narration/description/action in classical genre: STRICTLY FORBIDDEN
    if (role !== "DIALOGUE" && role !== "INNER_THOUGHT") {
      return {
        allowed: false,
        reason: `SUPPRESSED_IN_${effectiveGenre}_${role}_TO_PREVENT_GENRE_POLLUTION`,
        genre: effectiveGenre
      };
    }

    // Inner thought in classical genre: only permitted if thinker is explicitly modern/transmigrator
    if (role === "INNER_THOUGHT") {
      if (MODERN_SPEAKER_PERSONAS.has(thinkerStyle)) {
        return {
          allowed: true,
          reason: `PERMITTED_IN_${effectiveGenre}_INNER_THOUGHT_BY_MODERN_THINKER_PERSONA`,
          genre: effectiveGenre
        };
      }
      return {
        allowed: false,
        reason: `SUPPRESSED_IN_${effectiveGenre}_INNER_THOUGHT_FOR_CLASSICAL_THINKER`,
        genre: effectiveGenre
      };
    }

    // Dialogue in classical genre: only permitted if speaker has explicit modern persona
    if (role === "DIALOGUE") {
      if (MODERN_SPEAKER_PERSONAS.has(speakerStyle)) {
        return {
          allowed: true,
          reason: `PERMITTED_IN_${effectiveGenre}_DIALOGUE_BY_MODERN_SPEAKER_PERSONA`,
          genre: effectiveGenre
        };
      }
      return {
        allowed: false,
        reason: `SUPPRESSED_IN_${effectiveGenre}_DIALOGUE_FOR_CLASSICAL_SPEAKER`,
        genre: effectiveGenre
      };
    }

    return { allowed: false, reason: `RESTRICTED_GENRE_${effectiveGenre}`, genre: effectiveGenre };
  }

  // 2. Permitted Modern / Sci-Fi / Game Genres
  if (effectiveGenre && PERMITTED_SLANG_GENRES.has(effectiveGenre)) {
    // In dialogue, check for archaic formal speaker override
    if (role === "DIALOGUE" && ARCHAIC_FORMAL_PERSONAS.has(speakerStyle)) {
      return {
        allowed: false,
        reason: `SUPPRESSED_IN_${effectiveGenre}_DIALOGUE_DUE_TO_ARCHAIC_FORMAL_SPEAKER`,
        genre: effectiveGenre
      };
    }

    // In inner thought, check for archaic formal thinker override
    if (role === "INNER_THOUGHT" && ARCHAIC_FORMAL_PERSONAS.has(thinkerStyle)) {
      return {
        allowed: false,
        reason: `SUPPRESSED_IN_${effectiveGenre}_INNER_THOUGHT_DUE_TO_ARCHAIC_FORMAL_THINKER`,
        genre: effectiveGenre
      };
    }

    return {
      allowed: true,
      reason: `PERMITTED_IN_${effectiveGenre}_GENRE_FOR_${role}`,
      genre: effectiveGenre
    };
  }

  // 3. Fallback / Unspecified Genre:
  // If primary domain is explicit URBAN_SLANG, allow.
  if (primaryDomain === "URBAN_SLANG") {
    return { allowed: true, reason: "PERMITTED_BY_PRIMARY_DOMAIN_URBAN_SLANG", genre: "URBAN" };
  }

  // If a classical domain is explicitly active without modern override, suppress.
  const classicalDomains = new Set([
    "TITLE_HIERARCHY", "ZEN_TEA", "DAOIST_ARRAY", "SWORD_DAO", "WARFARE_SIEGE",
    "ALCHEMY", "IMPERIAL_EDICT", "MANTRA_SEAL", "DIVINE_SENSE"
  ]);
  if (classicalDomains.has(primaryDomain)) {
    return {
      allowed: false,
      reason: `SUPPRESSED_DUE_TO_ACTIVE_CLASSICAL_DOMAIN_${primaryDomain}`,
      genre: "CLASSICAL"
    };
  }

  // Default neutral context: permit in dialogue/action if no classical constraint
  return {
    allowed: true,
    reason: "PERMITTED_IN_UNCONSTRAINED_CONTEXT",
    genre: "GENERAL"
  };
}

// =========================================================================
// Provider Factory
// =========================================================================
function createUrbanSlangProvider() {
  return Object.freeze({
    providerId: "urban-slang-provider",
    domain: "URBAN_SLANG",
    supportedSlots: [STYLE_SLOTS.MODERN_VERNACULAR],

    /**
     * Contribute modern-vernacular candidates for clauses with matching slang patterns,
     * subject to strict genre, textRole, and persona context gating.
     *
     * @param {Object} clauseIR
     * @param {Object} [context]
     * @returns {Array<Object>} StylistContribution[]
     */
    contribute(clauseIR, context = {}) {
      if (!clauseIR || !clauseIR.sourceZh) return [];

      // 1. Context Gating: Check genre, textRole, persona eligibility
      const eligibility = evaluateSlangContextEligibility(clauseIR, context);
      if (!eligibility.allowed) {
        return [];
      }

      // 2. Search Vietnamese translated text (primary) or source Chinese (fallback)
      const searchText = (context && context.translatedText) || clauseIR.sourceZh;
      const contributions = [];

      for (const def of URBAN_SLANG_CONTRIBUTION_DEFINITIONS) {
        if (!def.pattern.test(searchText)) continue;

        contributions.push(
          createStylistContribution({
            providerId: "urban-slang-provider",
            domain: "URBAN_SLANG",
            targetSlot: STYLE_SLOTS.MODERN_VERNACULAR,
            dimension: "REGISTER",
            sourceSpanZh: def.targetVi,
            candidateVi: def.candidateVi,
            semanticRequirements: {
              slangCategory: def.slangCategory,
              requiredEvidence: ["MODERN_SLANG_EXPRESSION"],
              eligibleGenre: eligibility.genre,
              allowReason: eligibility.reason
            },
            semanticSignature: def.signature,
            tone: def.tone,
            register: "MODERN_INTERNET",
            rhythmPreference: "VERNACULAR_NATURAL",
            lexicalPriority: def.priority,
            confidence: 0.90,
            semanticExpansionCost: 0.0,
            introducedInformation: [],
            introducedMetaphor: false,
            surfaceRealization: true,
            provenance: `urban-slang-provider:${def.ruleId}->${STYLE_SLOTS.MODERN_VERNACULAR}:${def.slangCategory}:genre=${eligibility.genre}:role=${clauseIR.role || "NARRATION"}:reason=${eligibility.reason}`
          })
        );
      }

      return contributions;
    },

    getSuggestions(clauseIR, context = {}) {
      const contribs = this.contribute(clauseIR, context);
      const domainWeight = (context.domainWeights && context.domainWeights.URBAN_SLANG) || 0.80;
      return Object.freeze({
        providerId: "urban-slang-provider",
        domain: "URBAN_SLANG",
        confidence: domainWeight,
        contributions: Object.freeze(contribs),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createUrbanSlangProvider,
  evaluateSlangContextEligibility,
  URBAN_SLANG_CONTRIBUTION_DEFINITIONS,
  SLANG_CATEGORIES,
  PERMITTED_SLANG_GENRES,
  RESTRICTED_CLASSICAL_GENRES,
  MODERN_SPEAKER_PERSONAS,
  ARCHAIC_FORMAL_PERSONAS
};
