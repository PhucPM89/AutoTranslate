"use strict";

/**
 * Karma, Reincarnation & Destiny Stylist.
 * Elevates karmic entanglements, destined rivalries, past-life awakenings,
 * and the severing of reincarnation cycles into profound, mythical prose.
 */

const KARMA_RULES = [
  // Karmic threads & severing
  { pattern: /(?:nhân quả quấn quanh|nhân quả quấn thân)(?!\s+số phận)/gi, replacement: "sợi tơ nhân quả chằng chịt quấn quanh số phận" },
  { pattern: /chém đứt nhân quả(?!\s+nghiệp duyên)/gi, replacement: "vung kiếm chém đứt mọi sợi tơ nhân quả nghiệp duyên" },

  // Reincarnation & past-life memory
  { pattern: /(?:chín kiếp luân hồi|cửu thế luân hồi)(?!\s+chìm nổi)/gi, replacement: "trải qua chín kiếp luân hồi chìm nổi trong bể khổ" },
  { pattern: /(?:túc huệ thức tỉnh|ký ức kiếp trước thức tỉnh)(?!\s+từ thời)/gi, replacement: "ký ức tiền kiếp từ thời hồng hoang ầm ầm thức tỉnh" },
  { pattern: /(?:trận đấu định mệnh|quyết đấu số mệnh)(?!\s+đã được)/gi, replacement: "trận quyết đấu định mệnh đã được an bài từ ngàn năm trước" }
];

/**
 * Polishes karma and destiny prose.
 * @param {string} text
 * @returns {string}
 */
function polishKarmaProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of KARMA_RULES) {
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
  polishKarmaProse,
  KARMA_RULES
};
