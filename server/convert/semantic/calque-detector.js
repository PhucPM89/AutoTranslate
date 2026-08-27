"use strict";

/**
 * Chinese Calque Detector (Phase R7-3.1 Hardened)
 * 
 * Lightweight syntactic & lexical inspector that detects Chinese structural residue
 * in generated Vietnamese prose:
 * 1. Preposition & locative stacking (ở trong ... bên trong)
 * 2. Stiff 'mà + verb' postures (mà đứng, mà nhìn, mà nói)
 * 3. Double reporting verbs (trêu chọc nói, cười gượng nói)
 * 4. Adjective modifier stacking (của lăng lệ, của sắc bén)
 * 5. Mechanical verbalizations (đem... tiến hành, đối với... tiến hành)
 * 6. Stiff Sino-Vietnamese calques (khước vu, dục hỏa trùng sống, bức vua thoái vị)
 * 7. Coordinate pronoun stutter (Hắn đi qua, Hắn cầm kiếm)
 */

const CALQUE_PATTERNS = [
  {
    id: "LOCATIVE_STACKING",
    pattern: /(?:ở trong|trong|từ trong)\s+[^,.;!?\n]+?\s+bên trong\b/iu,
    severity: "HIGH",
    description: "Duplicate preposition + postposition locative stacking"
  },
  {
    id: "MA_VERB_POSTURE",
    pattern: /(?<!\p{L})(?:tựa|chắp tay|ngẩng đầu|đón gió|lơ lửng)\s+[^,.;!?\n]+?\s+mà\s+(?:đứng|lập|ngồi|nhìn|nói)(?!\p{L})/iu,
    severity: "HIGH",
    description: "Stiff 'mà + verb' Chinese posture calque (e.g. mà đứng)"
  },
  {
    id: "REPORTING_SPEECH_CALQUE",
    pattern: /(?<!\p{L})(?:trêu chọc nói|giễu giễu nói|cười gượng nói|cười khan nói|cười lạnh nói|lệ thanh nói)(?!\p{L})/iu,
    severity: "MEDIUM",
    description: "Redundant reporting verb compound"
  },
  {
    id: "ADJECTIVE_DE_STACKING",
    pattern: /(?<!\p{L})của\s+(?:lăng lệ|sắc bén|tuyệt mỹ|mỹ lệ|vĩ đại)(?!\p{L})/iu,
    severity: "HIGH",
    description: "Attributive modifier misanalyzed as possessor 'của'"
  },
  {
    id: "MECHANICAL_PROGRESSIVE",
    pattern: /(?<!\p{L})(?:đối với|đem)\s+[^,.;!?\n]+?\s+tiến hành(?!\p{L})/iu,
    severity: "HIGH",
    description: "Mechanical Chinese 'dui... jinxing' calque"
  },
  {
    id: "RAW_SINO_CALQUE",
    pattern: /(?<!\p{L})(?:khước vu|dục hỏa trùng sống|bức vua thoái vị|vũ đao lộng thương|toản nhập|phân phó nói)(?!\p{L})/iu,
    severity: "HIGH",
    description: "Raw unadapted Sino-Vietnamese calque"
  },
  {
    id: "COORDINATE_PRONOUN_STUTTER",
    pattern: /,\s*(?:Hắn|Nàng|Y)\s+[^,.;!?\n]+?,\s*(?:Hắn|Nàng|Y)\b/u,
    severity: "MEDIUM",
    description: "Repetitive coordinate subject pronoun stutter"
  }
];

/**
 * Inspects a Vietnamese text snippet for Chinese calques.
 * @param {string} text 
 * @returns {{ calqueCount: number, calqueScore: number, warnings: Array<object>, isCalqueFree: boolean }}
 */
function detectCalquePatterns(text) {
  if (!text || typeof text !== "string") {
    return { calqueCount: 0, calqueScore: 1.0, warnings: [], isCalqueFree: true };
  }

  const warnings = [];
  let weightedDeduction = 0;

  for (const rule of CALQUE_PATTERNS) {
    const match = text.match(rule.pattern);
    if (match) {
      warnings.push({
        ruleId: rule.id,
        severity: rule.severity,
        matchedText: match[0],
        description: rule.description
      });
      weightedDeduction += rule.severity === "HIGH" ? 0.30 : 0.15;
    }
  }

  const calqueScore = Math.max(0.0, Math.min(1.0, 1.0 - weightedDeduction));

  return {
    calqueCount: warnings.length,
    calqueScore: Number(calqueScore.toFixed(2)),
    warnings,
    isCalqueFree: warnings.length === 0
  };
}

module.exports = {
  detectCalquePatterns,
  CALQUE_PATTERNS
};
