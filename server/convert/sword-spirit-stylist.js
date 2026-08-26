"use strict";

/**
 * Sword Spirit & Sword Intent Stylist.
 * Elevates supreme sword dao, sentient blade spirits, unsheathing resonance,
 * sword heart clarity, and the sublime union of swordsman and blade.
 */

const SWORD_RULES = [
  // Sword intent & clarity
  { pattern: /kiếm ý thông thiên(?!\s+ngút trời)/gi, replacement: "kiếm ý thông thiên ngút trời xé toạc tầng mây" },
  { pattern: /kiếm tâm thông minh(?!\s*,\s*trong sáng)/gi, replacement: "kiếm tâm thông minh, trong sáng không một gợn bụi trần" },
  { pattern: /kiếm khí tung hoành(?!\s+ngang dọc)/gi, replacement: "kiếm khí tung hoành ngang dọc rực sáng cả bầu trời" },

  // Blade unsheathing & sword spirit
  { pattern: /(?:bảo kiếm ra khỏi vỏ|bảo kiếm xuất vỏ|bảo kiếm rời vỏ)(?!\s+phát ra)/gi, replacement: "bảo kiếm rời vỏ phát ra tiếng leng keng lảnh lót ngân vang" },
  { pattern: /khí linh thức tỉnh(?!\s+sau giấc ngủ)/gi, replacement: "khí linh thượng cổ từ từ thức tỉnh sau giấc ngủ vạn năm" },
  { pattern: /(?:người kiếm hợp nhất|nhân kiếm hợp nhất)(?!\s*,\s*người là)/gi, replacement: "người và kiếm hòa làm một, người là kiếm, kiếm là người" }
];

/**
 * Polishes sword spirit and intent prose.
 * @param {string} text
 * @returns {string}
 */
function polishSwordProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of SWORD_RULES) {
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
  polishSwordProse,
  SWORD_RULES
};
