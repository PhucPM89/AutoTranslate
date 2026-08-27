"use strict";

/**
 * Cognitive / Inner-State Semantic Analyzer (C2B-1.1)
 *
 * This module is symbolic source analysis. It does not choose Vietnamese wording.
 * Providers may consume the resulting evidence, but may not reinterpret source text.
 */

const COGNITIVE_KINDS = Object.freeze({
  EXPLICIT_THOUGHT: "EXPLICIT_THOUGHT",
  INNER_STATE: "INNER_STATE",
  AFFECTIVE_REACTION: "AFFECTIVE_REACTION",
  RECOLLECTION: "RECOLLECTION",
  DECISION: "DECISION",
  INFERENCE: "INFERENCE",
  NARRATIVE_REACTION: "NARRATIVE_REACTION",
  NONE: "NONE"
});

const COGNITIVE_STATUS = Object.freeze({
  RESOLVED: "RESOLVED",
  AMBIGUOUS: "AMBIGUOUS",
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
  UNKNOWN: "UNKNOWN",
  ABSTAIN: "ABSTAIN"
});

const EMOTION_RULES = Object.freeze([
  { pattern: /冷笑/, category: "CONTEMPT", intensity: 0.55 },
  { pattern: /苦笑/, category: "SORROW", secondary: "AMUSEMENT", intensity: 0.45 },
  { pattern: /震惊|震撼/, category: "SURPRISE", intensity: 0.70 },
  { pattern: /愤怒|暴怒|怒火/, category: "WRATH", intensity: 0.75 },
  { pattern: /悲伤|悲痛|哀伤/, category: "SORROW", intensity: 0.65 },
  { pattern: /恐惧|惊恐|畏惧/, category: "FEAR", intensity: 0.70 },
  { pattern: /迟疑|犹豫/, category: "HESITATION", intensity: 0.40 },
  { pattern: /疑惑|不解/, category: "DOUBT", intensity: 0.45 },
  { pattern: /杀意/, category: "HOSTILITY", intensity: 0.75 },
  { pattern: /忌惮/, category: "APPREHENSION", intensity: 0.55 },
  { pattern: /寒意|发冷/, category: "FEAR", intensity: 0.55 }
]);

// Ordered from structurally specific to general. Evidence IDs are semantic facts,
// not target-language realization instructions.
const COGNITIVE_RULES = Object.freeze([
  { id: "NARRATIVE_EYE_GLEAM", kind: COGNITIVE_KINDS.NARRATIVE_REACTION, pattern: /眼中闪过(?:一道|一丝)?(?:精光|精芒)/, confidence: 0.98 },
  { id: "PHYSICAL_FROWN", kind: COGNITIVE_KINDS.NARRATIVE_REACTION, pattern: /(?:微微|轻轻)?皱眉/, confidence: 0.99 },
  { id: "HEART_JOLT", kind: COGNITIVE_KINDS.AFFECTIVE_REACTION, pattern: /心中一震|心头一震/, confidence: 0.99 },
  { id: "INNER_SNEER", kind: COGNITIVE_KINDS.AFFECTIVE_REACTION, pattern: /心中(?:暗自)?冷笑|暗自冷笑/, confidence: 0.98 },
  { id: "INNER_CHILL", kind: COGNITIVE_KINDS.INNER_STATE, pattern: /心中(?:升起|生出)(?:一股|一阵)?寒意|心头升起寒意/, confidence: 0.98 },
  { id: "INNER_APPREHENSION", kind: COGNITIVE_KINDS.INNER_STATE, pattern: /心中生出(?:一丝)?忌惮|心生忌惮|心头生出(?:一丝)?忌惮/, confidence: 0.98 },
  { id: "INNER_DOUBT", kind: COGNITIVE_KINDS.INNER_STATE, pattern: /心中(?:升起一股|泛起一阵)?疑惑|心头泛起疑惑/, confidence: 0.97 },
  { id: "INNER_TURMOIL", kind: COGNITIVE_KINDS.INNER_STATE, pattern: /心中掀起(?:一阵|滔天)?(?:波澜|骇浪)|心头掀起狂澜/, confidence: 0.97 },
  { id: "INEXPRESSIBLE_FEELING", kind: COGNITIVE_KINDS.INNER_STATE, pattern: /心中有些说不出|心中有些说不出的滋味|心中难言/, confidence: 0.96 },
  { id: "THOUGHT_UNCONTROLLABLE", kind: COGNITIVE_KINDS.EXPLICIT_THOUGHT, pattern: /心中忍不住想|心中不禁想到|心中不免想到/, confidence: 0.99 },
  { id: "THOUGHT_DELIBERATION", kind: COGNITIVE_KINDS.EXPLICIT_THOUGHT, pattern: /心中暗自思量|暗自思忖|暗自盘算|暗中思量/, confidence: 0.99 },
  { id: "THOUGHT_COVERT", kind: COGNITIVE_KINDS.EXPLICIT_THOUGHT, pattern: /心中暗道|心中暗想|暗暗想到/, confidence: 0.99 },
  { id: "THOUGHT_CONTINUATION", kind: COGNITIVE_KINDS.EXPLICIT_THOUGHT, pattern: /心中又想|心中复想|又暗自思索/, confidence: 0.98 },
  { id: "COGNITIVE_SPARK", kind: COGNITIVE_KINDS.EXPLICIT_THOUGHT, pattern: /脑海中闪过(?:一个|一道)念头|心中闪过一个念头/, confidence: 0.99 },
  { id: "COGNITIVE_EMERGENCE", kind: COGNITIVE_KINDS.EXPLICIT_THOUGHT, pattern: /脑海中浮现出(?:一个|一道)念头/, confidence: 0.99 },
  { id: "EXPLICIT_INFERENCE", kind: COGNITIVE_KINDS.INFERENCE, pattern: /(?:心中|暗自)?(?:推断|断定|判断|猜测)|由此可见|看来/, confidence: 0.94 },
  { id: "EXPLICIT_DECISION", kind: COGNITIVE_KINDS.DECISION, pattern: /(?:心中|暗自)?(?:决定|下定决心|打定主意)|想到这里|念及此处/, confidence: 0.94 },
  { id: "SUDDEN_RECOLLECTION", kind: COGNITIVE_KINDS.RECOLLECTION, pattern: /(?<!心中)忍不住想到|不禁想起|不由想起/, confidence: 0.96 },
  { id: "RECOLLECTION", kind: COGNITIVE_KINDS.RECOLLECTION, pattern: /(?:想起|想到)(?!这里|此处)/, confidence: 0.90 }
]);

function textRoleForKind(kind, fallbackRole = "EXPOSITION") {
  if ([COGNITIVE_KINDS.EXPLICIT_THOUGHT, COGNITIVE_KINDS.RECOLLECTION, COGNITIVE_KINDS.DECISION, COGNITIVE_KINDS.INFERENCE].includes(kind)) {
    return "INNER_THOUGHT";
  }
  if ([COGNITIVE_KINDS.INNER_STATE, COGNITIVE_KINDS.AFFECTIVE_REACTION].includes(kind)) {
    return "DESCRIPTION";
  }
  if (kind === COGNITIVE_KINDS.NARRATIVE_REACTION) return "ACTION";
  return fallbackRole;
}

function detectEmotion(sourceZh) {
  for (const rule of EMOTION_RULES) {
    const match = rule.pattern.exec(sourceZh);
    if (match) {
      return Object.freeze({
        category: rule.category,
        secondary: rule.secondary || null,
        sourceMarker: match[0],
        intensity: rule.intensity,
        confidence: 0.95
      });
    }
  }
  return Object.freeze({ category: "NEUTRAL", secondary: null, sourceMarker: null, intensity: 0.0, confidence: 1.0 });
}

function freezeResolution(value, fallbackStatus = COGNITIVE_STATUS.UNKNOWN) {
  if (!value) return Object.freeze({ status: fallbackStatus, entityId: null, confidence: 0.0, reason: "NO_DISCOURSE_EVIDENCE" });
  return Object.freeze({ ...value });
}

function analyzeCognitiveEvent(sourceZh, {
  fallbackRole = "EXPOSITION",
  discourse = null
} = {}) {
  const text = String(sourceZh || "");
  let selected = null;
  let match = null;

  for (const rule of COGNITIVE_RULES) {
    const current = rule.pattern.exec(text);
    if (current) {
      selected = rule;
      match = current;
      break;
    }
  }

  const pov = discourse && typeof discourse.getActivePOV === "function"
    ? discourse.getActivePOV()
    : "THIRD_PERSON_OMNISCIENT";
  const participantResolution = discourse && typeof discourse.resolveCognitiveParticipants === "function"
    ? discourse.resolveCognitiveParticipants(text)
    : {};
  const thinker = freezeResolution(participantResolution.thinker);
  const referent = freezeResolution(participantResolution.referent);
  const emotion = detectEmotion(text);

  if (!selected) {
    return Object.freeze({
      sourceSpan: "",
      textRole: fallbackRole,
      kind: COGNITIVE_KINDS.NONE,
      evidenceId: null,
      speaker: null,
      thinker,
      referent,
      pov,
      emotion,
      candidate: COGNITIVE_KINDS.NONE,
      confidence: 1.0,
      status: COGNITIVE_STATUS.ABSTAIN,
      reason: "NO_COGNITIVE_OR_INNER_STATE_EVIDENCE",
      constraints: Object.freeze(["DO_NOT_INFER_THOUGHT_FROM_NARRATION"])
    });
  }

  const sourceSpan = match[0];
  return Object.freeze({
    sourceSpan,
    textRole: textRoleForKind(selected.kind, fallbackRole),
    kind: selected.kind,
    evidenceId: selected.id,
    speaker: selected.kind === COGNITIVE_KINDS.EXPLICIT_THOUGHT ? thinker.entityId : null,
    thinker,
    referent,
    pov,
    emotion,
    candidate: selected.kind,
    confidence: selected.confidence,
    status: COGNITIVE_STATUS.RESOLVED,
    reason: `SYMBOLIC_RULE_${selected.id}`,
    constraints: Object.freeze([])
  });
}

module.exports = {
  COGNITIVE_KINDS,
  COGNITIVE_STATUS,
  COGNITIVE_RULES,
  EMOTION_RULES,
  analyzeCognitiveEvent,
  detectEmotion,
  textRoleForKind
};
