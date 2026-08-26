"use strict";

/**
 * Urban & Internet Slang Localizer.
 * Adapts contemporary Chinese internet memes, modern slang, and gaming/urban
 * terminology into punchy, natural, and trendy Vietnamese.
 */

const URBAN_SLANG_RULES = [
  // Life attitudes & modern social phenomena
  { pattern: /(?:thảng bình|nằm phẳng)/gi, replacement: "buông xuôi mặc kệ đời" },
  { pattern: /nội quyển/gi, replacement: "cạnh tranh khốc liệt" },
  { pattern: /phàm nhĩ tái/gi, replacement: "khoe mẽ ngầm" },
  { pattern: /đái tiết tấu/gi, replacement: "dắt mũi dư luận" },
  { pattern: /(?:xã tử|xã hội tính tử vong)/gi, replacement: "mất mặt trước đám đông" },

  // Gaming, hacking & sci-fi tropes
  { pattern: /(?:khai quải|mở quải)/gi, replacement: "bật hack" },
  { pattern: /khắc kim/gi, replacement: "nạp tiền cày game" },
  { pattern: /hắc khoa kỹ/gi, replacement: "siêu công nghệ hắc ám" },

  // Face slapping & pretentiousness
  { pattern: /trang bức/gi, replacement: "làm màu ra vẻ" },
  { pattern: /trang x\b/gi, replacement: "làm màu ra vẻ" },
  { pattern: /đánh mặt/gi, replacement: "vả mặt bôm bốp" },
  { pattern: /vả mặt thật đau/gi, replacement: "vả mặt đau điếng" }
];

/**
 * Adapts urban slang and internet memes.
 * @param {string} text
 * @returns {string}
 */
function adaptUrbanSlang(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of URBAN_SLANG_RULES) {
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
  adaptUrbanSlang,
  URBAN_SLANG_RULES
};
