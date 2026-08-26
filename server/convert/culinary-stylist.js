"use strict";

/**
 * Culinary & Immortal Banquet Stylist.
 * Elevates feast descriptions, immortal wines, spiritual fruits, celestial banquets,
 * and gastronomic sensations into vivid, mouthwatering, and evocative prose.
 */

const CULINARY_RULES = [
  // Immortal wines & delicacies
  { pattern: /quỳnh tương ngọc dịch/gi, replacement: "mỹ tửu quỳnh tương ngọc dịch thơm nồng ngất ngây" },
  { pattern: /trân tu mỹ vị(?!\s*,\s*cao lương)/gi, replacement: "trân tu mỹ vị, cao lương mỹ vị bày la liệt khắp bàn tiệc" },

  // Taste sensations
  { pattern: /(?:vào miệng là tan|tan ngay trong miệng)/gi, replacement: "vừa chạm vào đầu lưỡi đã tan chảy, đọng lại vị ngọt thanh khiết nơi cuống họng" },
  { pattern: /(?:môi răng lưu hương|đọng lại mùi thơm trong miệng)/gi, replacement: "dư vị thơm ngát vấn vương mãi nơi đầu môi khóe miệng" },

  // Banquet toasts
  { pattern: /(?:đẩy chén đổi ly|chén tạc chén thù(?!\s*,\s*cùng nhau))/gi, replacement: "chén tạc chén thù, cùng nhau nâng ly cạn chén vô cùng rôm rả" }
];

/**
 * Polishes culinary and banquet prose.
 * @param {string} text
 * @returns {string}
 */
function polishCulinaryProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of CULINARY_RULES) {
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
  polishCulinaryProse,
  CULINARY_RULES
};
