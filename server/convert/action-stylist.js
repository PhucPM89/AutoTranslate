"use strict";

/**
 * Martial Choreography & Dynamic Action Stylist.
 * Elevates fight scenes, sword clashes, palm strikes, movement techniques,
 * and aura/pressure descriptions into cinematic, high-impact Vietnamese prose.
 */

const ACTION_ENHANCEMENT_RULES = [
  // Sword & weapon dynamics
  { pattern: /một kiếm chém tới/gi, replacement: "vung kiếm chém tới" },
  { pattern: /một kiếm chém ra/gi, replacement: "vung kiếm chém ra" },
  { pattern: /một kiếm bổ tới/gi, replacement: "vung kiếm bổ xuống" },
  { pattern: /một kiếm đâm tới/gi, replacement: "vung kiếm đâm thẳng tới" },
  { pattern: /kiếm khí chém rách không khí/gi, replacement: "kiếm khí xé toạc không khí" },
  { pattern: /kiếm khí chém rách hư không/gi, replacement: "kiếm khí xé toạc hư không" },
  { pattern: /kiếm mang chém rách hư không/gi, replacement: "kiếm mang xé toạc hư không" },

  // Palm & fist strikes
  { pattern: /một chưởng đập tới/gi, replacement: "tung chưởng đánh tới" },
  { pattern: /một chưởng vỗ ra/gi, replacement: "vung chưởng tung ra" },
  { pattern: /một quyền ném ra/gi, replacement: "tung ra một quyền" },
  { pattern: /chưởng kình bạo phát/gi, replacement: "chưởng kình cuộn trào bùng nổ" },
  { pattern: /quyền kình bạo phát/gi, replacement: "quyền kình cuộn trào bùng nổ" },

  // Impact & damage feedback
  { pattern: /đem đối phương đánh bay/gi, replacement: "đánh văng đối phương bay ngược ra ngoài" },
  { pattern: /bị đánh bay ra ngoài/gi, replacement: "bị đánh văng ra ngoài" },
  { pattern: /phun ra một ngụm máu tươi/gi, replacement: "hộc ra một ngụm máu tươi" },
  { pattern: /hộc ra một ngụm tiên huyết/gi, replacement: "hộc ra một ngụm máu tươi" },
  { pattern: /phun ra một ngụm tiên huyết/gi, replacement: "hộc ra một ngụm máu tươi" },
  { pattern: /sắc mặt biến đổi lớn/gi, replacement: "sắc mặt đại biến" },
  { pattern: /bước lùi lại mấy bước/gi, replacement: "lảo đảo lùi lại mấy bước" },
  { pattern: /thân thể run lên bần bật/gi, replacement: "toàn thân run rẩy kịch liệt" },

  // Movement & footwork
  { pattern: /thân hình lóe lên/gi, replacement: "thân hình thoắt lóe" },
  { pattern: /thân ảnh lóe lên/gi, replacement: "bóng người thoắt lóe" },
  { pattern: /tốc độ cực nhanh mà/gi, replacement: "tốc độ cực nhanh " },
  { pattern: /thân hình lướt đi như gió/gi, replacement: "thân hình lướt đi như tia chớp" },

  // Auras, pressure & presence
  { pattern: /khí thế bạo phát/gi, replacement: "khí thế cuộn trào bùng nổ" },
  { pattern: /uy áp bao phủ xuống/gi, replacement: "uy áp ngập tràn bao phủ xuống" },
  { pattern: /sát khí bao phủ toàn trường/gi, replacement: "sát khí ngút trời bao trùm toàn trường" }
];

/**
 * Polishes action and combat prose in a translated text.
 * @param {string} text
 * @returns {string}
 */
function polishActionProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of ACTION_ENHANCEMENT_RULES) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result;
}

module.exports = {
  polishActionProse,
  ACTION_ENHANCEMENT_RULES
};
