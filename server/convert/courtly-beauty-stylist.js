"use strict";

/**
 * Aesthetic Beauty & Courtly Grace Stylist.
 * Translates classical maiden aesthetics, ethereal beauty, radiant skin,
 * flowing hair, and grace into poetic, mesmerizing Vietnamese prose.
 */

const BEAUTY_RULES = [
  // Skin & hair aesthetics
  { pattern: /(?:da như mỡ đông|da như ngọc đông|da thịt trắng như tuyết)/gi, replacement: "làn da trắng ngần mịn màng như ngọc" },
  { pattern: /(?:tóc đen như thác nước|mái tóc đen như thác nước)/gi, replacement: "suối tóc đen tuyền buông xõa mượt mà" },

  // Attire & elegance
  { pattern: /(?:một bộ áo trắng hơn tuyết|một thân áo trắng hơn tuyết|một thân bạch y thắng tuyết)/gi, replacement: "tà áo trắng tinh khôi thanh khiết tựa tuyết đầu mùa" },
  { pattern: /(?:ánh mắt lưu chuyển|ánh mắt lưu chuyển như nước)/gi, replacement: "ánh mắt long lanh tựa làn nước mùa thu" },

  // Radiance & ethereal grace
  { pattern: /khuynh quốc khuynh thành(?!\s+tuyệt trần)/gi, replacement: "nhan sắc tuyệt trần khuynh quốc khuynh thành" },
  { pattern: /dung mạo tuyệt mỹ/gi, replacement: "dung nhan tuyệt mỹ không tì vết" },
  { pattern: /khí chất xuất trần/gi, replacement: "khí chất thanh tao thoát tục" }
];

/**
 * Polishes aesthetic beauty and maiden descriptions.
 * @param {string} text
 * @returns {string}
 */
function polishBeautyProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of BEAUTY_RULES) {
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
  polishBeautyProse,
  BEAUTY_RULES
};
