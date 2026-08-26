"use strict";

/**
 * Topography & Sacred Grounds Stylist.
 * Elevates scenic descriptions of immortal mountains, ancient topography,
 * primordial forests, sacred paradises, and forbidden lands.
 */

const TOPOGRAPHY_RULES = [
  // Spiritual mists & sacred mountains
  { pattern: /(?:linh khí hóa vụ|linh khí ngưng tụ thành sương mù)/gi, replacement: "linh khí đậm đặc ngưng tụ thành từng làn sương mờ ảo" },
  { pattern: /(?:mây mù vờn quanh|mây mù lượn lờ)/gi, replacement: "mây mù lãng đãng vờn quanh đỉnh núi thiêng" },
  { pattern: /động thiên phúc địa(?!\s+tràn đầy)/gi, replacement: "động thiên phúc địa tràn đầy linh khí đất trời" },

  // Precipices & death zones
  { pattern: /vách đá muôn trượng/gi, replacement: "vách đá dựng đứng muôn trượng hiểm trở vô cùng" },
  { pattern: /sinh cơ đoạn tuyệt\b/gi, replacement: "ngập tràn tử khí, sinh cơ đoạn tuyệt" },
  { pattern: /tử khí ngập trời/gi, replacement: "tử khí u ám cuồn cuộn ngút trời" }
];

/**
 * Polishes topography and landscape prose.
 * @param {string} text
 * @returns {string}
 */
function polishTopographyProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of TOPOGRAPHY_RULES) {
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
  polishTopographyProse,
  TOPOGRAPHY_RULES
};
