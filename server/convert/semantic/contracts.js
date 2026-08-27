"use strict";

/**
 * Semantic & Context Engine — Core Data Contracts & Schema Validators (Phase 0)
 * 
 * Defines schemas, interfaces, and invariant checkers for:
 * 1. SemanticSignature (Multi-label Affect Distribution, Valence, Intensity, Register)
 * 2. ClauseIR (Resilient Slot-Based Intermediate Representation)
 * 3. SemanticContext & Multi-Domain Weights
 * 4. ShockEvidence & ShockScorer (Multi-Stream Event Boundary Detection)
 * 5. Uncertainty & Abstention Contract
 * 6. StylistContribution Contract & Candidate Gating
 * 7. ProvenanceTrace Contract
 */

// Canonical Affect Dimensions for Literary Chinese -> Vietnamese Translation
const CANONICAL_AFFECTS = Object.freeze([
  "CONTEMPT",    // Khinh miệt, chê cười (冷笑, 讥笑)
  "HOSTILITY",   // Thù địch, sát khí, căm hận (怒目, 杀意)
  "WRATH",       // Phẫn nộ, thịnh nộ (暴怒, 厉喝)
  "JOY",         // Hân hoan, vui sướng (大喜, 欣喜)
  "AMUSEMENT",   // Buồn cười, thích thú (莞尔, 忍俊不禁, 苦笑中的一丝戏谑)
  "SORROW",      // Bi thương, đau đớn (悲痛, 凄凉, 哀伤)
  "FEAR",        // Khiếp đảm, kinh hoàng (惊恐, 战栗)
  "SURPRISE",    // Kinh ngạc, bất ngờ (震惊, 愕然)
  "SOLEMN",      // Trang nghiêm, túc mục (肃穆, 郑重)
  "TRANQUIL",    // An nhiên, thanh thản, thiền định (淡然, 宁静, 从容)
  "MELANCHOLY",  // U sầu, hoài niệm, thổn thức (唏嘘, 怅然)
  "RESOLUTE",    // Kiên định, quả quyết, bất khuất (决绝, 坚定)
  "NEUTRAL"      // Bình thản, vô cảm, khách quan (平静, 面无表情)
]);

// Canonical Registers
const CANONICAL_REGISTERS = Object.freeze([
  "CLASSICAL_LITERARY", // Cổ kính, trang nhã, điển nhã
  "VERNACULAR",         // Bạch thoại, tiểu thuyết thông dụng
  "CASUAL_SPOKEN",      // Khẩu ngữ đời thường, đàm thoại
  "VULGAR_SLANG",       // Thô tục, tiếng lóng, mắng chửi
  "SOLEMN_DECREE",      // Chiếu chỉ, khẩu quyết, cấm chú
  "SYSTEM_PROMPT"       // Thông báo hệ thống, giao diện cơ giáp/game
]);

/**
 * Creates and normalizes a SemanticSignature.
 * @param {Object} spec
 * @returns {Object} Normalized SemanticSignature
 */
function createSemanticSignature({
  denotation = "",
  affectDistribution = {},
  valence = 0.0,
  intensity = 0.5,
  register = "VERNACULAR"
} = {}) {
  // Normalize affect distribution: ensure all non-zero keys are valid canonical affects
  const cleanDistribution = {};
  for (const [key, val] of Object.entries(affectDistribution)) {
    const upperKey = String(key).toUpperCase();
    if (CANONICAL_AFFECTS.includes(upperKey) && typeof val === "number" && val > 0) {
      cleanDistribution[upperKey] = Math.min(1.0, Math.max(0.0, Number(val.toFixed(3))));
    }
  }

  // If distribution is empty, default to NEUTRAL: 1.0
  if (Object.keys(cleanDistribution).length === 0) {
    cleanDistribution.NEUTRAL = 1.0;
  }

  // Clamped bounds
  const clampedValence = Math.min(1.0, Math.max(-1.0, Number(valence.toFixed(3))));
  const clampedIntensity = Math.min(1.0, Math.max(0.0, Number(intensity.toFixed(3))));
  const validRegister = CANONICAL_REGISTERS.includes(register) ? register : "VERNACULAR";

  return Object.freeze({
    denotation: String(denotation || "").trim(),
    affectDistribution: Object.freeze(cleanDistribution),
    valence: clampedValence,
    intensity: clampedIntensity,
    register: validRegister
  });
}

/**
 * Evaluates semantic compatibility between Source Signature and Candidate Signature.
 * Ensures:
 * 1. Affect vector distance is within threshold (Cosine or Overlap similarity).
 * 2. Valence difference <= maxValenceDiff (strictly forbids polarity inversion).
 * 3. Intensity difference <= maxIntensityDiff.
 * @param {Object} sourceSig
 * @param {Object} candidateSig
 * @param {Object} options
 * @returns {{ compatible: boolean, score: number, reasons: string[] }}
 */
function checkSignatureCompatibility(sourceSig, candidateSig, {
  maxValenceDiff = 0.25,
  maxIntensityDiff = 0.30,
  minAffectSimilarity = 0.40
} = {}) {
  const reasons = [];

  // Check valence polarity drift
  const valenceDiff = Math.abs(sourceSig.valence - candidateSig.valence);
  if (valenceDiff > maxValenceDiff) {
    // If sign flipped (e.g. negative to positive), strictly reject
    if ((sourceSig.valence < -0.2 && candidateSig.valence > 0.2) ||
        (sourceSig.valence > 0.2 && candidateSig.valence < -0.2)) {
      return {
        compatible: false,
        score: 0,
        reasons: [`Polarity Inversion: Source valence (${sourceSig.valence}) vs Candidate valence (${candidateSig.valence})`]
      };
    }
    reasons.push(`Valence diff exceeds threshold: ${valenceDiff.toFixed(2)} > ${maxValenceDiff}`);
  }

  // Check intensity drift
  const intensityDiff = Math.abs(sourceSig.intensity - candidateSig.intensity);
  if (intensityDiff > maxIntensityDiff) {
    reasons.push(`Intensity diff exceeds threshold: ${intensityDiff.toFixed(2)} > ${maxIntensityDiff}`);
  }

  // Calculate Affect Vector Similarity (Dot Product / Cosine Similarity of distributions)
  const srcAff = sourceSig.affectDistribution;
  const candAff = candidateSig.affectDistribution;
  const allKeys = new Set([...Object.keys(srcAff), ...Object.keys(candAff)]);

  let dotProduct = 0;
  let srcNormSq = 0;
  let candNormSq = 0;

  for (const k of allKeys) {
    const s = srcAff[k] || 0;
    const c = candAff[k] || 0;
    dotProduct += s * c;
    srcNormSq += s * s;
    candNormSq += c * c;
  }

  const srcNorm = Math.sqrt(srcNormSq);
  const candNorm = Math.sqrt(candNormSq);
  const affectSimilarity = (srcNorm > 0 && candNorm > 0) ? (dotProduct / (srcNorm * candNorm)) : 0;

  if (affectSimilarity < minAffectSimilarity) {
    return {
      compatible: false,
      score: affectSimilarity,
      reasons: [`Affect similarity too low: ${affectSimilarity.toFixed(2)} < ${minAffectSimilarity}`]
    };
  }

  const overallScore = Number((affectSimilarity * 0.6 + (1 - valenceDiff / 2) * 0.2 + (1 - intensityDiff) * 0.2).toFixed(3));
  return {
    compatible: reasons.length === 0,
    score: overallScore,
    reasons
  };
}

/**
 * Creates a Slot-Based Resilient ClauseIR.
 */
function createClauseIR({
  id = "",
  tier = "FULL_FRAME", // FULL_FRAME | SERIAL_ACTION | TOPIC_COMMENT | IDIOMATIC_CHUNK
  sourceZh = "",
  role = "ACTION",     // DIALOGUE | INNER_THOUGHT | ACTION | DESCRIPTION | EXPOSITION | INCANTATION
  subjectSlot = null,  // { entityId, isImplicit, resolvedPronoun, confidence }
  actionSequence = [], // Array<{ verbZh, actionVi, manner, weaponEntity, intensity }>
  objectSlot = null,   // { entityId, baseVi, attributes: [] }
  semanticSignature = null,
  contextWeights = {},
  invariants = {},
  uncertainty = null
} = {}) {
  return Object.freeze({
    id: String(id),
    tier,
    sourceZh: String(sourceZh),
    role,
    subjectSlot: subjectSlot ? Object.freeze({ ...subjectSlot }) : null,
    actionSequence: Object.freeze(actionSequence.map((a) => Object.freeze({ ...a }))),
    objectSlot: objectSlot ? Object.freeze({ ...objectSlot }) : null,
    semanticSignature: semanticSignature || createSemanticSignature(),
    contextWeights: Object.freeze({ ...contextWeights }),
    invariants: Object.freeze({
      preserveClauseOrder: invariants.preserveClauseOrder !== false,
      maxAdjectives: invariants.maxAdjectives ?? 1,
      allowMetaphor: invariants.allowMetaphor === true,
      ...invariants
    }),
    uncertainty: uncertainty ? Object.freeze({ ...uncertainty }) : Object.freeze({
      status: "RESOLVED",
      confidence: 1.0,
      flag: "EXPLICIT_CERTAINTY"
    })
  });
}

/**
 * Multi-Stream Shock Scorer for Event Boundary & Context Transition.
 * Prevents false positives from quoted speech, flashbacks, and ancient book lore.
 * 
 * @param {Object} evidence
 * @returns {Object} ShockDecision
 */
function scoreContextShock(evidence = {}) {
  const {
    isQuotedOrRecollection = false,
    hasAcousticShock = false,      // Ầm, Rầm, Keng, Phập, Bỗng nhiên...
    hasViolentActionShock = false,  // Kiếm khí bùng nổ, máu bắn tung tóe, sát khí ngập trời...
    hasSpatioTemporalJump = false, // Ba năm sau, sau khi trở về, ở một diễn biến khác...
    isSpeakerChange = false,
    syntacticRole = "MAIN_ASSERTION" // MAIN_ASSERTION | EMBEDDED_QUOTE | SUBORDINATE_CLAUSE
  } = evidence;

  // RULE 1: If evidence occurs inside a quoted text, ancient book reading, or past memory,
  // it MUST NOT trigger an active scene transition shock!
  if (isQuotedOrRecollection || syntacticRole === "EMBEDDED_QUOTE") {
    return Object.freeze({
      isShock: false,
      transitionType: "RECOLLECTION_FILTERED",
      shockScore: 0.0,
      recommendedAlpha: 0.85, // Retain current scene context strongly
      reason: "Shock words detected inside quotation/recollection; suppressed to prevent context poisoning."
    });
  }

  // Calculate composite shock score
  let score = 0.0;
  if (hasAcousticShock) score += 0.45;
  if (hasViolentActionShock) score += 0.50;
  if (hasSpatioTemporalJump) score += 0.40;
  if (isSpeakerChange) score += 0.15;

  score = Math.min(1.0, score);

  if (score >= 0.70) {
    return Object.freeze({
      isShock: true,
      transitionType: "PUNCTUAL_EVENT_SHOCK",
      shockScore: score,
      recommendedAlpha: 0.0, // Instantly drop inertia, transition fully to new event
      reason: "High-intensity punctual shock event detected in primary narrative stream."
    });
  }

  if (score >= 0.40) {
    return Object.freeze({
      isShock: false,
      transitionType: "MODERATE_SHIFT",
      shockScore: score,
      recommendedAlpha: 0.35, // Accelerated blending
      reason: "Moderate event shift detected; accelerating context adaptation."
    });
  }

  return Object.freeze({
    isShock: false,
    transitionType: "CONTINUOUS_FLOW",
    shockScore: score,
    recommendedAlpha: 0.75, // Standard temporal inertia
    reason: "Standard continuous narrative flow."
  });
}

/**
 * Uncertainty & Abstention Evaluator.
 * Adheres to: Correct Resolution + Correct Abstention = Success.
 * 
 * @param {Array<{ id: string, value: string, score: number }>} candidates
 * @param {Object} options
 * @returns {Object} ResolutionResult
 */
function resolveWithAbstention(candidates = [], {
  confidenceThreshold = 0.65,
  marginDeltaThreshold = 0.20,
  neutralFallback = "đối phương",
  unknownFallback = "người này"
} = {}) {
  if (!candidates || candidates.length === 0) {
    return Object.freeze({
      status: "UNKNOWN",
      resolvedValue: unknownFallback,
      confidence: 0.0,
      selectedId: null,
      flag: "NO_EVIDENCE_ABSTENTION",
      abstentionReason: "Zero candidate evidence available in discourse state."
    });
  }

  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const runnerUp = sorted[1];

  // If there is a close contender (ambiguity)
  if (runnerUp && (top.score - runnerUp.score < marginDeltaThreshold)) {
    return Object.freeze({
      status: "AMBIGUOUS",
      resolvedValue: neutralFallback,
      confidence: top.score,
      selectedId: null,
      candidates: [top.id, runnerUp.id],
      flag: `AMBIGUITY_DETECTED_${top.id}_VS_${runnerUp.id}`,
      abstentionReason: `Margin delta (${(top.score - runnerUp.score).toFixed(2)}) is below threshold (${marginDeltaThreshold}); abstaining from guess.`
    });
  }

  // If top candidate is below confidence threshold
  if (top.score < confidenceThreshold) {
    return Object.freeze({
      status: "LOW_CONFIDENCE",
      resolvedValue: neutralFallback,
      confidence: top.score,
      selectedId: top.id,
      flag: "LOW_CONFIDENCE_ABSTENTION",
      abstentionReason: `Confidence score (${top.score.toFixed(2)}) is below threshold (${confidenceThreshold}); falling back to neutral form.`
    });
  }

  return Object.freeze({
    status: "RESOLVED",
    resolvedValue: top.value,
    confidence: top.score,
    selectedId: top.id,
    flag: "CONFIDENT_RESOLUTION",
    abstentionReason: null
  });
}

/**
 * Creates a ProvenanceTrace object for complete explainability.
 */
function createProvenanceTrace({
  clauseId = "",
  sourceZh = "",
  finalVi = "",
  contextSnapshot = {},
  discourseResolution = {},
  stylistAudit = [],
  budgetAudit = {}
} = {}) {
  return Object.freeze({
    clauseId: String(clauseId),
    sourceZh: String(sourceZh),
    finalVi: String(finalVi),
    contextSnapshot: Object.freeze({ ...contextSnapshot }),
    discourseResolution: Object.freeze({ ...discourseResolution }),
    stylistAudit: Object.freeze(stylistAudit.map((s) => Object.freeze({ ...s }))),
    budgetAudit: Object.freeze({ ...budgetAudit }),
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  CANONICAL_AFFECTS,
  CANONICAL_REGISTERS,
  createSemanticSignature,
  checkSignatureCompatibility,
  createClauseIR,
  scoreContextShock,
  resolveWithAbstention,
  createProvenanceTrace
};
