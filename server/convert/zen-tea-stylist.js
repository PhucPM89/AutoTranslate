"use strict";

/**
 * Zen Tea & Enlightenment Stylist.
 * Elevates spiritual tea brewing, Daoist discourse, serene tranquility,
 * sudden epiphanies (Dunwu), and transcending mortal dust.
 */

const ZEN_RULES = [
  // Tea brewing & tranquility
  { pattern: /(?:nấu trà luận đạo|đun trà luận đạo|pha trà luận đạo)(?!\s*,\s*cùng nhau)/gi, replacement: "đun nước pha trà, cùng nhau đàm đạo nhân sinh thế sự" },
  { pattern: /hương trà bốn phía(?!\s+làm lòng)/gi, replacement: "hương trà thanh khiết thoang thoảng làm lòng người thư thái dịu êm" },
  { pattern: /(?:tâm như nước lặng|tâm như nước đọng)(?!\s+không một)/gi, replacement: "tâm tịnh tựa mặt nước hồ thu không một gợn sóng" },

  // Sudden enlightenment & mortal cleansing
  { pattern: /(?:đột nhiên đốn ngộ|bỗng nhiên đốn ngộ)(?!\s*,\s*thấu tỏ)/gi, replacement: "trong khoảnh khắc bừng tỉnh đại ngộ, thấu tỏ huyền cơ thiên địa" },
  { pattern: /bụi trần tẩy lễ(?!\s+chốn)/gi, replacement: "rũ sạch mọi vướng bận và bụi trần chốn nhân thế" }
];

/**
 * Polishes Zen tea and enlightenment prose.
 * @param {string} text
 * @returns {string}
 */
function polishZenProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of ZEN_RULES) {
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
  polishZenProse,
  ZEN_RULES
};
