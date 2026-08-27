"use strict";

/**
 * Beast Taming & Familiar Contract Stylist.
 * Elevates soul pacts, equal symbiote bonds, master-servant enslavements,
 * and mythical beast evolutions into epic, awe-inspiring prose.
 */

const BEAST_RULES = [
  // Contract arrays & soul bonds
  { pattern: /(?:trận pháp khế ước|khế ước pháp trận)(?!\s+linh hồn)/gi, replacement: "trận pháp khế ước linh hồn rực sáng hào quang rực rỡ" },
  { pattern: /khế ước bình đẳng(?!\s+cộng sinh)/gi, replacement: "lạc ấn khế ước bình đẳng cộng sinh khắc sâu vào thức hải" },
  { pattern: /(?:khế ước chủ tớ|khế ước chủ nô)(?!\s+tuyệt đối)/gi, replacement: "khế ước chủ nô tuyệt đối trói buộc linh hồn" },

  // Beast evolution & rank breakthroughs
  { pattern: /(?:bản mệnh linh thú tiến hóa|thú cưng tiến giai|linh thú tiến giai)(?!\s+lên đẳng cấp)/gi, replacement: "bản mệnh linh thú bứt phá tiến hóa lên đẳng cấp thần thoại" }
];

/**
 * Polishes beast taming and familiar contract prose.
 * @param {string} text
 * @returns {string}
 */
function polishBeastContractProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of BEAST_RULES) {
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
  polishBeastContractProse,
  BEAST_RULES
};
