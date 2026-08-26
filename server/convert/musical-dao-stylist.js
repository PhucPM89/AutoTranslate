"use strict";

/**
 * Musical Dao & Zither Stylist.
 * Elevates guqin performances, sonic acoustic attacks, melodious flute strains,
 * and soul-stirring musical Dao resonance into lyrical, poetic prose.
 */

const MUSICAL_RULES = [
  // Zither melodies & strings
  { pattern: /tiếng đàn lượn lờ(?!\s+giữa không)/gi, replacement: "tiếng đàn thánh thót du dương lượn lờ giữa không trung" },
  { pattern: /(?:gảy dây đàn|gảy động dây đàn)(?!\s+từng cung)/gi, replacement: "mười ngón tay ngọc nhẹ nhàng gảy từng cung bậc réo rắt" },
  { pattern: /cao sơn lưu thủy(?!\s+tri âm)/gi, replacement: "khúc nhạc Cao Sơn Lưu Thủy tri âm tri kỷ thấu tận tâm can" },

  // Sonic attacks & song endings
  { pattern: /âm ba giết địch(?!\s+hóa thành)/gi, replacement: "từng đợt sóng âm sắc lẹm hóa thành thiên quân vạn mã trảm sát kẻ thù" },
  { pattern: /(?:khúc đàn kết thúc người tản đi|bài hát hết người tan)/gi, replacement: "khúc nhạc dứt, tiếng đàn ngưng, người cũng dần tản mác như bọt nước" }
];

/**
 * Polishes musical Dao and zither prose.
 * @param {string} text
 * @returns {string}
 */
function polishMusicalProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of MUSICAL_RULES) {
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
  polishMusicalProse,
  MUSICAL_RULES
};
