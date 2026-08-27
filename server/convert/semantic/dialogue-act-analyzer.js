"use strict";

/**
 * Dialogue Act Semantic Analyzer (C2B2-1)
 *
 * Regexes provide lexical evidence only. A banter decision additionally requires
 * DIALOGUE role plus discourse-resolved speaker, listener, and relationship.
 * This module never chooses final Vietnamese wording.
 */

const DIALOGUE_ACTS = Object.freeze({
  TEASING: "TEASING",
  SARCASM: "SARCASM",
  MOCKERY: "MOCKERY",
  INSULT: "INSULT",
  PLAYFUL_INSULT: "PLAYFUL_INSULT",
  AFFECTIONATE_TEASING: "AFFECTIONATE_TEASING",
  HOSTILE_PROVOCATION: "HOSTILE_PROVOCATION",
  DRY_HUMOR: "DRY_HUMOR",
  RETORT: "RETORT",
  TAUNT: "TAUNT",
  CHALLENGE: "CHALLENGE",
  NONE: "NONE"
});

const DIALOGUE_ACT_STATUS = Object.freeze({
  RESOLVED: "RESOLVED",
  AMBIGUOUS: "AMBIGUOUS",
  UNKNOWN: "UNKNOWN",
  ABSTAIN: "ABSTAIN"
});

const DIALOGUE_EVIDENCE_RULES = Object.freeze([
  { id: "RHETORICAL_JOKE_RETORT", legacyRuleIds: [1], pattern: /你(?:这|是)?在(?:跟|同)我开玩笑吗|你是在说笑吗/, baseAct: DIALOGUE_ACTS.RETORT, affectDistribution: { CONTEMPT: 0.45, AMUSEMENT: 0.35 }, valence: -0.25, intensity: 0.55, register: "VERNACULAR", confidence: 0.94 },
  { id: "REJECTED_COURTESY_PROVOCATION", legacyRuleIds: [2], pattern: /给脸不要脸/, baseAct: DIALOGUE_ACTS.HOSTILE_PROVOCATION, affectDistribution: { HOSTILITY: 0.75, CONTEMPT: 0.60 }, valence: -0.75, intensity: 0.78, register: "CLASSICAL_LITERARY", confidence: 0.98 },
  { id: "WHAT_THING_INSULT", legacyRuleIds: [3], pattern: /你算什么东西/, baseAct: DIALOGUE_ACTS.INSULT, affectDistribution: { CONTEMPT: 0.85, HOSTILITY: 0.55 }, valence: -0.80, intensity: 0.78, register: "VERNACULAR", confidence: 0.99 },
  { id: "WHAT_KIND_INSULT", legacyRuleIds: [4], pattern: /你算个什么东西|你算什么玩意/, baseAct: DIALOGUE_ACTS.INSULT, affectDistribution: { CONTEMPT: 0.85, HOSTILITY: 0.55 }, valence: -0.80, intensity: 0.78, register: "VERNACULAR", confidence: 0.99 },
  { id: "SEEKING_DEATH_PROVOCATION", legacyRuleIds: [5], pattern: /你这是找死/, baseAct: DIALOGUE_ACTS.HOSTILE_PROVOCATION, affectDistribution: { HOSTILITY: 0.90, WRATH: 0.65 }, valence: -0.90, intensity: 0.90, register: "CLASSICAL_LITERARY", confidence: 0.99 },
  { id: "SELF_DESTRUCTION_PROVOCATION", legacyRuleIds: [6], pattern: /你这是自寻死路|你在自寻死路/, baseAct: DIALOGUE_ACTS.HOSTILE_PROVOCATION, affectDistribution: { HOSTILITY: 0.90, WRATH: 0.65 }, valence: -0.90, intensity: 0.90, register: "CLASSICAL_LITERARY", confidence: 0.99 },
  { id: "FACE_THICK_DIRECT", legacyRuleIds: [7], pattern: /你的脸皮(?:可|也)?真厚/, baseAct: DIALOGUE_ACTS.MOCKERY, affectDistribution: { CONTEMPT: 0.65, AMUSEMENT: 0.35 }, valence: -0.50, intensity: 0.55, register: "VERNACULAR", confidence: 0.96, contextual: "FACE_THICK" },
  { id: "FACE_THICK_GENERIC", legacyRuleIds: [8], pattern: /脸皮也真厚|脸皮真厚/, baseAct: DIALOGUE_ACTS.MOCKERY, affectDistribution: { CONTEMPT: 0.60, AMUSEMENT: 0.35 }, valence: -0.45, intensity: 0.50, register: "VERNACULAR", confidence: 0.94, contextual: "FACE_THICK" },
  { id: "TOAD_SWAN_MOCKERY", legacyRuleIds: [9], pattern: /癞蛤蟆想吃天鹅肉/, baseAct: DIALOGUE_ACTS.MOCKERY, affectDistribution: { CONTEMPT: 0.80, AMUSEMENT: 0.30 }, valence: -0.70, intensity: 0.68, register: "CLASSICAL_LITERARY", confidence: 0.99 },
  { id: "TOO_INEXPERIENCED_TAUNT", legacyRuleIds: [10], pattern: /你还(?:太)?嫩得很|你还太嫩了|你还嫩着呢/, baseAct: DIALOGUE_ACTS.TAUNT, affectDistribution: { CONTEMPT: 0.65, AMUSEMENT: 0.30 }, valence: -0.50, intensity: 0.55, register: "VERNACULAR", confidence: 0.97 },

  // Context-dependent adversarial corpus. These never resolve from surface alone.
  { id: "AMBIGUOUS_PRAISE", legacyRuleIds: [], pattern: /(?:你|师兄|师尊|前辈|王爷)(?:可|还)?真(?:是)?厉害/, baseAct: DIALOGUE_ACTS.NONE, affectDistribution: { NEUTRAL: 1.0 }, valence: 0.0, intensity: 0.35, register: "VERNACULAR", confidence: 0.50, contextual: "AMBIGUOUS_PRAISE" },
  { id: "OLD_THING_ADDRESS", legacyRuleIds: [], pattern: /老东西/, baseAct: DIALOGUE_ACTS.NONE, affectDistribution: { CONTEMPT: 0.55 }, valence: -0.45, intensity: 0.55, register: "VERNACULAR", confidence: 0.55, contextual: "OLD_THING" },
  { id: "WEAK_SKILL_TAUNT", legacyRuleIds: [], pattern: /你也太菜了吧|你也太弱了吧/, baseAct: DIALOGUE_ACTS.NONE, affectDistribution: { CONTEMPT: 0.45, AMUSEMENT: 0.35 }, valence: -0.35, intensity: 0.45, register: "CASUAL_SPOKEN", confidence: 0.60, contextual: "WEAK_SKILL" }
].map((rule) => Object.freeze({ ...rule, legacyRuleIds: Object.freeze([...rule.legacyRuleIds]), affectDistribution: Object.freeze({ ...rule.affectDistribution }) })));

const AFFECT_ALIASES = Object.freeze({
  ANGER: "WRATH",
  ANGRY: "WRATH",
  PLAYFUL: "AMUSEMENT",
  LOVING: "AFFECTION"
});

function normalizeAffect(rule, hints = {}) {
  const supplied = { ...(hints.affectDistribution || {}) };
  if (typeof hints.affect === "string" && hints.affect) {
    const raw = hints.affect.toUpperCase();
    supplied[AFFECT_ALIASES[raw] || raw] = Math.max(supplied[AFFECT_ALIASES[raw] || raw] || 0, 0.75);
  }
  const distribution = Object.keys(supplied).length > 0 ? supplied : { ...rule.affectDistribution };
  return Object.freeze({
    affectDistribution: Object.freeze(distribution),
    valence: typeof hints.valence === "number" ? hints.valence : rule.valence,
    intensity: typeof hints.intensity === "number" ? hints.intensity : rule.intensity,
    evidenceSource: Object.keys(supplied).length > 0 ? "CONTEXT_AFFECT_EVIDENCE" : `LEXICAL_EVIDENCE_${rule.id}`
  });
}

function hasAffect(affect, names) {
  return names.some((name) => (affect.affectDistribution[name] || 0) >= 0.35);
}

function resolveContextualAct(rule, relationshipType, affect, register, hints) {
  const friendly = relationshipType === "FRIEND" || relationshipType === "LOVER";
  const hostile = relationshipType === "ENEMY";
  const rival = relationshipType === "RIVAL";
  const amused = hasAffect(affect, ["AMUSEMENT", "AFFECTION"]);
  const antagonistic = hasAffect(affect, ["HOSTILITY", "CONTEMPT", "WRATH"]);
  const formal = register === "SOLEMN_DECREE" || hints.formalSetting === true;

  if (rule.contextual === "AMBIGUOUS_PRAISE") {
    if (formal) return { act: DIALOGUE_ACTS.NONE, reason: "FORMAL_PRAISE_HAS_NO_BANTER_EVIDENCE" };
    if (friendly && amused) return { act: relationshipType === "LOVER" ? DIALOGUE_ACTS.AFFECTIONATE_TEASING : DIALOGUE_ACTS.TEASING, reason: "FRIENDLY_RELATIONSHIP_WITH_PLAYFUL_AFFECT" };
    if (hostile && antagonistic) return { act: DIALOGUE_ACTS.SARCASM, reason: "ENEMY_RELATIONSHIP_WITH_ANTAGONISTIC_AFFECT" };
    if (rival && amused) return { act: DIALOGUE_ACTS.TEASING, reason: "RIVAL_RELATIONSHIP_WITH_PLAYFUL_AFFECT" };
    if (rival && antagonistic) return { act: DIALOGUE_ACTS.MOCKERY, reason: "RIVAL_RELATIONSHIP_WITH_CONTEMPT_EVIDENCE" };
    return { act: DIALOGUE_ACTS.NONE, reason: "AMBIGUOUS_PRAISE_WITHOUT_DISAMBIGUATING_CONTEXT" };
  }

  if (rule.contextual === "OLD_THING") {
    if (friendly && amused) return { act: DIALOGUE_ACTS.PLAYFUL_INSULT, reason: "FRIENDLY_RELATIONSHIP_WITH_PLAYFUL_INSULT_AFFECT" };
    if (rival && amused) return { act: DIALOGUE_ACTS.TAUNT, reason: "RIVAL_RELATIONSHIP_WITH_AMUSED_TAUNT" };
    if (hostile && antagonistic) return { act: DIALOGUE_ACTS.INSULT, reason: "ENEMY_RELATIONSHIP_WITH_HOSTILE_INSULT_AFFECT" };
    return { act: DIALOGUE_ACTS.NONE, reason: "OLD_THING_ADDRESS_RELATIONSHIP_OR_AFFECT_AMBIGUOUS" };
  }

  if (rule.contextual === "WEAK_SKILL") {
    if (friendly && amused) return { act: DIALOGUE_ACTS.TEASING, reason: "FRIENDLY_SKILL_TEASING" };
    if ((rival || hostile) && (amused || antagonistic)) return { act: DIALOGUE_ACTS.TAUNT, reason: "RIVAL_OR_ENEMY_SKILL_TAUNT" };
    return { act: DIALOGUE_ACTS.NONE, reason: "WEAK_SKILL_PHRASE_WITHOUT_BANTER_CONTEXT" };
  }

  if (rule.contextual === "FACE_THICK" && friendly && amused) {
    return { act: DIALOGUE_ACTS.TEASING, reason: "FRIENDLY_FACE_THICK_TEASING" };
  }

  return { act: rule.baseAct, reason: `EXPLICIT_DIALOGUE_ACT_EVIDENCE_${rule.id}` };
}

function emptyParticipant(status, reason) {
  return Object.freeze({ status, entityId: null, confidence: 0.0, reason });
}

function getRealizationSpan(rule, sourceSpan) {
  if (rule.id === "AMBIGUOUS_PRAISE") {
    const withoutTitle = sourceSpan.replace(/^(?:师兄|师尊|前辈|王爷)/, "");
    if (withoutTitle !== sourceSpan && withoutTitle) return withoutTitle;
  }
  return sourceSpan;
}

function analyzeDialogueAct(sourceZh, {
  textRole = "EXPOSITION",
  discourseContext = null,
  contextHints = {}
} = {}) {
  const text = String(sourceZh || "");
  const fallbackSpeaker = emptyParticipant("UNKNOWN", "NO_SPEAKER_DISCOURSE_EVIDENCE");
  const fallbackListener = emptyParticipant("UNKNOWN", "NO_LISTENER_DISCOURSE_EVIDENCE");
  const fallbackRelationship = Object.freeze({ status: "UNKNOWN", type: "UNKNOWN", confidence: 0.0, reason: "NO_RELATIONSHIP_DISCOURSE_EVIDENCE" });

  if (textRole !== "DIALOGUE") {
    return Object.freeze({
      sourceSpan: "", textRole, speaker: fallbackSpeaker, listener: fallbackListener,
      relationship: fallbackRelationship, dialogueAct: DIALOGUE_ACTS.NONE,
      evidenceId: null, affect: Object.freeze({ affectDistribution: Object.freeze({ NEUTRAL: 1.0 }), valence: 0.0, intensity: 0.0 }),
      register: contextHints.register || "VERNACULAR", candidate: DIALOGUE_ACTS.NONE,
      confidence: 1.0, status: DIALOGUE_ACT_STATUS.ABSTAIN,
      reason: "TEXT_ROLE_NOT_DIALOGUE", constraints: Object.freeze(["BANTER_REQUIRES_DIALOGUE_ROLE"])
    });
  }

  const speaker = discourseContext ? discourseContext.speaker : fallbackSpeaker;
  const listener = discourseContext ? discourseContext.listener : fallbackListener;
  const relationship = discourseContext ? discourseContext.relationship : fallbackRelationship;
  if (!discourseContext || discourseContext.status !== "RESOLVED") {
    return Object.freeze({
      sourceSpan: "", textRole, speaker, listener, relationship,
      dialogueAct: DIALOGUE_ACTS.NONE, evidenceId: null,
      affect: Object.freeze({ affectDistribution: Object.freeze({ NEUTRAL: 1.0 }), valence: 0.0, intensity: 0.0 }),
      register: contextHints.register || "VERNACULAR", candidate: DIALOGUE_ACTS.NONE,
      confidence: 0.0, status: DIALOGUE_ACT_STATUS.UNKNOWN,
      reason: "SPEAKER_LISTENER_OR_RELATIONSHIP_UNRESOLVED",
      constraints: Object.freeze(["DO_NOT_GUESS_DIALOGUE_PARTICIPANTS_OR_RELATIONSHIP"])
    });
  }

  let selectedRule = null;
  let match = null;
  for (const rule of DIALOGUE_EVIDENCE_RULES) {
    const current = rule.pattern.exec(text);
    if (current) {
      selectedRule = rule;
      match = current;
      break;
    }
  }

  if (!selectedRule) {
    return Object.freeze({
      sourceSpan: "", textRole, speaker, listener, relationship,
      dialogueAct: DIALOGUE_ACTS.NONE, evidenceId: null,
      affect: Object.freeze({ affectDistribution: Object.freeze({ NEUTRAL: 1.0 }), valence: 0.0, intensity: 0.0 }),
      register: contextHints.register || "VERNACULAR", candidate: DIALOGUE_ACTS.NONE,
      confidence: 1.0, status: DIALOGUE_ACT_STATUS.ABSTAIN,
      reason: "NO_DIALOGUE_ACT_EVIDENCE", constraints: Object.freeze(["DO_NOT_INFER_BANTER_FROM_DIALOGUE_ROLE_ALONE"])
    });
  }

  const affect = normalizeAffect(selectedRule, contextHints);
  const register = contextHints.register || selectedRule.register;
  const resolved = resolveContextualAct(selectedRule, relationship.type, affect, register, contextHints);
  if (resolved.act === DIALOGUE_ACTS.NONE) {
    return Object.freeze({
      sourceSpan: match[0], realizationSpan: getRealizationSpan(selectedRule, match[0]), textRole, speaker, listener, relationship,
      dialogueAct: DIALOGUE_ACTS.NONE, evidenceId: selectedRule.id, affect, register,
      candidate: DIALOGUE_ACTS.NONE, confidence: selectedRule.confidence,
      status: DIALOGUE_ACT_STATUS.ABSTAIN, reason: resolved.reason,
      constraints: Object.freeze(["SURFACE_EVIDENCE_INSUFFICIENT_WITHOUT_CONTEXT_ALIGNMENT"])
    });
  }

  return Object.freeze({
    sourceSpan: match[0], realizationSpan: getRealizationSpan(selectedRule, match[0]), textRole, speaker, listener, relationship,
    dialogueAct: resolved.act, evidenceId: selectedRule.id, affect, register,
    candidate: resolved.act, confidence: selectedRule.confidence,
    status: DIALOGUE_ACT_STATUS.RESOLVED, reason: resolved.reason,
    constraints: Object.freeze([])
  });
}

module.exports = {
  DIALOGUE_ACTS,
  DIALOGUE_ACT_STATUS,
  DIALOGUE_EVIDENCE_RULES,
  analyzeDialogueAct
};
