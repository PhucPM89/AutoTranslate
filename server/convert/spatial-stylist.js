"use strict";

/**
 * Spatiotemporal & Void Stylist.
 * Elevates spatial tears, void collapses, cosmic turbulence, dimension gates,
 * and reality-shattering ascensions into awe-inspiring cosmic prose.
 */

const SPATIAL_RULES = [
  // Spatial tears & void collapses
  { pattern: /không gian xé rách(?!\s+phát ra)/gi, replacement: "khe nứt không gian xé toạc chân trời phát ra tiếng rít chói tai" },
  { pattern: /hư không sụp đổ(?!\s+thành từng)/gi, replacement: "hư không xung quanh sụp đổ vỡ vụn thành từng mảng lớn" },

  // Void turbulence & dimensional gateways
  { pattern: /dòng loạn lưu không gian(?!\s+cuồng bạo)/gi, replacement: "dòng loạn lưu không gian cuồng bạo cuốn phăng mọi thứ thành tro bụi" },
  { pattern: /phá toái hư không(?!\s*,\s*đạp không)/gi, replacement: "phá toái hư không, đạp không mà đi" },
  { pattern: /(?:mở ra bí cảnh|bí cảnh mở ra)(?!\s+thượng cổ)/gi, replacement: "cửa ngõ bí cảnh thượng cổ ầm ầm khai mở" }
];

/**
 * Polishes spatial and void prose.
 * @param {string} text
 * @returns {string}
 */
function polishSpatialProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of SPATIAL_RULES) {
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
  polishSpatialProse,
  SPATIAL_RULES
};
