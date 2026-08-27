"use strict";

/**
 * Necropolis, Ancient Tombs & Corpse Stylist.
 * Elevates tomb raiding expeditions, thousand-year coffins, noxious corpse miasma,
 * intricate lethal traps, and primordial guardian beasts into chilling, atmospheric prose.
 */

const NECROPOLIS_RULES = [
  // Tombs & coffins
  { pattern: /(?:bên trong cổ mộ|trong cổ mộ)(?!\s+âm u)/gi, replacement: "bên trong cổ mộ âm u ngập tràn tử khí lạnh lẽo" },
  { pattern: /(?:cỗ quan quách|quan quách ngàn năm)(?!\s+ngàn năm)/gi, replacement: "cỗ quan quách ngàn năm tỏa ra hàn khí lạnh thấu xương" },

  // Miasma & traps
  { pattern: /(?:tử khí và thi khí|thi khí nồng nặc)(?!\s+độc hại)/gi, replacement: "tử khí và thi khí độc hại nồng nặc đến nghẹt thở" },
  { pattern: /(?:cơ quan ám khí|cơ quan cạm bẫy)(?!\s+trùng trùng)/gi, replacement: "cơ quan cạm bẫy trùng trùng điệp điệp kích hoạt ám khí sắc lẹm" },
  { pattern: /(?:thú hộ lăng|thú giữ mộ)(?!\s+thượng cổ)/gi, replacement: "thú hộ lăng thượng cổ gầm gừ phát ra uy áp rợn tóc gáy" }
];

/**
 * Polishes necropolis and tomb-raiding prose.
 * @param {string} text
 * @returns {string}
 */
function polishNecropolisProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of NECROPOLIS_RULES) {
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
  polishNecropolisProse,
  NECROPOLIS_RULES
};
