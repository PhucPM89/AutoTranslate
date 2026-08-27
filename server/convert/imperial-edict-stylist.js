"use strict";

/**
 * Imperial Decrees & Royal Proclamations Stylist.
 * Elevates imperial edicts, courtly decrees, diplomatic envoys presenting state letters,
 * and thunderous kowtows of gratitude before the Dragon Throne.
 */

const IMPERIAL_RULES = [
  // Edicts & proclamations
  { pattern: /(?:phụng thiên thừa vận hoàng đế chiếu viết|phụng thiên thừa vận)(?!\s*,\s*hoàng đế)/gi, replacement: "Phụng thiên thừa vận, Hoàng đế chiếu viết" },
  { pattern: /khâm thử(?!\s*!)/gi, replacement: "Khâm thử!" },

  // Gratitude & court salutations
  { pattern: /(?:lãnh chỉ tạ ân|tiếp chỉ tạ ân)(?!\s*,\s*khấu đầu)/gi, replacement: "khâm tuân thánh chỉ, khấu đầu tạ ơn long ân hạo đãng" },
  { pattern: /(?:vạn tuế vạn vạn tuế|vạn tuế vạn tuế vạn vạn tuế)(?!\s+vang dội)/gi, replacement: "tiếng hô vạn tuế, vạn tuế, vạn vạn tuế vang dội khắp cung điện" },
  { pattern: /(?:đệ trình quốc thư|dâng lên quốc thư)(?!\s+giao hảo)/gi, replacement: "sứ thần các nước cung kính đệ trình quốc thư giao hảo" }
];

/**
 * Polishes imperial decree and court proclamation prose.
 * @param {string} text
 * @returns {string}
 */
function polishImperialProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of IMPERIAL_RULES) {
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
  polishImperialProse,
  IMPERIAL_RULES
};
