"use strict";

/**
 * Ancient Inscriptions & Jade Slip Stylist.
 * Enhances the deciphering of ancient jade slips, weathered stone steles,
 * glowing primordial runes, and soul-imprinted legacy inheritances.
 */

const INSCRIPT_RULES = [
  // Jade slips & ancient scrolls
  { pattern: /ngọc giản ghi lại/gi, replacement: "bên trong ngọc giản cổ xưa lưu lại thông tin ngàn năm" },
  { pattern: /cổ tịch ghi chép/gi, replacement: "cổ tịch ố vàng ngàn năm ghi chép" },

  // Stone steles & inscriptions
  { pattern: /(?:chữ trên bia đá|nét chữ trên bia đá)/gi, replacement: "những nét chữ rồng bay phượng múa cứng cáp khắc sâu trên bia đá cổ" },
  { pattern: /(?:phù văn lập lòe|phù văn lóe sáng)/gi, replacement: "phù văn cổ xưa lập lòe phát ra vầng sáng kỳ bí" },

  // Soul inheritances
  { pattern: /(?:lạc ấn truyền thừa|truyền thừa lạc ấn)/gi, replacement: "lạc ấn truyền thừa khắc sâu vào tận linh hồn" }
];

/**
 * Polishes inscriptions and jade slip prose.
 * @param {string} text
 * @returns {string}
 */
function polishInscriptProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of INSCRIPT_RULES) {
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
  polishInscriptProse,
  INSCRIPT_RULES
};
