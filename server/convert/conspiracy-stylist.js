"use strict";

/**
 * Court Politics & Conspiracy Stylist.
 * Elevates palace intrigue, treason, insidious stratagems, ruthless power struggles,
 * and high treason punishments into cold, cutting, and authoritative prose.
 */

const CONSPIRACY_RULES = [
  // Palace undercurrents & treason
  { pattern: /sóng ngầm cuộn trào(?!\s+nơi thâm cung)/gi, replacement: "sóng ngầm cuộn trào nơi thâm cung nội viện" },
  { pattern: /(?:khi quân võng thượng|khi quân phạm thượng)(?!\s*,\s*tội đáng)/gi, replacement: "tội tày đình khi quân phạm thượng, muôn chết không tha" },
  { pattern: /tru di cửu tộc(?!\s*,\s*không tha)/gi, replacement: "tội đáng tru di cửu tộc" },

  // Ruthless schemes & betrayal
  { pattern: /dã tâm lang sói(?!\s+muôn phần)/gi, replacement: "dã tâm lang sói muôn phần hiểm độc khó lường" },
  { pattern: /mượn đao giết người(?!\s+không vấy)/gi, replacement: "mượn gió bẻ măng, mượn đao giết người không vấy một giọt máu" },
  { pattern: /(?:thỏ chết chó bị mổ|thỏ chết chó săn bị nấu)/gi, replacement: "chim hết bẻ cung, thỏ chết chó săn ắt bị làm thịt" }
];

/**
 * Polishes conspiracy and court politics prose.
 * @param {string} text
 * @returns {string}
 */
function polishConspiracyProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of CONSPIRACY_RULES) {
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
  polishConspiracyProse,
  CONSPIRACY_RULES
};
