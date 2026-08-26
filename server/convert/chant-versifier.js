"use strict";

/**
 * Poetry & Cultivation Chant Versifier.
 * Localizes ancient couplets, battle chants, and martial poetry into
 * rhythmic, soaring, and poetically metered Vietnamese verse.
 */

const CLASSICAL_CHANTS = [
  // Famous hero declarations & couplets
  {
    pattern: /Trời không sinh ta ([^,.;!?\n]+?),? [Kk]iếm đạo vạn cổ như (?:đêm dài|trường dạ)/gi,
    replacement: "Trời không sinh ta $1, Kiếm đạo muôn đời tựa đêm trường."
  },
  {
    pattern: /天不生我([^,.;!?\n]+?)，?剑道万古如长夜/g,
    replacement: "Trời không sinh ta $1, Kiếm đạo muôn đời tựa đêm trường."
  },
  {
    pattern: /Giấc mộng lớn ai (?:người )?tỉnh trước,? [Cc]uộc đời này (?:ta tự biết|chỉ có ta hay)/gi,
    replacement: "Giấc mộng lớn ai người tỉnh trước? Cuộc đời này chỉ có ta hay."
  },
  {
    pattern: /大梦谁先觉，?平生我自知/g,
    replacement: "Giấc mộng lớn ai người tỉnh trước? Cuộc đời này chỉ có ta hay."
  },
  {
    pattern: /Tay (?:nắm|cầm) nhật nguyệt hái (?:sao|tinh thần|tinh tú),? [Tt]rần thế (?:không có người như ta|ai người sánh bằng ta)/gi,
    replacement: "Tay nắm nhật nguyệt hái tinh tú, Trần thế ai người sánh bằng ta."
  },
  {
    pattern: /手握日月摘星辰，?世间无我这般人/g,
    replacement: "Tay nắm nhật nguyệt hái tinh tú, Trần thế ai người sánh bằng ta."
  },
  {
    pattern: /Một kiếm (?:ánh sáng lạnh|quang hàn) (?:mười chín|thập cửu) châu/gi,
    replacement: "Một kiếm hàn quang rực chín châu"
  },
  {
    pattern: /一剑光寒十九洲/g,
    replacement: "Một kiếm hàn quang rực chín châu"
  },
  {
    pattern: /Ngự kiếm (?:cưỡi|theo) gió tới,? [Tt]rảm ma (?:ở )?giữa (?:trời đất|thiên địa)/gi,
    replacement: "Ngự kiếm theo gió tới, Trảm ma giữa đất trời."
  },
  {
    pattern: /御剑乘风来，?除魔天地间/g,
    replacement: "Ngự kiếm theo gió tới, Trảm ma giữa đất trời."
  },
  {
    pattern: /Ba mươi năm Hà Đông,? ba mươi năm Hà Tây,? đừng khinh thiếu niên nghèo/gi,
    replacement: "Ba mươi năm bờ đông, ba mươi năm bờ tây, chớ khinh thiếu niên nghèo!"
  },
  {
    pattern: /三十年河东，?三十年河西，?莫欺少年穷/g,
    replacement: "Ba mươi năm bờ đông, ba mươi năm bờ tây, chớ khinh thiếu niên nghèo!"
  },
  {
    pattern: /Mệnh ta do ta không do trời/gi,
    replacement: "Mệnh ta do ta định, chẳng do trời!"
  },
  {
    pattern: /我命由我不由天/g,
    replacement: "Mệnh ta do ta định, chẳng do trời!"
  },
  {
    pattern: /Thuận vi phàm,? nghịch tắc tiên/gi,
    replacement: "Thuận là phàm nhân, nghịch ắt thành tiên!"
  },
  {
    pattern: /顺为凡，?逆则仙/g,
    replacement: "Thuận là phàm nhân, nghịch ắt thành tiên!"
  }
];

/**
 * Versifies classical couplets, poems, and cultivation chants.
 * @param {string} text
 * @returns {string}
 */
function versifyClassicalChants(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const { pattern, replacement } of CLASSICAL_CHANTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

module.exports = {
  versifyClassicalChants,
  CLASSICAL_CHANTS
};
