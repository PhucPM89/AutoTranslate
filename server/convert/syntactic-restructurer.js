"use strict";

/**
 * Syntactic Restructurer.
 * Eliminates inverted, stiff Sino-Vietnamese sentence structures,
 * re-ordering prepositional, temporal, and conditional clauses into
 * natural, fluent Vietnamese prose.
 */

const SYNTACTIC_RULES = [
  // Gaze & observer clauses
  { pattern: /tại trong ánh mắt ([^,.;!?]+?) của/gi, replacement: "dưới ánh mắt $1 của" },
  { pattern: /tại trong ánh mắt của/gi, replacement: "dưới ánh mắt của" },
  { pattern: /tại dưới ánh mắt của/gi, replacement: "dưới ánh mắt của" },

  // Temporal preposition cleanup
  { pattern: /tại\s+(\d+|mấy|vài|nửa|một)\s+(ngày|tháng|năm|giờ|khắc|canh giờ)\s+sau đó/gi, replacement: "$1 $2 sau" },
  { pattern: /tại trước khi\s+/gi, replacement: "trước khi " },
  { pattern: /tại sau khi\s+/gi, replacement: "sau khi " },
  { pattern: /tại lúc này/gi, replacement: "lúc này" },
  { pattern: /tại một khắc này/gi, replacement: "ngay trong khoảnh khắc này" },
  { pattern: /tại trong nháy mắt/gi, replacement: "trong nháy mắt" },

  // Causality & progression
  { pattern: /bởi vì\s+([^,.;!?]+?)\s+duyên cớ/gi, replacement: "do $1" },
  { pattern: /bởi vì\s+([^,.;!?]+?)\s+nguyên nhân/gi, replacement: "do $1" },
  { pattern: /theo lấy thời gian trôi qua/gi, replacement: "thời gian dần trôi qua" },
  { pattern: /theo lấy\s+([^,.;!?]+?)\s+xuất hiện/gi, replacement: "cùng với sự xuất hiện của $1" },
  { pattern: /theo lấy\s+([^,.;!?]+?)\s+biến hóa/gi, replacement: "theo sự biến hóa của $1" },
  { pattern: /theo lấy\s+([^,.;!?]+?)\s+tăng lên/gi, replacement: "theo sự gia tăng của $1" },

  // Scene & demonstrative phrases
  { pattern: /nhìn thấy một màn này/gi, replacement: "nhìn thấy cảnh tượng này" },
  { pattern: /thấy một màn như vậy/gi, replacement: "thấy cảnh tượng như vậy" },
  { pattern: /một màn trước mắt/gi, replacement: "cảnh tượng trước mắt" },
  { pattern: /nghĩ tới chỗ này/gi, replacement: "nghĩ đến đây" },
  { pattern: /nghĩ tới đây/gi, replacement: "nghĩ đến đây" },
  { pattern: /dưới loại tình huống này/gi, replacement: "trong tình huống này" },
  { pattern: /dưới loại tình huống đó/gi, replacement: "trong tình huống đó" },
  { pattern: /nói cho cùng/gi, replacement: "xét cho cùng" }
];

/**
 * Restructures inverted and stiff syntax in Vietnamese translation.
 * @param {string} text
 * @returns {string}
 */
function restructureSyntax(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of SYNTACTIC_RULES) {
    result = result.replace(rule.pattern, (match, ...args) => {
      let rep = rule.replacement;
      // Interpolate capture groups
      for (let i = 0; i < args.length - 2; i++) {
        rep = rep.replace(new RegExp(`\\$${i + 1}`, "g"), args[i]);
      }
      // If original match was capitalized, capitalize replacement
      if (/^[A-ZÀ-Ỹ]/.test(match)) {
        rep = rep.charAt(0).toUpperCase() + rep.slice(1);
      }
      return rep;
    });
  }
  return result;
}

module.exports = {
  restructureSyntax,
  SYNTACTIC_RULES
};
