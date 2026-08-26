"use strict";

/**
 * Satirical & Sarcastic Banter Adapter.
 * Sharpens dialogue sarcasm, trash-talking, witty retorts, and comedic banter
 * to sound natural, punchy, and authentically expressive in Vietnamese.
 */

const BANTER_RULES = [
  // Trash talk & arrogance retorts
  { pattern: /ngươi (?:đây )?là đang (?:cùng ta )?nói đùa sao\?/gi, replacement: "ngươi đang kể chuyện cười cho ta nghe đấy à?" },
  { pattern: /cho mặt mà không (?:cần|muốn) mặt/gi, replacement: "rượu mời không uống lại muốn uống rượu phạt" },
  { pattern: /ngươi tính là cái thứ gì/gi, replacement: "ngươi là cái thá gì chứ" },
  { pattern: /ngươi tính là cái thá gì/gi, replacement: "ngươi là cái thá gì chứ" },
  { pattern: /ngươi đây là tự tìm cái chết/gi, replacement: "ngươi đúng là chán sống rồi" },
  { pattern: /ngươi đây là tự tìm đường chết/gi, replacement: "ngươi đúng là chán sống rồi" },

  // Facial thickness & shamelessness
  { pattern: /da mặt của ngươi (?:thật|cũng thật) dày/gi, replacement: "da mặt ngươi cũng dày bằng tường thành đấy nhỉ" },
  { pattern: /da mặt cũng thật là dày/gi, replacement: "da mặt cũng dày thật đấy" },

  // Metaphors & mocking
  { pattern: /con cóc (?:mà )?đòi ăn thịt thiên nga/gi, replacement: "cóc ghẻ mà đòi ăn thịt thiên nga" },
  { pattern: /ngươi còn (?:non và xanh|quá non và xanh) lắm/gi, replacement: "ngươi còn non nớt lắm" }
];

/**
 * Adapts dialogue banter and sarcastic expressions.
 * @param {string} text
 * @returns {string}
 */
function adaptSatiricalBanter(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of BANTER_RULES) {
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
  adaptSatiricalBanter,
  BANTER_RULES
};
