"use strict";

/**
 * Inner Monologue Contribution Provider (C2B-1.1 hardened)
 *
 * Semantic authority lives in ClauseIR.cognitiveEvent. This provider only maps
 * resolved cognitive evidence to target-realization candidates; it never scans
 * raw Chinese text to decide whether a thought exists.
 */

const { createSemanticSignature } = require("../contracts");
const { COGNITIVE_KINDS } = require("../cognitive-event-analyzer");
const { STYLE_SLOTS, createStylistContribution } = require("./stylist-contribution");

const MONOLOGUE_CONTRIBUTION_DEFINITIONS = Object.freeze([
  { evidenceId: "THOUGHT_UNCONTROLLABLE", candidateVi: "trong lòng không khỏi thầm nghĩ", denotation: "UNCONTROLLABLE_INNER_THOUGHT", affectDistribution: { TRANQUIL: 0.60, SOLEMN: 0.50 }, tone: "CONTEMPLATIVE", priority: 0.90 },
  { evidenceId: "THOUGHT_DELIBERATION", candidateVi: "trong lòng thầm tính toán", denotation: "SECRET_CALCULATION_THOUGHT", affectDistribution: { RESOLUTE: 0.70, SOLEMN: 0.60 }, tone: "CALCULATING", priority: 0.90 },
  { evidenceId: "THOUGHT_COVERT", candidateVi: "trong lòng thầm nghĩ", denotation: "INTERNAL_MUSING_MARKER", affectDistribution: { TRANQUIL: 0.60, SOLEMN: 0.50 }, tone: "CONTEMPLATIVE", priority: 0.90 },
  { evidenceId: "THOUGHT_CONTINUATION", candidateVi: "trong lòng lại nghĩ", denotation: "CONTINUOUS_INTERNAL_THOUGHT", affectDistribution: { TRANQUIL: 0.60 }, tone: "CONTEMPLATIVE", priority: 0.85 },
  { evidenceId: "SUDDEN_RECOLLECTION", candidateVi: "chợt nhớ tới", denotation: "SUDDEN_RECOLLECTION", affectDistribution: { TRANQUIL: 0.60 }, tone: "EVOCATIVE", priority: 0.85, allowedKinds: [COGNITIVE_KINDS.RECOLLECTION] },
  { evidenceId: "COGNITIVE_SPARK", candidateVi: "trong đầu chợt lóe lên một ý nghĩ", denotation: "COGNITIVE_INSIGHT_FLASH", affectDistribution: { SURPRISE: 0.55, SOLEMN: 0.45 }, tone: "ALERT", priority: 0.90 },
  { evidenceId: "COGNITIVE_EMERGENCE", candidateVi: "trong đầu chợt hiện lên một ý nghĩ", denotation: "COGNITIVE_EMERGENCE", affectDistribution: { TRANQUIL: 0.65, SOLEMN: 0.60 }, tone: "CONTEMPLATIVE", priority: 0.90 }
].map((definition) => Object.freeze({
  ...definition,
  allowedKinds: Object.freeze(definition.allowedKinds || [COGNITIVE_KINDS.EXPLICIT_THOUGHT])
})));

const MONOLOGUE_DEFINITIONS_BY_EVIDENCE = new Map(
  MONOLOGUE_CONTRIBUTION_DEFINITIONS.map((definition) => [definition.evidenceId, definition])
);

// Complete accounting of the 15 legacy target-string rewrites.
const MONOLOGUE_RULE_ACCOUNTABILITY = Object.freeze([
  { oldRule: 1, disposition: "MIGRATED", evidenceId: "THOUGHT_UNCONTROLLABLE" },
  { oldRule: 2, disposition: "MIGRATED", evidenceId: "THOUGHT_DELIBERATION" },
  { oldRule: 3, disposition: "MIGRATED", evidenceId: "THOUGHT_COVERT" },
  { oldRule: 4, disposition: "MIGRATED", evidenceId: "THOUGHT_CONTINUATION" },
  { oldRule: 5, disposition: "MIGRATED", evidenceId: "SUDDEN_RECOLLECTION" },
  { oldRule: 6, disposition: "MIGRATED", evidenceId: "COGNITIVE_SPARK" },
  { oldRule: 7, disposition: "MIGRATED", evidenceId: "COGNITIVE_EMERGENCE" },
  { oldRule: 8, disposition: "MOVED", evidenceId: "INNER_DOUBT", reason: "INNER_STATE is not inner monologue; realization deferred to a state-capable contract." },
  { oldRule: 9, disposition: "MOVED", evidenceId: "INNER_TURMOIL", reason: "INNER_STATE is not inner monologue; realization deferred to a state-capable contract." },
  { oldRule: 10, disposition: "MOVED", evidenceId: "INNER_APPREHENSION", reason: "INNER_STATE is not inner monologue; realization deferred to a state-capable contract." },
  { oldRule: 11, disposition: "MERGED_MOVED", evidenceId: "INNER_CHILL", reason: "Same source state as old rule 12; no monologue realization." },
  { oldRule: 12, disposition: "MERGED_MOVED", evidenceId: "INNER_CHILL", reason: "Same source state as old rule 11; no monologue realization." },
  { oldRule: 13, disposition: "MOVED", evidenceId: "INEXPRESSIBLE_FEELING", reason: "INNER_STATE is not inner monologue; realization deferred to a state-capable contract." },
  { oldRule: 14, disposition: "MERGED_MOVED", evidenceId: "NARRATIVE_EYE_GLEAM", reason: "Physical narrative reaction, not thought; legacy hardcoded pronoun is forbidden." },
  { oldRule: 15, disposition: "MERGED_MOVED", evidenceId: "NARRATIVE_EYE_GLEAM", reason: "Same narrative reaction as old rule 14; legacy hardcoded pronoun is forbidden." }
].map((entry) => Object.freeze(entry)));

function evaluate(clauseIR) {
  const event = clauseIR && clauseIR.cognitiveEvent;
  if (!event || event.status !== "RESOLVED") {
    return { contributions: [], audit: Object.freeze({ status: "ABSTAIN", reason: "MISSING_RESOLVED_COGNITIVE_EVENT", constraint: "PROVIDER_CANNOT_CLASSIFY_RAW_SOURCE" }) };
  }

  const definition = MONOLOGUE_DEFINITIONS_BY_EVIDENCE.get(event.evidenceId);
  if (!definition || !definition.allowedKinds.includes(event.kind)) {
    return {
      contributions: [],
      audit: Object.freeze({
        status: "REJECT",
        reason: `COGNITIVE_KIND_${event.kind}_IS_NOT_AUTHORIZED_FOR_INNER_MONOLOGUE`,
        constraint: "INNER_MONOLOGUE_REQUIRES_EXPLICIT_THOUGHT_OR_RECOLLECTION",
        sourceSpan: event.sourceSpan,
        cognitiveEventKind: event.kind
      })
    };
  }

  const signature = createSemanticSignature({
    denotation: definition.denotation,
    affectDistribution: definition.affectDistribution,
    valence: 0.0,
    intensity: event.emotion ? event.emotion.intensity : 0.4,
    register: "CLASSICAL_LITERARY"
  });
  const contribution = createStylistContribution({
    providerId: "monologue-provider",
    domain: "MONOLOGUE_PSYCHOLOGY",
    targetSlot: STYLE_SLOTS.INNER_MONOLOGUE,
    dimension: "LEXICAL",
    sourceSpanZh: event.sourceSpan,
    candidateVi: definition.candidateVi,
    semanticRequirements: { cognitiveKind: event.kind, evidenceId: event.evidenceId, semanticStatus: event.status },
    semanticSignature: signature,
    tone: definition.tone,
    register: signature.register,
    rhythmPreference: "FLOWING_BALANCED",
    lexicalPriority: definition.priority,
    confidence: event.confidence,
    semanticExpansionCost: 0.0,
    introducedInformation: [],
    introducedMetaphor: false,
    surfaceRealization: true,
    provenance: `monologue-provider:${event.evidenceId}->${STYLE_SLOTS.INNER_MONOLOGUE}`
  });

  return {
    contributions: [contribution],
    audit: Object.freeze({
      status: "WIN_CANDIDATE",
      reason: "RESOLVED_COGNITIVE_EVENT_AUTHORIZED",
      sourceSpan: event.sourceSpan,
      textRole: event.textRole,
      cognitiveEventKind: event.kind,
      thinker: event.thinker,
      referent: event.referent,
      pov: event.pov,
      emotion: event.emotion,
      candidate: definition.candidateVi,
      confidence: event.confidence
    })
  };
}

function createMonologueProvider() {
  return Object.freeze({
    providerId: "monologue-provider",
    domain: "MONOLOGUE_PSYCHOLOGY",
    supportedSlots: [STYLE_SLOTS.INNER_MONOLOGUE],
    contribute(clauseIR) {
      return evaluate(clauseIR).contributions;
    },
    getSuggestions(clauseIR, context = {}) {
      const result = evaluate(clauseIR);
      const domainWeight = (context.domainWeights && context.domainWeights.MONOLOGUE_PSYCHOLOGY) || 0.80;
      return Object.freeze({
        providerId: "monologue-provider",
        domain: "MONOLOGUE_PSYCHOLOGY",
        confidence: domainWeight,
        contributions: Object.freeze(result.contributions),
        cognitiveAudit: result.audit,
        forbiddenPatterns: []
      });
    }
  });
}

module.exports = {
  createMonologueProvider,
  MONOLOGUE_CONTRIBUTION_DEFINITIONS,
  MONOLOGUE_RULE_ACCOUNTABILITY
};
