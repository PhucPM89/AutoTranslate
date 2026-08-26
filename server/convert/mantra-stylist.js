"use strict";

/**
 * Mantra & Hand-Seal Stylist.
 * Elevates hand-seal mudras, Daoist mantras, celestial incantations,
 * and divine decrees ("Word as Law") into majestic, mystic prose.
 */

const MANTRA_RULES = [
  // Hand-seals & incantations
  { pattern: /(?:bấm quyết niệm chú|bắt quyết niệm chú)(?!\s+biến ảo)/gi, replacement: "mười ngón tay thoăn thoắt bấm niệm pháp quyết biến ảo khôn lường" },
  { pattern: /(?:miệng tụng chân ngôn|miệng đọc chân ngôn)(?!\s+vang vọng)/gi, replacement: "miệng ngâm xướng đại đạo chân ngôn vang vọng đất trời" },
  { pattern: /(?:kết xuất thủ ấn|kết thủ ấn)(?!\s+thần tốc)/gi, replacement: "kết thủ ấn thần tốc triệu hoán sức mạnh thiên địa" },
  { pattern: /ngôn xuất pháp tùy(?!\s*,\s*lời nói)/gi, replacement: "ngôn xuất pháp tùy, lời nói ra tức là quy tắc của thiên địa" }
];

/**
 * Polishes mantra and hand-seal prose.
 * @param {string} text
 * @returns {string}
 */
function polishMantraProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of MANTRA_RULES) {
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
  polishMantraProse,
  MANTRA_RULES
};
