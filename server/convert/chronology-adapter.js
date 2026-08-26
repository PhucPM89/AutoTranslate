"use strict";

/**
 * Ancient Chronology & Measure Naturalizer.
 * Replaces stiff translations of ancient Chinese temporal expressions,
 * incense/tea durations, and classical measures with graceful, poetic Vietnamese.
 */

const CHRONOLOGY_RULES = [
  // Incense burning time
  { pattern: /(?:công phu một nén nhang|một nén nhang công phu)/gi, replacement: "chừng tàn một nén nhang" },
  { pattern: /một nén nhang thời gian/gi, replacement: "khoảng thời gian một nén nhang" },
  { pattern: /nửa nén nhang thời gian/gi, replacement: "khoảng thời gian nửa nén nhang" },

  // Tea drinking time
  { pattern: /(?:công phu một chén trà|một chén trà công phu)/gi, replacement: "chừng tàn một tuần trà" },
  { pattern: /(?:công phu nửa chén trà|nửa chén trà công phu)/gi, replacement: "chừng tàn nửa tuần trà" },
  { pattern: /một chén trà thời gian/gi, replacement: "khoảng thời gian một tuần trà" },
  { pattern: /nửa chén trà thời gian/gi, replacement: "khoảng thời gian nửa tuần trà" },

  // Breath and finger-snap moments
  { pattern: /(?:trong một cái búng tay|trong lúc búng tay)/gi, replacement: "chỉ trong cái búng tay" },
  { pattern: /(?:trong vòng mấy cái hô hấp|mấy cái hô hấp thời gian)/gi, replacement: "chỉ trong vài nhịp thở ngắn ngủi" },
  { pattern: /mấy cái hô hấp sau/gi, replacement: "sau vài nhịp thở" },
  { pattern: /trong mấy cái hô hấp/gi, replacement: "trong vài nhịp thở" },

  // Night watches & seasons
  { pattern: /ba canh nửa đêm/gi, replacement: "nửa đêm canh ba" },
  { pattern: /thời gian trôi qua thật nhanh/gi, replacement: "thời gian thấm thoắt trôi qua" },
  { pattern: /không bao lâu thời gian/gi, replacement: "không bao lâu sau" }
];

/**
 * Naturalizes ancient chronology and measures.
 * @param {string} text
 * @returns {string}
 */
function naturalizeChronology(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of CHRONOLOGY_RULES) {
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
  naturalizeChronology,
  CHRONOLOGY_RULES
};
