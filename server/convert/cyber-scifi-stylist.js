"use strict";

/**
 * Cyberpunk, VR & Mecha Stylist.
 * Elevates neural interfaces, full-dive VR immersion, holographic projections,
 * cybernetic augmentations, and nuclear-powered mecha deployment into sleek sci-fi prose.
 */

const CYBER_RULES = [
  // Neural interfaces & virtual reality
  { pattern: /(?:giao diện não máy|cổng máy não)(?!\s+đồng bộ)/gi, replacement: "giao diện thần kinh não bộ đồng bộ 100%" },
  { pattern: /(?:lặn vào ảo|tiềm nhập ảo)(?!\s+toàn phần)/gi, replacement: "thâm nhập không gian thực tế ảo toàn phần" },

  // Holograms, mecha & cybernetics
  { pattern: /(?:hình chiếu toàn tức|hình chiếu đầy đủ)(?!\s+lập thể)/gi, replacement: "hình chiếu không gian ba chiều holographic lập thể hiện lên sắc nét" },
  { pattern: /(?:sạc điện cơ giáp|nạp điện cơ giáp)(?!\s+sẵn sàng)/gi, replacement: "cơ giáp chiến đấu nạp đầy năng lượng nguyên tử sẵn sàng xuất kích" },
  { pattern: /(?:cấy ghép nghĩa thể|lắp đặt nghĩa thể)(?!\s+công nghệ)/gi, replacement: "cấy ghép bộ phận cơ khí sinh học công nghệ cao" }
];

/**
 * Polishes cyberpunk, VR and mecha prose.
 * @param {string} text
 * @returns {string}
 */
function polishCyberProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of CYBER_RULES) {
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
  polishCyberProse,
  CYBER_RULES
};
