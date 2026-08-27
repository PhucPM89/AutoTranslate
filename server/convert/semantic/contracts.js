"use strict";

/**
 * Semantic & Context Engine — Core Data Contracts & Schema Validators (Phase 0 & 1)
 * 
 * Defines schemas, interfaces, and invariant checkers for:
 * 1. SemanticSignature (Multi-label Affect Distribution, Valence, Intensity, Register)
 * 2. ClauseIR (Resilient Slot-Based Intermediate Representation)
 * 3. SemanticContext & Multi-Domain Weights
 * 4. ShockEvidence & ShockScorer (Multi-Stream Event Boundary Detection)
 * 5. Uncertainty & Multi-Factor Abstention Contract
 * 6. StylistContribution Contract & Candidate Gating + Continuous Scoring
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
 * Evaluates semantic compatibility between Source Signature and Candidate Signature
 * using Soft Gating + Continuous Distance Scoring.
 * 
 * Prevents absolute hard drops when subtle, contextually rich variations occur,
 * while strictly guarding against severe polarity inversions (e.g. negative to positive).
 * 
 * @param {Object} sourceSig
 * @param {Object} candidateSig
 * @param {Object} options
 * @returns {{ compatible: boolean, score: number, reasons: string[] }}
 */
function checkSignatureCompatibility(sourceSig, candidateSig, {
  maxValenceDiff = 0.35,
  maxIntensityDiff = 0.40,
  minAffectSimilarity = 0.30
} = {}) {
  const reasons = [];

  // Hard Invariant: Severe Polarity Inversion (e.g., negative contempt to positive tranquil joy)
  const isSeverePolarityFlip =
    (sourceSig.valence < -0.25 && candidateSig.valence > 0.25) ||
    (sourceSig.valence > 0.25 && candidateSig.valence < -0.25);

  if (isSeverePolarityFlip) {
    return {
      compatible: false,
      score: 0.0,
      reasons: [`Polarity Inversion: Source valence (${sourceSig.valence}) vs Candidate valence (${candidateSig.valence})`]
    };
  }

  // Soft Valence Drift Check
  const isNeutralSource = sourceSig.affectDistribution.NEUTRAL && sourceSig.affectDistribution.NEUTRAL >= 0.80;
  const effectiveMaxValenceDiff = isNeutralSource ? 0.80 : maxValenceDiff;

  const valenceDiff = Math.abs(sourceSig.valence - candidateSig.valence);
  if (valenceDiff > effectiveMaxValenceDiff) {
    reasons.push(`Valence drift: ${valenceDiff.toFixed(2)} > ${effectiveMaxValenceDiff}`);
  }

  // Soft Intensity Drift Check
  const intensityDiff = Math.abs(sourceSig.intensity - candidateSig.intensity);
  if (intensityDiff > maxIntensityDiff) {
    reasons.push(`Intensity drift: ${intensityDiff.toFixed(2)} > ${maxIntensityDiff}`);
  }

  // Calculate Affect Vector Similarity (Cosine Similarity)
  const srcAff = sourceSig.affectDistribution;
  const candAff = candidateSig.affectDistribution;

  // If source is neutral/unannotated baseline, it gracefully accepts stylistic tone
  let affectSimilarity = 0;
  if (srcAff.NEUTRAL && srcAff.NEUTRAL >= 0.80) {
    affectSimilarity = 0.80; // High baseline compatibility for neutral text
  } else {
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
    affectSimilarity = (srcNorm > 0 && candNorm > 0) ? (dotProduct / (srcNorm * candNorm)) : 0;
  }

  if (affectSimilarity < minAffectSimilarity) {
    return {
      compatible: false,
      score: Number(affectSimilarity.toFixed(3)),
      reasons: [`Affect similarity too low: ${affectSimilarity.toFixed(2)} < ${minAffectSimilarity}`]
    };
  }

  // Continuous Composite Compatibility Score (0.0 to 1.0)
  const valenceScore = Math.max(0, 1 - (valenceDiff / 1.5));
  const intensityScore = Math.max(0, 1 - intensityDiff);
  const compositeScore = Number((affectSimilarity * 0.55 + valenceScore * 0.25 + intensityScore * 0.20).toFixed(3));

  return {
    compatible: reasons.length === 0,
    score: compositeScore,
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
  lexicalResolution = null, // { resolvedSlots, resolutionRecords, method, confidence }
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
    lexicalResolution: lexicalResolution ? Object.freeze({ ...lexicalResolution }) : null,
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
    hasAcousticShock = false,
    hasViolentActionShock = false,
    hasSpatioTemporalJump = false,
    isSpeakerChange = false,
    syntacticRole = "MAIN_ASSERTION"
  } = evidence;

  // If evidence occurs inside a quoted text, ancient book reading, or past memory,
  // it MUST NOT trigger an active scene transition shock.
  if (isQuotedOrRecollection || syntacticRole === "EMBEDDED_QUOTE") {
    return Object.freeze({
      isShock: false,
      transitionType: "RECOLLECTION_FILTERED",
      shockScore: 0.0,
      recommendedAlpha: 0.85,
      reason: "Shock words detected inside quotation/recollection; suppressed to prevent context poisoning."
    });
  }

  let score = 0.0;
  if (hasAcousticShock) score += 0.50;
  if (hasViolentActionShock) score += 0.50;
  if (hasSpatioTemporalJump) score += 0.40;
  if (isSpeakerChange) score += 0.15;

  score = Math.min(1.0, score);

  if (score >= 0.50) {
    return Object.freeze({
      isShock: true,
      transitionType: "PUNCTUAL_EVENT_SHOCK",
      shockScore: score,
      recommendedAlpha: 0.0,
      reason: "High-intensity punctual shock event detected in primary narrative stream."
    });
  }

  if (score >= 0.35) {
    return Object.freeze({
      isShock: false,
      transitionType: "MODERATE_SHIFT",
      shockScore: score,
      recommendedAlpha: 0.35,
      reason: "Moderate event shift detected; accelerating context adaptation."
    });
  }

  return Object.freeze({
    isShock: false,
    transitionType: "CONTINUOUS_FLOW",
    shockScore: score,
    recommendedAlpha: 0.75,
    reason: "Standard continuous narrative flow."
  });
}

/**
 * Multi-Factor Uncertainty & Abstention Evaluator.
 * 
 * Combines:
 * 1. Absolute Confidence of top candidate ($S_{top}$)
 * 2. Margin Delta ($S_{top} - S_{runnerUp}$)
 * 3. Evidence Quality / Overwhelming Evidence Threshold
 * 4. Candidate Type
 * 
 * Rule: If $S_{top} \ge 0.85$ (Overwhelming Absolute Confidence), resolve confidently even if margin is slightly close.
 * If candidates are truly tied ($S_{top} \approx S_{runnerUp} < 0.85$), abstain cleanly with AMBIGUOUS.
 * 
 * @param {Array<{ id: string, value: string, score: number, evidenceQuality?: number }>} candidates
 * @param {Object} options
 * @returns {Object} ResolutionResult
 */
function resolveWithAbstention(candidates = [], {
  confidenceThreshold = 0.65,
  marginDeltaThreshold = 0.20,
  overwhelmingConfidenceThreshold = 0.85,
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

  // If top candidate has overwhelming absolute confidence (> 0.85), resolve directly
  if (top.score >= overwhelmingConfidenceThreshold) {
    return Object.freeze({
      status: "RESOLVED",
      resolvedValue: top.value,
      confidence: top.score,
      selectedId: top.id,
      flag: "OVERWHELMING_EVIDENCE_RESOLUTION",
      abstentionReason: null
    });
  }

  // If there is a close contender without overwhelming evidence -> Abstain as AMBIGUOUS
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

  // If top candidate is below minimum confidence threshold -> Abstain as LOW_CONFIDENCE
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
  lexicalAudit = [],
  stylistAudit = [],
  budgetAudit = {}
} = {}) {
  return Object.freeze({
    clauseId: String(clauseId),
    sourceZh: String(sourceZh),
    finalVi: String(finalVi),
    contextSnapshot: Object.freeze({ ...contextSnapshot }),
    discourseResolution: Object.freeze({ ...discourseResolution }),
    lexicalAudit: Object.freeze(lexicalAudit.map((l) => Object.freeze({ ...l }))),
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
