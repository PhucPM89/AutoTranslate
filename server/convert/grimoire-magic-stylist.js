"use strict";

/**
 * Grimoire & Western Magic Stylist.
 * Elevates grand forbidden curses, ancient grimoires, surging mana oceans,
 * and solemn incantations of arcane runes into majestic fantasy prose.
 */

const GRIMOIRE_RULES = [
  // Forbidden curses & mana surges
  { pattern: /(?:ma pháp cấm chú|cấm chú)(?!\s+hủy thiên)/gi, replacement: "đại cấm chú ma pháp hủy thiên diệt địa" },
  { pattern: /(?:ma lực dâng trào|ma lực cuộn trào)(?!\s+như bão)/gi, replacement: "ma lực vô tận cuồn cuộn dâng trào như bão táp đại dương" },

  // Incantations & magic circles
  { pattern: /(?:ngâm xướng ma pháp|ngâm xướng chú ngữ)(?!\s+âm vang)/gi, replacement: "cất giọng ngâm xướng cổ ngữ ma pháp âm vang trang nghiêm" },
  { pattern: /ma pháp trận(?!\s+rực sáng)/gi, replacement: "ma pháp trận rực sáng những ký tự cổ ngữ thần bí" },
  { pattern: /(?:sách ma đạo|ma đạo thư)(?!\s+cổ xưa)/gi, replacement: "ma đạo thư cổ xưa lưu truyền ngàn năm" }
];

/**
 * Polishes grimoire and western magic prose.
 * @param {string} text
 * @returns {string}
 */
function polishGrimoireProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of GRIMOIRE_RULES) {
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
  polishGrimoireProse,
  GRIMOIRE_RULES
};
