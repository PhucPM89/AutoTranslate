"use strict";

/**
 * Apocalypse & Genetic Mutant Stylist.
 * Elevates doomsday wastelands, surging zombie tides, genetic limit unlocking,
 * energy mutant crystals, and elemental power awakenings into intense survival prose.
 */

const APOCALYPSE_RULES = [
  // Zombie hordes & wastelands
  { pattern: /(?:làn sóng tang thi|tang thi cuồng triều)(?!\s+khát máu)/gi, replacement: "thủy triều tang thi khát máu ầm ầm càn quét như ngày tận thế" },
  { pattern: /(?:vùng đất hoang tận thế|mạt nhật phế thổ)(?!\s+của thời)/gi, replacement: "vùng đất hoang tàn đổ nát của thời kỳ mạt thế" },

  // Genetic locks, mutant cores & awakenings
  { pattern: /khóa gen(?!\s+di truyền)/gi, replacement: "phá vỡ gông cùm xiềng xích của khóa gen di truyền" },
  { pattern: /tinh hạch(?!\s+năng lượng)/gi, replacement: "tinh hạch năng lượng lấp lánh bên trong đầu dị thú" },
  { pattern: /(?:dị năng thức tỉnh|thức tỉnh dị năng)(?!\s+sức mạnh)/gi, replacement: "dị năng nguyên tố bùng nổ thức tỉnh sức mạnh kinh thiên" }
];

/**
 * Polishes apocalypse and survival prose.
 * @param {string} text
 * @returns {string}
 */
function polishApocalypseProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of APOCALYPSE_RULES) {
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
  polishApocalypseProse,
  APOCALYPSE_RULES
};
