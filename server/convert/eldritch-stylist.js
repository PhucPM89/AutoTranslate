"use strict";

/**
 * Eldritch & Cthulhu Horror Stylist.
 * Elevates unspeakable horrors, cosmic insanity, mad whispers from the void,
 * grotesque corruptions, and sanity collapse into dark, chilling, atmospheric prose.
 */

const ELDRITCH_RULES = [
  // Unspeakable horrors & void whispers
  { pattern: /bất khả danh trạng(?!\s*,\s*quái dị)/gi, replacement: "bất khả danh trạng, quái dị vượt xa tầm hiểu biết của nhân loại" },
  { pattern: /(?:tiếng lẩm bẩm điên cuồng|lời nói mộng mị|lời lẩm bẩm điên cuồng)(?!\s+tà ác)/gi, replacement: "những lời thì thầm điên loạn tà ác vang vọng từ cõi vô tận" },

  // Sanity loss & demonic corruption
  { pattern: /(?:lý trí sụp đổ|tinh thần sụp đổ)(?!\s*,\s*hoàn toàn)/gi, replacement: "tâm trí điên cuồng sụp đổ, hoàn toàn mất đi nhân tính" },
  { pattern: /(?:ô nhiễm biến dạng|ô nhiễm biến dị)(?!\s+méo mó)/gi, replacement: "bị tà năng ăn mòn làm biến dị méo mó kinh tởm" },
  { pattern: /nhìn thẳng vào thần linh(?!\s+đầy rẫy)/gi, replacement: "liều lĩnh nhìn thẳng vào thần minh cổ xưa đầy rẫy sự ô uế" }
];

/**
 * Polishes eldritch and cosmic horror prose.
 * @param {string} text
 * @returns {string}
 */
function polishEldritchProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of ELDRITCH_RULES) {
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
  polishEldritchProse,
  ELDRITCH_RULES
};
