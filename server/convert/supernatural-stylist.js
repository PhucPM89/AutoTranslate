"use strict";

/**
 * Supernatural & Taoist Exorcism Stylist.
 * Elevates folklore ghost stories, red-clothed specters, Taoist wooden swords,
 * ghost weddings (Minghun), corpse mutations (Jiangshi), and Yin-soldier processions.
 */

const SUPERNATURAL_RULES = [
  // Red-clothed ghosts & Yin-Yang sight
  { pattern: /(?:lệ quỷ áo đỏ|quỷ áo đỏ)(?!\s+oán khí)/gi, replacement: "lệ quỷ áo đỏ oán khí ngút trời, sát khí nồng nặc rợn tóc gáy" },
  { pattern: /(?:mắt âm dương|âm dương nhãn)(?!\s+bẩm sinh)/gi, replacement: "đôi mắt âm dương bẩm sinh có thể nhìn thấu âm hồn quỷ khí" },

  // Taoist artifacts & warding
  { pattern: /(?:kiếm gỗ đào|bát quái kính)(?!\s+ngàn năm|\s+cùng)/gi, replacement: "kiếm gỗ đào ngàn năm cùng gương Bát Quái trấn áp tà ma" },
  { pattern: /(?:máu chó mực|bột chu sa)(?!\s+cùng|\s+xua tan)/gi, replacement: "máu chó mực cùng bột chu sa xua tan chướng khí tà uế" },

  // Ghost brides, Jiangshi & underworld messengers
  { pattern: /(?:đoàn rước dâu minh hôn|minh hôn|đám cưới ma)(?!\s+quỷ dị)/gi, replacement: "đoàn rước dâu minh hôn quỷ dị, hình nhân thế mạng nở nụ cười rùng rợn trong sương đêm" },
  { pattern: /(?:âm binh mượn đường|hắc bạch vô thường)(?!\s+giữa đêm)/gi, replacement: "đoàn âm binh mượn đường giữa đêm khuya thanh vắng, câu hồn đoạt phách chốn dương gian" },
  { pattern: /(?:thi thể thi biến|thi biến thành cương thi|thi biến)(?!\s+hóa thành)/gi, replacement: "thi thể đột ngột thi biến hóa thành cương thi khát máu bật dậy khỏi quan tài" }
];

/**
 * Polishes supernatural and exorcism prose.
 * @param {string} text
 * @returns {string}
 */
function polishSupernaturalProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of SUPERNATURAL_RULES) {
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
  polishSupernaturalProse,
  SUPERNATURAL_RULES
};
