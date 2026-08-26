"use strict";

/**
 * Auction House & Bidding War Stylist.
 * Elevates treasure auctions, bidding wars, hammer drops, gasps of awe,
 * and astronomical valuations into suspenseful, dramatic prose.
 */

const AUCTION_RULES = [
  // Silence, shock & gasps
  { pattern: /(?:toàn trường yên tĩnh|toàn trường tĩnh lặng|cả trường im lặng)/gi, replacement: "toàn bộ hội trường im phăng phắc như tờ, không một tiếng động" },
  { pattern: /hít một ngụm khí lạnh/gi, replacement: "hít vào một hơi khí lạnh" },

  // Hammer strikes & bidding determination
  { pattern: /(?:một búa định giá|một búa gõ định|một búa định âm)/gi, replacement: "tiếng búa chốt giá dứt khoát vang lên giòn giã" },
  { pattern: /(?:thế tất phải có|thế tại tất đắc)/gi, replacement: "ánh mắt rực lửa quyết tâm đoạt bằng được" },

  // Prices & valuations
  { pattern: /mức giá trên trời\b/gi, replacement: "mức giá trên trời không tưởng" }
];

/**
 * Polishes auction house and bidding war prose.
 * @param {string} text
 * @returns {string}
 */
function polishAuctionProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of AUCTION_RULES) {
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
  polishAuctionProse,
  AUCTION_RULES
};
