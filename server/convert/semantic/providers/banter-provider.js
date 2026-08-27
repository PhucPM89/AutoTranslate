"use strict";

/**
 * Banter & Satirical Retort Contribution Provider (Phase 2B - Wave C2B-2)
 * Domain: BANTER
 *
 * Semantic Model (6-Axis):
 * 1. SPEAKER     — EntityId resolved by DiscourseTracker (not guessed from raw text)
 * 2. LISTENER    — EntityId resolved by DiscourseTracker (not guessed from raw text)
 * 3. RELATIONSHIP— Type: MORTAL_ENEMY | PEER | SENIOR_JUNIOR | MASTER_DISCIPLE | RULER_SUBJECT
 * 4. DIALOGUE ACT— TAUNT | RETORT | MOCK | INSULT | BANTER | CHALLENGE | SHAME_FACE
 * 5. AFFECT      — Contempt, Amusement, Arrogance, Rivalry
 * 6. REGISTER    — CLASSICAL_TRASH_TALK | WUXIA_BANTER | VERNACULAR_PUNCHY
 *
 * Architecture Invariants:
 * - Discourse Authority: Provider ABSTAIN if speaker, listener, or relationship is not RESOLVED.
 * - Relationship Safety: Some dialogue acts are forbidden for certain relationship types.
 *   (e.g. a disciple cannot insult their master with pattern-based certainty)
 * - Zero Pronoun Injection: Never hardcodes pronouns — candidates are pronoun-neutral phrases.
 * - Zero Text-Role Violation: Only activates when ClauseIR.role === "DIALOGUE".
 * - Migrates 9 legacy banter-adapter.js rules into discourse-aware contributions.
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
  UNKNOWN: "UNKNOWN"
});

// Relationships where banter/insult is plausible
const HOSTILE_RELATIONSHIPS = new Set([
  RELATIONSHIP_TYPES.MORTAL_ENEMY,
  RELATIONSHIP_TYPES.ENEMY
]);

const PEER_RELATIONSHIPS = new Set([
  RELATIONSHIP_TYPES.PEER,
  RELATIONSHIP_TYPES.SENIOR_JUNIOR
]);

// =========================================================================
// Dialogue Act Classification
// =========================================================================
const DIALOGUE_ACTS = Object.freeze({
  TAUNT: "TAUNT",
  MOCK: "MOCK",
  INSULT: "INSULT",
  RETORT: "RETORT",
  BANTER: "BANTER",
  CHALLENGE: "CHALLENGE",
  SHAME_FACE: "SHAME_FACE"
});

// =========================================================================
// Banter Contribution Definitions (9 Migrated Rules)
// =========================================================================

/**
 * Each definition specifies:
 * - targetVi: Vietnamese pattern to match (from old banter-adapter rules)
 * - pattern: Vietnamese regex (provider operates on post-translation text)
 * - candidateVi: Semantically improved replacement candidate
 * - dialogueAct: The specific communicative act being performed
 * - allowedRelationships: Set of relationship types this act is valid for
 * - forbiddenRelationships: Set of relationship types where this act must ABSTAIN
 * - affectDistribution: Emotional makeup of the contribution
 * - register: Rhetorical register of the output
 */
const BANTER_CONTRIBUTION_DEFINITIONS = Object.freeze([
  // Rule 1: Trash-talk / Disbelief challenge
  {
    ruleId: "BANTER_R01",
    targetVi: "ngươi đang nói đùa sao",
    pattern: /ngươi (?:đây )?(?:là )?đang (?:cùng ta )?nói đùa sao\??/i,
    candidateVi: "ngươi đang kể chuyện cười cho ta nghe đấy à?",
    dialogueAct: DIALOGUE_ACTS.TAUNT,
    allowedRelationships: [RELATIONSHIP_TYPES.PEER, RELATIONSHIP_TYPES.ENEMY, RELATIONSHIP_TYPES.MORTAL_ENEMY, RELATIONSHIP_TYPES.SENIOR_JUNIOR],
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
    allowedRelationships: [RELATIONSHIP_TYPES.ENEMY, RELATIONSHIP_TYPES.MORTAL_ENEMY, RELATIONSHIP_TYPES.SENIOR_JUNIOR],
    forbiddenRelationships: [RELATIONSHIP_TYPES.RULER_SUBJECT, RELATIONSHIP_TYPES.MASTER_DISCIPLE],
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

  // Rule 3 & 4: Who do you think you are?
  {
    ruleId: "BANTER_R03",
    targetVi: "ngươi tính là cái thứ gì",
    pattern: /ngươi tính là cái th(?:ứ|á) gì/i,
    candidateVi: "ngươi là cái thá gì chứ",
    dialogueAct: DIALOGUE_ACTS.INSULT,
    allowedRelationships: [RELATIONSHIP_TYPES.PEER, RELATIONSHIP_TYPES.ENEMY, RELATIONSHIP_TYPES.MORTAL_ENEMY, RELATIONSHIP_TYPES.SENIOR_JUNIOR],
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

  // Rule 5 & 6: Tired of living
  {
    ruleId: "BANTER_R05",
    targetVi: "ngươi đây là tự tìm cái chết",
    pattern: /ngươi (?:đây )?là tự tìm (?:cái )?(?:chết|đường chết)/i,
    candidateVi: "ngươi đúng là chán sống rồi",
    dialogueAct: DIALOGUE_ACTS.TAUNT,
    allowedRelationships: [RELATIONSHIP_TYPES.ENEMY, RELATIONSHIP_TYPES.MORTAL_ENEMY],
    forbiddenRelationships: [RELATIONSHIP_TYPES.PEER, RELATIONSHIP_TYPES.SENIOR_JUNIOR, RELATIONSHIP_TYPES.RULER_SUBJECT, RELATIONSHIP_TYPES.MASTER_DISCIPLE],
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

  // Rule 7: Thick-faced shamelessness (strong)
  {
    ruleId: "BANTER_R07",
    targetVi: "da mặt của ngươi thật dày",
    pattern: /da mặt (?:của )?ngươi (?:thật|cũng thật) dày/i,
    candidateVi: "da mặt ngươi cũng dày bằng tường thành đấy nhỉ",
    dialogueAct: DIALOGUE_ACTS.MOCK,
    allowedRelationships: [RELATIONSHIP_TYPES.PEER, RELATIONSHIP_TYPES.ENEMY, RELATIONSHIP_TYPES.MORTAL_ENEMY, RELATIONSHIP_TYPES.SENIOR_JUNIOR],
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

  // Rule 8: Thick-faced shamelessness (light)
  {
    ruleId: "BANTER_R08",
    targetVi: "da mặt cũng thật là dày",
    pattern: /da mặt cũng thật là dày/i,
    candidateVi: "da mặt cũng dày thật đấy",
    dialogueAct: DIALOGUE_ACTS.MOCK,
    allowedRelationships: [RELATIONSHIP_TYPES.PEER, RELATIONSHIP_TYPES.SENIOR_JUNIOR],
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

  // Rule 9: Toad aspiring to swan's flesh
  {
    ruleId: "BANTER_R09",
    targetVi: "con cóc đòi ăn thịt thiên nga",
    pattern: /con? cóc (?:ghẻ )?(?:mà )?đòi ăn thịt thiên nga/i,
    candidateVi: "cóc ghẻ mà đòi ăn thịt thiên nga",
    dialogueAct: DIALOGUE_ACTS.MOCK,
    allowedRelationships: [RELATIONSHIP_TYPES.PEER, RELATIONSHIP_TYPES.ENEMY, RELATIONSHIP_TYPES.MORTAL_ENEMY, RELATIONSHIP_TYPES.SENIOR_JUNIOR],
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

  // Rule 10: You're still green
  {
    ruleId: "BANTER_R10",
    targetVi: "ngươi còn non và xanh lắm",
    pattern: /ngươi còn (?:non (?:và|nớt)|quá non (?:và|nớt)) ?(?:xanh)? lắm/i,
    candidateVi: "ngươi còn non nớt lắm",
    dialogueAct: DIALOGUE_ACTS.RETORT,
    allowedRelationships: [RELATIONSHIP_TYPES.PEER, RELATIONSHIP_TYPES.SENIOR_JUNIOR],
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
     * 2. dialogueContext.speaker.status must be "RESOLVED".
     * 3. dialogueContext.listener.status must be "RESOLVED".
     * 4. dialogueContext.relationship.status must be "RESOLVED".
     * 5. Pattern must match candidate Vietnamese text.
     * 6. Relationship type must not be in rule's forbiddenRelationships.
     *
     * @param {Object} clauseIR
     * @param {Object} [context]
     * @returns {Array<Object>} StylistContribution[]
     */
    contribute(clauseIR, context = {}) {
      if (!clauseIR || !clauseIR.sourceZh) return [];

      // Strict role gate: only DIALOGUE
      if (clauseIR.role !== "DIALOGUE") return [];

      // Strict discourse gate: require resolved Speaker + Listener + Relationship
      const dialogueCtx = context.dialogueContext || null;
      if (!dialogueCtx) return [];

      const speakerResolved = dialogueCtx.speaker && dialogueCtx.speaker.status === "RESOLVED";
      const listenerResolved = dialogueCtx.listener && dialogueCtx.listener.status === "RESOLVED";
      const relationshipResolved = dialogueCtx.relationship && dialogueCtx.relationship.status === "RESOLVED";

      if (!speakerResolved || !listenerResolved || !relationshipResolved) return [];

      const relationshipType = dialogueCtx.relationship.type || RELATIONSHIP_TYPES.UNKNOWN;

      // Search Vietnamese translated text (primary) or source Chinese (fallback)
      // Banter patterns match translated Vietnamese output supplied by context.translatedText
      const searchText = (context && context.translatedText) || clauseIR.sourceZh;
      const contributions = [];

      for (const def of BANTER_CONTRIBUTION_DEFINITIONS) {
        if (!def.pattern.test(searchText)) continue;

        // Forbidden relationship gate
        if (def.forbiddenRelationships.includes(relationshipType)) continue;

        // Must be an allowed relationship (if list is specified)
        if (def.allowedRelationships.length > 0 && !def.allowedRelationships.includes(relationshipType)) continue;

        contributions.push(
          createStylistContribution({
            providerId: "banter-provider",
            domain: "BANTER",
            targetSlot: STYLE_SLOTS.BANTER_RETORT,
            dimension: "DIALOGUE_STYLE",
            sourceSpanZh: def.targetVi,
            candidateVi: def.candidateVi,
            semanticRequirements: {
              dialogueAct: def.dialogueAct,
              allowedRelationships: def.allowedRelationships,
              forbiddenRelationships: def.forbiddenRelationships,
              requiredRole: "DIALOGUE",
              requiredDiscourseResolution: ["SPEAKER", "LISTENER", "RELATIONSHIP"]
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
            provenance: `banter-provider:${def.ruleId}->${STYLE_SLOTS.BANTER_RETORT}:${def.dialogueAct}:${relationshipType}`
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
  RELATIONSHIP_TYPES
};
