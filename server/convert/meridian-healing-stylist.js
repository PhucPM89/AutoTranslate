"use strict";

/**
 * Medical Diagnostics & Acupuncture Stylist.
 * Elevates divine doctor treatments, acupuncture techniques, meridian clearing,
 * and poison purging into masterful, clinical yet poetic phrasing.
 */

const HEALING_RULES = [
  // Needling & acupoints
  { pattern: /(?:ngân châm phong huyệt|châm cứu phong huyệt)/gi, replacement: "đầu ngón tay thoăn thoắt hạ ngân châm chuẩn xác phong tỏa đại huyệt" },
  { pattern: /(?:khai thông kinh mạch|sơ thông kinh mạch)/gi, replacement: "khai thông từng đường kinh mạch bế tắc" },

  // Poison extraction & blood stabilization
  { pattern: /(?:ép ra chất độc|bức ra độc tố)/gi, replacement: "ép toàn bộ độc tố đen kịt ra ngoài qua đầu ngón tay" },
  { pattern: /khí huyết bình phục/gi, replacement: "khí huyết vốn đang nghịch loạn dần dần bình ổn trở lại" }
];

/**
 * Polishes meridian healing and acupuncture prose.
 * @param {string} text
 * @returns {string}
 */
function polishHealingProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of HEALING_RULES) {
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
  polishHealingProse,
  HEALING_RULES
};
