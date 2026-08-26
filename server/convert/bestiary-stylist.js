"use strict";

/**
 * Mythical Bestiary & Demonic Stylist.
 * Infuses demonic transformations, mythical beast roars, predatory glares,
 * and primordial bloodlines with raw power and visceral dread.
 */

const BESTIARY_RULES = [
  // Demonic auras & roars
  { pattern: /(?:yêu khí ngập trời|yêu khí ngút trời|yêu khí cuồn cuộn ngập trời)/gi, replacement: "yêu khí cuồn cuộn ngút trời" },
  { pattern: /(?:hung thú gầm thét|hung thú gầm rống)/gi, replacement: "hung thú gầm rống rung chuyển sơn hà" },
  { pattern: /tiếng yêu thú gào thét/gi, replacement: "tiếng yêu thú gào thét vang dội núi rừng" },

  // Predatory eyes & claws
  { pattern: /(?:đồng tử dựng thẳng|đồng tử dựng đứng)/gi, replacement: "đồng tử dựng đứng lóe lên hung quang dữ tợn" },
  { pattern: /(?:móng vuốt xé rách không gian|móng vuốt xé toạc không gian)/gi, replacement: "móng vuốt sắc lẹm xé toạc hư không" },

  // Primordial bloodlines
  { pattern: /huyết mạch áp chế/gi, replacement: "huyết mạch thượng cổ áp chế tuyệt đối" },
  { pattern: /khí tức viễn cổ/gi, replacement: "khí tức viễn cổ hồng hoang hùng hậu" }
];

/**
 * Polishes bestiary and demonic prose.
 * @param {string} text
 * @returns {string}
 */
function polishBestiaryProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of BESTIARY_RULES) {
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
  polishBestiaryProse,
  BESTIARY_RULES
};
