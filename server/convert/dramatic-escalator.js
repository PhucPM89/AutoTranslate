"use strict";

/**
 * Dramatic Climax & Pathos Escalator.
 * Intensifies dramatic climaxes, tragic moments, and epic vengeance vows,
 * giving prose the emotional gravity and soaring solemnity of high literature.
 */

const DRAMATIC_RULES = [
  // Vengeance & life-and-death vows
  { pattern: /mối huyết hải thâm thù(?!\s+không đội trời chung)/gi, replacement: "mối huyết hải thâm thù không đội trời chung" },
  { pattern: /quyết tử chiến đến cùng/gi, replacement: "quyết tử chiến đến giọt máu cuối cùng" },
  { pattern: /không chết không thôi/gi, replacement: "bất tử bất hưu, thề không dừng lại" },
  { pattern: /liều mạng cùng đối phương chết chung/gi, replacement: "quyết liều chết kéo theo kẻ thù chôn cùng" },

  // Tragedy, grief & despair
  { pattern: /nước mắt tuôn rơi như mưa/gi, replacement: "lệ rơi như mưa, đau đớn xé lòng" },
  { pattern: /đau lòng đến cực điểm/gi, replacement: "đau đớn đến thắt ruột thắt gan" },
  { pattern: /lòng tràn đầy tuyệt vọng/gi, replacement: "trong lòng ngập tràn tuyệt vọng khôn cùng" },
  { pattern: /tâm như tro tàn/gi, replacement: "lòng nguội lạnh tựa tro tàn" },

  // Destruction & cataclysm
  { pattern: /tông môn bị diệt/gi, replacement: "tông môn bị hủy diệt, máu chảy thành sông" },
  { pattern: /máu chảy thành sông, thây chất đầy đồng/gi, replacement: "máu chảy thành sông, thây chất ngập tràn đồng hoang" }
];

/**
 * Escalates dramatic gravity and pathos in climactic narrative passages.
 * @param {string} text
 * @returns {string}
 */
function escalateDramaticProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of DRAMATIC_RULES) {
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
  escalateDramaticProse,
  DRAMATIC_RULES
};
