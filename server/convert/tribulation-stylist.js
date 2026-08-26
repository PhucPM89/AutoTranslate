"use strict";

/**
 * Tribulation & Breakthrough Stylist.
 * Enhances heavenly tribulations, realm breakthrough phenomena, celestial lightning,
 * and cosmic resonance into awe-inspiring epic prose.
 */

const TRIBULATION_RULES = [
  // Tribulation clouds & lightning
  { pattern: /(?:mây kiếp cuồn cuộn|kiếp vân cuồn cuộn)/gi, replacement: "mây kiếp đen kịt cuồn cuộn giăng kín vòm trời" },
  { pattern: /tử tiêu thần lôi/gi, replacement: "Tử Tiêu Thần Lôi xé toạc tầng mây ầm ầm giáng xuống" },
  { pattern: /thiên kiếp giáng lâm/gi, replacement: "thiên kiếp kinh hoàng ầm ầm giáng lâm" },
  { pattern: /cửu cửu thiên kiếp/gi, replacement: "Cửu Cửu Thiên Kiếp hủy diệt thế gian" },

  // Cosmic phenomena & Dao resonance
  { pattern: /thiên địa dị tượng/gi, replacement: "thiên địa dị tượng chấn động cả bát hoang" },
  { pattern: /(?:vạn đạo ráng mây|ráng mây vạn đạo|hà quang vạn đạo)/gi, replacement: "vạn trượng ráng mây hào quang rực rỡ chiếu rọi cửu thiên" },
  { pattern: /(?:đạo âm lượn lờ|đạo âm ngân vang)/gi, replacement: "tiếng đạo âm ngân vang vang vọng giữa đất trời" },

  // Breakthroughs & mental demons
  { pattern: /đột phá bình cảnh/gi, replacement: "phá toang bình cảnh gông cùm xiềng xích" },
  { pattern: /tâm ma xâm thực/gi, replacement: "tâm ma xâm thực làm dao động đạo tâm" }
];

/**
 * Polishes tribulation and breakthrough prose.
 * @param {string} text
 * @returns {string}
 */
function polishTribulationProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of TRIBULATION_RULES) {
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
  polishTribulationProse,
  TRIBULATION_RULES
};
