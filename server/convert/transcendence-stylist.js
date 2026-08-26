"use strict";

/**
 * Time Skips & Transcendence Stylist.
 * Elevates millennium time jumps, mortal-immortal transience, cosmic solitude,
 * and the bittersweet pursuit of the solitary Dao.
 */

const TRANSCENDENCE_RULES = [
  // Time skips & mortal fleetingness
  { pattern: /(?:búng tay ngàn năm|tuế nguyệt như thoi|năm tháng như thoi)/gi, replacement: "thấm thoắt ngàn năm trôi qua chỉ tựa một cái chớp mắt" },
  { pattern: /(?:vật là người phi|vật còn người mất)/gi, replacement: "cảnh còn người mất, vật đổi sao dời" },

  // Solitary Dao & mortal watching
  { pattern: /đại đạo độc hành/gi, replacement: "độc bước trên con đường đại đạo thênh thang nhưng cô tịch lạnh lẽo" },
  { pattern: /(?:nhìn hết nhân gian phồn hoa|ngắm nhìn hết phồn hoa nhân gian)/gi, replacement: "ngắm nhìn hết thăng trầm dâu bể và phồn hoa chốn nhân gian" }
];

/**
 * Polishes transcendence and time skip prose.
 * @param {string} text
 * @returns {string}
 */
function polishTranscendenceProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of TRANSCENDENCE_RULES) {
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
  polishTranscendenceProse,
  TRANSCENDENCE_RULES
};
