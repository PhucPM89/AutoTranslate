"use strict";

/**
 * Soul Token & Life-Lamp Stylist.
 * Elevates ancestral hall shocks, life-token shattering, soul lamp extinguishing,
 * and the ominous omens of fallen disciples or ancestors into dramatic, chilling prose.
 */

const SOUL_TOKEN_RULES = [
  // Life tokens & soul lamps
  { pattern: /(?:mệnh bài vỡ vụn|mệnh bài nứt vỡ)(?!\s+thành từng)/gi, replacement: "mệnh bài bản mệnh răng rắc vỡ vụn thành từng mảnh vụn" },
  { pattern: /(?:hồn đăng tắt ngấm|hồn đăng dập tắt)(?!\s+đại diện)/gi, replacement: "ngọn hồn đăng đại diện cho sinh mệnh bỗng nhiên phụt tắt" },

  // Ancestral hall & life flame
  { pattern: /tổ miếu chấn động(?!\s*,\s*chấn động)/gi, replacement: "tổ miếu rung chuyển dữ dội, chấn động toàn bộ tông môn" },
  { pattern: /(?:ngọn lửa sinh mệnh tắt|ngọn lửa sinh mệnh dập tắt)(?!\s+triệt để)/gi, replacement: "ngọn lửa sinh mệnh triệt để lụi tàn tiêu tán giữa đất trời" }
];

/**
 * Polishes soul token and life-lamp prose.
 * @param {string} text
 * @returns {string}
 */
function polishSoulTokenProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of SOUL_TOKEN_RULES) {
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
  polishSoulTokenProse,
  SOUL_TOKEN_RULES
};
