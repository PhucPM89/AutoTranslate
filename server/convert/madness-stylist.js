"use strict";

/**
 * Heart-Demon, Madness & Bloodlust Stylist.
 * Elevates heart demon corruption, bloodthirsty frenzy, qi deviation,
 * and irreversible descent into demonic madness with visceral, terrifying prose.
 */

const MADNESS_RULES = [
  // Qi deviation & eye madness
  { pattern: /tẩu hỏa nhập ma(?!\s*,\s*kinh mạch)/gi, replacement: "tẩu hỏa nhập ma, kinh mạch nghịch chuyển hỗn loạn" },
  { pattern: /(?:hai mắt đỏ ngầu|hai mắt đỏ bừng)(?!\s+rực lửa)/gi, replacement: "đôi mắt đỏ ngầu rực lửa hằn lên từng tia máu điên dại" },

  // Bloodlust & demonic abyss
  { pattern: /(?:sát ý ngập trời|sát ý ngút trời)(?!\s+cuồng bạo)/gi, replacement: "sát ý ngút trời cuồng bạo tựa sóng thần giận dữ" },
  { pattern: /vạn kiếp bất phục(?!\s*,\s*muôn đời)/gi, replacement: "vạn kiếp bất phục, muôn đời không thể quay đầu" },
  { pattern: /(?:khát máu điên cuồng|điên cuồng khát máu)/gi, replacement: "khát máu cuồng loạn đến mất hết lý trí" }
];

/**
 * Polishes heart-demon and madness prose.
 * @param {string} text
 * @returns {string}
 */
function polishMadnessProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of MADNESS_RULES) {
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
  polishMadnessProse,
  MADNESS_RULES
};
