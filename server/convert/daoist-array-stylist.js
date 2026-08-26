"use strict";

/**
 * Daoist Array & Talismanic Stylist.
 * Enhances Daoist formations, talisman invocations, trigrams, and celestial arrays
 * with authentic mystical and arcane phrasing.
 */

const ARRAY_RULES = [
  // Array nodes and mechanics
  { pattern: /(?:mắt trận|trận nhãn cốt lõi của trận pháp)/gi, replacement: "trận nhãn cốt lõi" },
  { pattern: /đảo lộn càn khôn/gi, replacement: "đảo lộn Càn Khôn, xoay chuyển đất trời" },
  { pattern: /khởi động đại trận/gi, replacement: "đại trận ầm ầm kích hoạt" },
  { pattern: /phá vỡ đại trận/gi, replacement: "phá toang đại trận" },

  // Talisman burning & activations
  { pattern: /bùa chú tự bốc cháy/gi, replacement: "bùa chú tự bốc cháy thành tro bụi" },
  { pattern: /phù lục bốc cháy/gi, replacement: "phù lục tự bốc cháy thành tro bụi" },
  { pattern: /phù văn lưu chuyển/gi, replacement: "phù văn huyền ảo lưu chuyển không ngừng" },

  // Trigrams and gates
  { pattern: /bát quái lưu chuyển/gi, replacement: "Bát Quái xoay vần biến ảo khôn lường" },
  { pattern: /kiếm trận bao phủ/gi, replacement: "kiếm trận bao trùm cả thiên địa" }
];

/**
 * Polishes Daoist array and talismanic prose.
 * @param {string} text
 * @returns {string}
 */
function polishDaoistArrayProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of ARRAY_RULES) {
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
  polishDaoistArrayProse,
  ARRAY_RULES
};
