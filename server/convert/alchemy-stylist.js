"use strict";

/**
 * Alchemy & Artifact Crafting Stylist.
 * Elevates pill crafting, cauldron refinement, flame control, and artifact forging
 * into authentic, majestic Xianxia terminology.
 */

const ALCHEMY_RULES = [
  // Pill fragrance and aromas
  { pattern: /(?:đan hương bốn phía phiêu tán|đan hương bốn phía|đan hương nồng nặc phiêu tán)/gi, replacement: "đan hương ngào ngạt lan tỏa khắp bốn phía" },
  { pattern: /đan hương đập vào mặt/gi, replacement: "đan hương ngào ngạt phả vào mặt" },
  { pattern: /mùi thuốc thơm nồng nặc/gi, replacement: "dược hương ngào ngạt xông vào mũi" },

  // Cauldron, flame & forging dynamics
  { pattern: /(?:lò nổ tung|lò luyện nổ tung)/gi, replacement: "lò luyện đan nổ tung kinh hoàng" },
  { pattern: /địa hỏa tôi luyện/gi, replacement: "tôi luyện trong Địa Hỏa cuộn trào" },
  { pattern: /chân hỏa tôi luyện/gi, replacement: "tôi luyện trong Chân Hỏa cuộn trào" },
  { pattern: /đan kiếp giáng lâm/gi, replacement: "đan kiếp ầm ầm giáng lâm" },

  // Pill manifestation & potency
  { pattern: /ngưng đan xuất thế/gi, replacement: "đan thành viên mãn, ngưng đan xuất thế" },
  { pattern: /dược lực phát tác/gi, replacement: "dược lực hùng hậu bắt đầu phát huy tác dụng" },
  { pattern: /dược lực tinh thuần/gi, replacement: "dược lực hùng hậu tinh thuần" },
  { pattern: /chín đạo đan văn/gi, replacement: "chín đạo đan văn tuyệt phẩm" }
];

/**
 * Polishes alchemy and crafting prose.
 * @param {string} text
 * @returns {string}
 */
function polishAlchemyProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of ALCHEMY_RULES) {
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
  polishAlchemyProse,
  ALCHEMY_RULES
};
