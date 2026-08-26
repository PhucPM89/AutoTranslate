"use strict";

/**
 * Title & Peerage Hierarchy Modulator.
 * Enforces historical, courtly, and sect hierarchy titles and honorifics,
 * ensuring proper capitalization and correct courtly self-designations.
 */

const TITLE_RULES = [
  // Imperial self-designations & court greetings
  { pattern: /\b(ai gia)\b/gi, replacement: "Ai gia" },
  { pattern: /\b(bổn cung)\b/gi, replacement: "Bổn cung" },
  { pattern: /\b(vi thần)\b/gi, replacement: "Vi thần" },
  { pattern: /\b(mạt tướng)\b/gi, replacement: "Mạt tướng" },
  { pattern: /khởi bẩm (thánh thượng|hoàng thượng|bệ hạ)/gi, replacement: "Khởi bẩm $1" },
  { pattern: /tạ chủ long ân/gi, replacement: "Tạ Chủ long ân" },

  // Religious & sect honorifics
  { pattern: /\b(lão nạp)\b/gi, replacement: "Lão nạp" },
  { pattern: /\b(bần tăng)\b/gi, replacement: "Bần tăng" },
  { pattern: /\b(bần đạo)\b/gi, replacement: "Bần đạo" },
  { pattern: /\bchưởng môn sư huynh\b/gi, replacement: "Chưởng môn sư huynh" },
  { pattern: /\bchưởng môn sư đệ\b/gi, replacement: "Chưởng môn sư đệ" },
  { pattern: /\bthái thượng trưởng lão\b/gi, replacement: "Thái Thượng Trưởng lão" },
  { pattern: /\bthái thượng lão tổ\b/gi, replacement: "Thái Thượng Lão tổ" },
  { pattern: /\bchưởng giáo chí tôn\b/gi, replacement: "Chưởng giáo Chí tôn" }
];

/**
 * Normalizes title and peerage hierarchy terms.
 * @param {string} text
 * @returns {string}
 */
function normalizeTitleHierarchy(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of TITLE_RULES) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result;
}

module.exports = {
  normalizeTitleHierarchy,
  TITLE_RULES
};
