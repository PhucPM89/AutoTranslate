"use strict";

/**
 * Inner Monologue & Psychological Refiner.
 * Enhances internal thoughts, mental calculations, and emotional subtext,
 * eliminating repetitive thought verbs and polishing psychological flow.
 */

const MONOLOGUE_RULES = [
  // Redundant thought markers
  { pattern: /trong lòng không nhịn được nghĩ/gi, replacement: "trong lòng không khỏi thầm nghĩ" },
  { pattern: /trong lòng âm thầm suy nghĩ/gi, replacement: "trong lòng thầm tính toán" },
  { pattern: /trong lòng âm thầm nghĩ/gi, replacement: "trong lòng thầm nghĩ" },
  { pattern: /lại thầm nghĩ trong lòng/gi, replacement: "trong lòng lại nghĩ" },
  { pattern: /nhịn không được mà nghĩ tới/gi, replacement: "chợt nhớ tới" },
  { pattern: /trong đầu lóe lên một cái ý niệm/gi, replacement: "trong đầu chợt lóe lên một ý nghĩ" },
  { pattern: /trong đầu hiện lên một cái ý niệm/gi, replacement: "trong đầu chợt hiện lên một ý nghĩ" },

  // Emotional sensations & intuitions
  { pattern: /trong lòng hiện lên một cỗ nghi hoặc/gi, replacement: "trong lòng dấy lên từng đợt nghi hoặc" },
  { pattern: /trong lòng hiện lên một hồi chấn động/gi, replacement: "trong lòng dấy lên từng cơn sóng gió" },
  { pattern: /trong lòng sinh ra một tia kiêng kị/gi, replacement: "trong lòng dâng lên một tia kiêng dè" },
  { pattern: /trong lòng sinh ra một cỗ hàn ý/gi, replacement: "trong lòng dâng lên một luồng ớn lạnh" },
  { pattern: /trong lòng dâng lên một cỗ hàn ý/gi, replacement: "trong lòng dâng lên một luồng ớn lạnh" },
  { pattern: /trong lòng có chút không nói ra được/gi, replacement: "trong lòng có cảm giác khó tả" },

  // Reflections and decision triggers
  { pattern: /nghĩ tới đây,? trong mắt lóe lên tinh quang/gi, replacement: "nghĩ đến đây, trong mắt hắn lóe lên tia sáng sắc lạnh" },
  { pattern: /nghĩ đến đây,? trong mắt lóe lên một tia tinh quang/gi, replacement: "nghĩ đến đây, trong mắt hắn lóe lên tia sáng sắc lạnh" }
];

/**
 * Refines inner monologues and psychological descriptions.
 * @param {string} text
 * @returns {string}
 */
function refineInnerMonologue(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of MONOLOGUE_RULES) {
    result = result.replace(rule.pattern, (match) => {
      let rep = rule.replacement;
      if (/^[A-ZÀ-Ỹ]/.test(match)) {
        rep = rep.charAt(0).toUpperCase() + rep.slice(1);
      }
      return rep;
    });
  }
  return result;
}

module.exports = {
  refineInnerMonologue,
  MONOLOGUE_RULES
};
