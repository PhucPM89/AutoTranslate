"use strict";

/**
 * Divine Sense & Soul Force Stylist.
 * Elevates psychic scans, soul pressure, divine sense collisions,
 * consciousness seas, and absolute domain expansions.
 */

const DIVINE_SENSE_RULES = [
  // Divine sense scans & projections
  { pattern: /(?:thần thức quét qua|thần niệm quét qua)/gi, replacement: "thần thức mênh mông như thủy triều cuồn cuộn quét qua" },
  { pattern: /thần niệm như triều/gi, replacement: "thần niệm cuồn cuộn như sóng triều gầm thét" },

  // Soul pressure & consciousness sea
  { pattern: /uy áp giáng lâm/gi, replacement: "uy áp kinh thiên động địa ầm ầm giáng xuống đè nặng không gian" },
  { pattern: /(?:thức hải chấn động|biển ý thức rung động)/gi, replacement: "thức hải dậy sóng dữ dội chấn động kịch liệt" },
  { pattern: /linh hồn đau đớn/gi, replacement: "linh hồn đau đớn như bị xé toạc làm muôn mảnh" },

  // Domains & soul destruction
  { pattern: /(?:lĩnh vực triển khai|mở ra lĩnh vực)/gi, replacement: "lĩnh vực tuyệt đối ầm ầm mở rộng bao trùm vạn dặm" }
];

/**
 * Polishes divine sense and soul force prose.
 * @param {string} text
 * @returns {string}
 */
function polishDivineSenseProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of DIVINE_SENSE_RULES) {
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
  polishDivineSenseProse,
  DIVINE_SENSE_RULES
};
