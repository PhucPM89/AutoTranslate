"use strict";

/**
 * Cosmic Chess & Fate Board Stylist.
 * Elevates metaphysical Go matches, cosmic chessboards, pawns of destiny,
 * and irreversible moves that decide the fate of worlds.
 */

const CHESS_RULES = [
  // Cosmic chessboards & mortal pawns
  { pattern: /(?:lấy trời đất làm cờ|lấy trời đất làm bàn cờ|coi trời đất là bàn cờ)(?!\s*,\s*coi vạn)/gi, replacement: "lấy trời đất làm bàn cờ, coi vạn vật chúng sinh tựa như những quân cờ" },
  { pattern: /chúng sinh làm quân cờ(?!\s+tự sinh)/gi, replacement: "coi vạn vật chúng sinh tựa như những quân cờ" },

  // Decisive moves & sacrifices
  { pattern: /(?:hạ cờ không hối hận|đặt con cờ không hối hận)(?!\s*,\s*một bước)/gi, replacement: "hạ cờ không hối hận, một bước đi định đoạt càn khôn" },
  { pattern: /(?:thắng bại đã phân|thắng thua đã chia)(?!\s*,\s*thế cờ)/gi, replacement: "thắng bại đã ngã ngũ, thế cờ đã định đoạt sinh tử" },
  { pattern: /bỏ xe giữ tướng(?!\s*,\s*bảo toàn)/gi, replacement: "chấp nhận bỏ xe giữ tướng, bảo toàn đại cục" }
];

/**
 * Polishes cosmic chess and strategy prose.
 * @param {string} text
 * @returns {string}
 */
function polishChessProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of CHESS_RULES) {
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
  polishChessProse,
  CHESS_RULES
};
