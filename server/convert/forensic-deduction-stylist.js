"use strict";

/**
 * Forensic & Deduction Mystery Stylist.
 * Elevates locked-room murders, ironclad alibis, subtle crime scene traces,
 * deductive reasoning chains, and dramatic revelations of truth.
 */

const FORENSIC_RULES = [
  // Locked room & alibis
  { pattern: /(?:mật thất sát nhân|án mạng mật thất)(?!\s+phong tỏa)/gi, replacement: "vụ án mạng bí ẩn trong mật thất phong tỏa hoàn toàn" },
  { pattern: /bằng chứng ngoại phạm(?!\s+hoàn hảo)/gi, replacement: "bằng chứng ngoại phạm hoàn hảo không một kẽ hở" },

  // Clues & truth reveals
  { pattern: /(?:manh mối tơ nhện|dấu vết tơ nhện)(?!\s+khó nhận)/gi, replacement: "từng manh mối vụn vặt và dấu vết tơ nhện khó nhận ra nhất" },
  { pattern: /chân tướng đại bạch(?!\s*,\s*toàn bộ)/gi, replacement: "toàn bộ chân tướng đen tối cuối cùng cũng được phơi bày ra trước ánh sáng" }
];

/**
 * Polishes forensic, detective and deduction prose.
 * @param {string} text
 * @returns {string}
 */
function polishForensicProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of FORENSIC_RULES) {
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
  polishForensicProse,
  FORENSIC_RULES
};
