"use strict";

/**
 * Banter & Satirical Retort Contribution Provider (Phase 2B - Wave C2B-2.1 Hardened)
 * Domain: BANTER
 *
 * Semantic Model (6-Axis):
 * 1. SPEAKER     — EntityId resolved by DiscourseTracker (not guessed from raw text)
 * 2. LISTENER    — EntityId resolved by DiscourseTracker (not guessed from raw text)
 * 3. RELATIONSHIP— Type: MORTAL_ENEMY | ENEMY | PEER | SENIOR_JUNIOR | MASTER_DISCIPLE | RULER_SUBJECT | FRIEND | RIVAL
 * 4. DIALOGUE ACT— TAUNT | RETORT | MOCK | INSULT | BANTER | TEASING | SARCASM | AFFECTIONATE_TEASING | CHALLENGE
 * 5. AFFECT      — Contempt, Amusement, Arrogance, Rivalry, Affection, Hostility
 * 6. REGISTER    — CLASSICAL_TRASH_TALK | WUXIA_BANTER | VERNACULAR_PUNCHY
 *
 * Architecture Invariants:
 * - Banter ≠ Insult: Playful teasing between peers/friends is distinct from hostile taunt/insult between enemies.
 * - Discourse Authority: Provider ABSTAINS if speaker, listener, or relationship is not RESOLVED.
 * - Relationship & Hierarchy Safety: Irreverent banter/insult forbidden in MASTER_DISCIPLE (disciple to master) and RULER_SUBJECT.
 * - Contextual Disambiguation: Same surface sentence (e.g. "你可真厉害") yields TEASING with friends, SARCASM with enemies, ABSTAIN in court.
 * - Zero Pronoun Injection: Never hardcodes pronouns — candidates are pronoun-neutral phrases.
 * - Zero Text-Role Violation: Only activates when ClauseIR.role === "DIALOGUE".
 */

const { createSemanticSignature } = require("../contracts");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

// =========================================================================
// Relationship Types (from DiscourseTracker)
// =========================================================================
const RELATIONSHIP_TYPES = Object.freeze({
  MORTAL_ENEMY: "MORTAL_ENEMY",
  ENEMY: "ENEMY",
  PEER: "PEER",
  SENIOR_JUNIOR: "SENIOR_JUNIOR",
  MASTER_DISCIPLE: "MASTER_DISCIPLE",
  RULER_SUBJECT: "RULER_SUBJECT",
  FRIEND: "FRIEND",
  RIVAL: "RIVAL",
  LOVER: "LOVER",
  UNKNOWN: "UNKNOWN"
});

// Relationships where hostile insults/taunts are valid
const HOSTILE_RELATIONSHIPS = Object.freeze(new Set([
  RELATIONSHIP_TYPES.MORTAL_ENEMY,
  RELATIONSHIP_TYPES.ENEMY,
  RELATIONSHIP_TYPES.RIVAL
]));

// Relationships where playful banter/teasing is valid
const PLAYFUL_RELATIONSHIPS = Object.freeze(new Set([
  RELATIONSHIP_TYPES.PEER,
  RELATIONSHIP_TYPES.SENIOR_JUNIOR,
  RELATIONSHIP_TYPES.FRIEND,
  RELATIONSHIP_TYPES.RIVAL,
  RELATIONSHIP_TYPES.LOVER
]));

// =========================================================================
// Dialogue Act Classification
// =========================================================================
const DIALOGUE_ACTS = Object.freeze({
  TAUNT: "TAUNT",
  MOCK: "MOCK",
  INSULT: "INSULT",
  RETORT: "RETORT",
  BANTER: "BANTER",
  TEASING: "TEASING",
  SARCASM: "SARCASM",
  AFFECTIONATE_TEASING: "AFFECTIONATE_TEASING",
  PLAYFUL_INSULT: "PLAYFUL_INSULT",
  CHALLENGE: "CHALLENGE",
  SHAME_FACE: "SHAME_FACE",
  NONE: "NONE"
});

// =========================================================================
// Banter Contribution Definitions
// =========================================================================
const BANTER_CONTRIBUTION_DEFINITIONS = Object.freeze([
  // Rule 1: Trash-talk / Disbelief challenge
  {
    ruleId: "BANTER_R01",
    targetVi: "ngươi đang nói đùa sao",
    pattern: /ngươi (?:đây )?(?:là )?đang (?:cùng ta )?nói đùa sao\??/i,
    candidateVi: "ngươi đang kể chuyện cười cho ta nghe đấy à?",
    dialogueAct: DIALOGUE_ACTS.TAUNT,
    allowedRelationships: [RELATIONSHIP_TYPES.PEER, RELATIONSHIP_TYPES.ENEMY, RELATIONSHIP_TYPES.MORTAL_ENEMY, RELATIONSHIP_TYPES.SENIOR_JUNIOR, RELATIONSHIP_TYPES.RIVAL],
    forbiddenRelationships: [RELATIONSHIP_TYPES.RULER_SUBJECT, RELATIONSHIP_TYPES.MASTER_DISCIPLE],
    signature: createSemanticSignature({
      denotation: "MOCKING_DISBELIEF_CHALLENGE",
      affectDistribution: { CONTEMPT: 0.75, AMUSEMENT: 0.60 },
      valence: -0.30,
      intensity: 0.60,
      register: "WUXIA_BANTER"
    }),
    tone: "CONTEMPTUOUS",
    priority: 0.88
  },

  // Rule 2: Courtesy rejected — come-uppance idiom
  {
    ruleId: "BANTER_R02",
    targetVi: "cho mặt mà không muốn mặt",
    pattern: /cho mặt mà không (?:cần|muốn) mặt/i,
    candidateVi: "rượu mời không uống lại muốn uống rượu phạt",
    dialogueAct: DIALOGUE_ACTS.INSULT,
    allowedRelationships: [RELATIONSHIP_TYPES.ENEMY, RELATIONSHIP_TYPES.MORTAL_ENEMY, RELATIONSHIP_TYPES.SENIOR_JUNIOR, RELATIONSHIP_TYPES.RIVAL],
    forbiddenRelationships: [RELATIONSHIP_TYPES.RULER_SUBJECT, RELATIONSHIP_TYPES.MASTER_DISCIPLE, RELATIONSHIP_TYPES.FRIEND],
    signature: createSemanticSignature({
      denotation: "COURTESY_REFUSED_COMEUPPANCE",
      affectDistribution: { CONTEMPT: 0.85, ARROGANCE: 0.70 },
      valence: -0.50,
      intensity: 0.70,
      register: "CLASSICAL_TRASH_TALK"
    }),
    tone: "MENACING",
    priority: 0.90
  },

  // Rule 3: Who do you think you are? (Insult)
  {
    ruleId: "BANTER_R03",
    targetVi: "ngươi tính là cái thứ gì",
    pattern: /ngươi tính là cái th(?:ứ|á) gì/i,
    candidateVi: "ngươi là cái thá gì chứ",
    dialogueAct: DIALOGUE_ACTS.INSULT,
    allowedRelationships: [RELATIONSHIP_TYPES.PEER, RELATIONSHIP_TYPES.ENEMY, RELATIONSHIP_TYPES.MORTAL_ENEMY, RELATIONSHIP_TYPES.SENIOR_JUNIOR, RELATIONSHIP_TYPES.RIVAL],
    forbiddenRelationships: [RELATIONSHIP_TYPES.RULER_SUBJECT, RELATIONSHIP_TYPES.MASTER_DISCIPLE],
    signature: createSemanticSignature({
      denotation: "DISDAINFUL_DISMISSAL",
      affectDistribution: { CONTEMPT: 0.90, ARROGANCE: 0.80 },
      valence: -0.60,
      intensity: 0.75,
      register: "VERNACULAR_PUNCHY"
    }),
    tone: "CONTEMPTUOUS",
    priority: 0.92
  },

  // Rule 5: Tired of living (Combat Taunt)
  {
    ruleId: "BANTER_R05",
    targetVi: "ngươi đây là tự tìm cái chết",
    pattern: /ngươi (?:đây )?là tự tìm (?:cái )?(?:chết|đường chết)/i,
    candidateVi: "ngươi đúng là chán sống rồi",
    dialogueAct: DIALOGUE_ACTS.TAUNT,
    allowedRelationships: [RELATIONSHIP_TYPES.ENEMY, RELATIONSHIP_TYPES.MORTAL_ENEMY, RELATIONSHIP_TYPES.RIVAL],
    forbiddenRelationships: [RELATIONSHIP_TYPES.PEER, RELATIONSHIP_TYPES.SENIOR_JUNIOR, RELATIONSHIP_TYPES.RULER_SUBJECT, RELATIONSHIP_TYPES.MASTER_DISCIPLE, RELATIONSHIP_TYPES.FRIEND],
    signature: createSemanticSignature({
      denotation: "DEATH_WISH_TAUNTING",
      affectDistribution: { CONTEMPT: 0.85, ARROGANCE: 0.90 },
      valence: -0.70,
      intensity: 0.80,
      register: "WUXIA_BANTER"
    }),
    tone: "MENACING",
    priority: 0.93
  },

  // Rule 7: Thick-faced shamelessness (Mockery / Teasing)
  {
    ruleId: "BANTER_R07",
    targetVi: "da mặt của ngươi thật dày",
    pattern: /da mặt (?:của )?ngươi (?:thật|cũng thật) dày/i,
    candidateVi: "da mặt ngươi cũng dày bằng tường thành đấy nhỉ",
    dialogueAct: DIALOGUE_ACTS.MOCK,
    allowedRelationships: [RELATIONSHIP_TYPES.PEER, RELATIONSHIP_TYPES.ENEMY, RELATIONSHIP_TYPES.MORTAL_ENEMY, RELATIONSHIP_TYPES.SENIOR_JUNIOR, RELATIONSHIP_TYPES.FRIEND, RELATIONSHIP_TYPES.RIVAL],
    forbiddenRelationships: [RELATIONSHIP_TYPES.RULER_SUBJECT, RELATIONSHIP_TYPES.MASTER_DISCIPLE],
    signature: createSemanticSignature({
      denotation: "SHAMELESSNESS_MOCKERY",
      affectDistribution: { AMUSEMENT: 0.65, CONTEMPT: 0.70 },
      valence: -0.30,
      intensity: 0.60,
      register: "VERNACULAR_PUNCHY"
    }),
    tone: "MOCKING",
    priority: 0.85
  },

  // Rule 8: Light thick-faced (Playful Teasing)
  {
    ruleId: "BANTER_R08",
    targetVi: "da mặt cũng thật là dày",
    pattern: /da mặt cũng thật là dày/i,
    candidateVi: "da mặt cũng dày thật đấy",
    dialogueAct: DIALOGUE_ACTS.TEASING,
    allowedRelationships: [RELATIONSHIP_TYPES.PEER, RELATIONSHIP_TYPES.SENIOR_JUNIOR, RELATIONSHIP_TYPES.FRIEND],
    forbiddenRelationships: [RELATIONSHIP_TYPES.RULER_SUBJECT, RELATIONSHIP_TYPES.MASTER_DISCIPLE],
    signature: createSemanticSignature({
      denotation: "LIGHT_SHAMELESSNESS_MOCK",
      affectDistribution: { AMUSEMENT: 0.70, CONTEMPT: 0.40 },
      valence: -0.10,
      intensity: 0.45,
      register: "VERNACULAR_PUNCHY"
    }),
    tone: "PLAYFUL_MOCK",
    priority: 0.82
  },

  // Rule 9: Toad aspiring to swan's flesh (Insult / Ridicule)
  {
    ruleId: "BANTER_R09",
    targetVi: "con cóc đòi ăn thịt thiên nga",
    pattern: /con? cóc (?:ghẻ )?(?:mà )?đòi ăn thịt thiên nga/i,
    candidateVi: "cóc ghẻ mà đòi ăn thịt thiên nga",
    dialogueAct: DIALOGUE_ACTS.MOCK,
    allowedRelationships: [RELATIONSHIP_TYPES.PEER, RELATIONSHIP_TYPES.ENEMY, RELATIONSHIP_TYPES.MORTAL_ENEMY, RELATIONSHIP_TYPES.SENIOR_JUNIOR, RELATIONSHIP_TYPES.RIVAL],
    forbiddenRelationships: [RELATIONSHIP_TYPES.RULER_SUBJECT, RELATIONSHIP_TYPES.MASTER_DISCIPLE],
    signature: createSemanticSignature({
      denotation: "ASPIRATION_MOCKERY_IDIOM",
      affectDistribution: { CONTEMPT: 0.80, ARROGANCE: 0.75, AMUSEMENT: 0.50 },
      valence: -0.40,
      intensity: 0.70,
      register: "CLASSICAL_TRASH_TALK"
    }),
    tone: "CONTEMPTUOUS",
    priority: 0.90
  },

  // Rule 10: You're still green (Retort / Inexperience Taunt)
  {
    ruleId: "BANTER_R10",
    targetVi: "ngươi còn non và xanh lắm",
    pattern: /ngươi còn (?:non (?:và|nớt)|quá non (?:và|nớt)) ?(?:xanh)? lắm/i,
    candidateVi: "ngươi còn non nớt lắm",
    dialogueAct: DIALOGUE_ACTS.RETORT,
    allowedRelationships: [RELATIONSHIP_TYPES.PEER, RELATIONSHIP_TYPES.SENIOR_JUNIOR, RELATIONSHIP_TYPES.RIVAL],
    forbiddenRelationships: [RELATIONSHIP_TYPES.RULER_SUBJECT, RELATIONSHIP_TYPES.MASTER_DISCIPLE],
    signature: createSemanticSignature({
      denotation: "INEXPERIENCE_RETORT",
      affectDistribution: { RIVALRY: 0.70, ARROGANCE: 0.60, AMUSEMENT: 0.40 },
      valence: -0.20,
      intensity: 0.55,
      register: "WUXIA_BANTER"
    }),
    tone: "DISMISSIVE",
    priority: 0.85
  },

  // Rule 11: Context-Dependent Ambiguous Praise ("你可真厉害")
  // Resolved conditionally based on relationship & affect
  {
    ruleId: "BANTER_R11_CONTEXTUAL_PRAISE",
    targetVi: "ngươi (?:thật|quả)? là lợi hại",
    pattern: /(?:ngươi|huynh|đệ|muội) (?:thật|quả|cũng)? (?:là )?(?:lợi hại|giỏi|ghê gớm)(?: thật)?(?: đấy)?\??/i,
    candidateVi: "ngươi cũng cừ thật đấy nhỉ",
    dialogueAct: DIALOGUE_ACTS.TEASING,
    allowedRelationships: [RELATIONSHIP_TYPES.FRIEND, RELATIONSHIP_TYPES.PEER, RELATIONSHIP_TYPES.LOVER],
    forbiddenRelationships: [RELATIONSHIP_TYPES.RULER_SUBJECT, RELATIONSHIP_TYPES.MASTER_DISCIPLE],
    signature: createSemanticSignature({
      denotation: "PLAYFUL_PRAISE_TEASING",
      affectDistribution: { AMUSEMENT: 0.75, AFFECTION: 0.50 },
      valence: 0.40,
      intensity: 0.50,
      register: "VERNACULAR_PUNCHY"
    }),
    tone: "PLAYFUL",
    priority: 0.86
  },

  // Rule 12: Ambiguous Praise in Hostile Context -> Sarcastic Mockery
  {
    ruleId: "BANTER_R12_SARCASM_PRAISE",
    targetVi: "ngươi quả là ghê gớm",
    pattern: /(?:ngươi|hắn) (?:quả là|đúng là) (?:lợi hại|ghê gớm)(?: đấy)?/i,
    candidateVi: "ngươi quả là ghê gớm đấy",
    dialogueAct: DIALOGUE_ACTS.SARCASM,
    allowedRelationships: [RELATIONSHIP_TYPES.ENEMY, RELATIONSHIP_TYPES.MORTAL_ENEMY, RELATIONSHIP_TYPES.RIVAL],
    forbiddenRelationships: [RELATIONSHIP_TYPES.RULER_SUBJECT, RELATIONSHIP_TYPES.MASTER_DISCIPLE],
    signature: createSemanticSignature({
      denotation: "SARCASM_MOCKERY",
      affectDistribution: { CONTEMPT: 0.85, HOSTILITY: 0.60 },
      valence: -0.60,
      intensity: 0.70,
      register: "CLASSICAL_TRASH_TALK"
    }),
    tone: "SARCASTIC",
    priority: 0.88
  }
]);

// =========================================================================
// Provider Factory
// =========================================================================
function createBanterProvider() {
  return Object.freeze({
    providerId: "banter-provider",
    domain: "BANTER",
    supportedSlots: [STYLE_SLOTS.BANTER_RETORT],

    /**
     * Contribute banter/retort candidates for a resolved dialogue clause.
     *
     * Strict activation conditions:
     * 1. ClauseIR.role must be "DIALOGUE".
     * 2. Speaker, Listener, and Relationship must be RESOLVED (via context or clauseIR.dialogueAct).
     * 3. Relationship type must match allowed relationships and NOT be forbidden.
     * 4. Formal court / solemn decrees strictly suppress banter.
     * 5. Pattern matches search text.
     *
     * @param {Object} clauseIR
     * @param {Object} [context]
     * @returns {Array<Object>} StylistContribution[]
     */
    contribute(clauseIR, context = {}) {
      if (!clauseIR || !clauseIR.sourceZh) return [];

      // Strict role gate: only DIALOGUE
      if (clauseIR.role !== "DIALOGUE") return [];

      // Check for formal court setting override -> ABSTAIN
      if (context.formalSetting === true || context.register === "SOLEMN_DECREE") {
        return [];
      }

      // Discourse gate: Extract dialogue context from context or clauseIR
      const dialogueCtx = context.dialogueContext || null;
      const irDialogueAct = clauseIR.dialogueAct || null;

      let speakerResolved = false;
      let listenerResolved = false;
      let relationshipResolved = false;
      let relationshipType = RELATIONSHIP_TYPES.UNKNOWN;

      if (dialogueCtx) {
        speakerResolved = dialogueCtx.speaker && dialogueCtx.speaker.status === "RESOLVED";
        listenerResolved = dialogueCtx.listener && dialogueCtx.listener.status === "RESOLVED";
        relationshipResolved = dialogueCtx.relationship && dialogueCtx.relationship.status === "RESOLVED";
        if (dialogueCtx.relationship) {
          relationshipType = dialogueCtx.relationship.type || RELATIONSHIP_TYPES.UNKNOWN;
        }
      } else if (irDialogueAct && irDialogueAct.status === "RESOLVED") {
        speakerResolved = irDialogueAct.speaker && irDialogueAct.speaker.status === "RESOLVED";
        listenerResolved = irDialogueAct.listener && irDialogueAct.listener.status === "RESOLVED";
        relationshipResolved = irDialogueAct.relationship && irDialogueAct.relationship.status === "RESOLVED";
        if (irDialogueAct.relationship) {
          relationshipType = irDialogueAct.relationship.type || RELATIONSHIP_TYPES.UNKNOWN;
        }
      }

      if (!speakerResolved || !listenerResolved || !relationshipResolved) {
        return [];
      }

      // Search Vietnamese translated text (primary) or source Chinese (fallback)
      const searchText = (context && context.translatedText) || clauseIR.sourceZh;
      const contributions = [];

      for (const def of BANTER_CONTRIBUTION_DEFINITIONS) {
        if (!def.pattern.test(searchText)) continue;

        // Forbidden relationship gate (e.g. disciple insulting master, or subject insulting ruler)
        if (def.forbiddenRelationships.includes(relationshipType)) continue;

        // Allowed relationship gate
        if (def.allowedRelationships.length > 0 && !def.allowedRelationships.includes(relationshipType)) {
          continue;
        }

        // Align with dialogueAct if IR has already resolved a specific act
        let effectiveAct = def.dialogueAct;
        if (irDialogueAct && irDialogueAct.dialogueAct && irDialogueAct.dialogueAct !== "NONE") {
          effectiveAct = irDialogueAct.dialogueAct;
        }

        contributions.push(
          createStylistContribution({
            providerId: "banter-provider",
            domain: "BANTER",
            targetSlot: STYLE_SLOTS.BANTER_RETORT,
            dimension: "DIALOGUE_STYLE",
            sourceSpanZh: def.targetVi,
            candidateVi: def.candidateVi,
            semanticRequirements: {
              dialogueAct: effectiveAct,
              allowedRelationships: def.allowedRelationships,
              forbiddenRelationships: def.forbiddenRelationships,
              requiredRole: "DIALOGUE",
              requiredDiscourseResolution: ["SPEAKER", "LISTENER", "RELATIONSHIP"],
              relationshipType
            },
            semanticSignature: def.signature,
            tone: def.tone,
            register: def.signature.register,
            rhythmPreference: "PUNCHY_STACCATO",
            lexicalPriority: def.priority,
            confidence: 0.90,
            semanticExpansionCost: 0.0,
            introducedInformation: [],
            introducedMetaphor: false,
            surfaceRealization: true,
            provenance: `banter-provider:${def.ruleId}->${STYLE_SLOTS.BANTER_RETORT}:${effectiveAct}:${relationshipType}`
          })
        );
      }

      return contributions;
    },

    getSuggestions(clauseIR, context = {}) {
      const contribs = this.contribute(clauseIR, context);
      const domainWeight = (context.domainWeights && context.domainWeights.BANTER) || 0.80;
      return Object.freeze({
        providerId: "banter-provider",
        domain: "BANTER",
        confidence: domainWeight,
        contributions: Object.freeze(contribs),
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createBanterProvider,
  BANTER_CONTRIBUTION_DEFINITIONS,
  DIALOGUE_ACTS,
  RELATIONSHIP_TYPES,
  HOSTILE_RELATIONSHIPS,
  PLAYFUL_RELATIONSHIPS
};
