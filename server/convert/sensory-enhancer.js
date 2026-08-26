"use strict";

/**
 * Sensory & Atmospheric Imagery Enhancer.
 * Transforms stiff Sino-Vietnamese sensory, meteorological, and aesthetic
 * descriptions into poetic, evocative, publication-grade Vietnamese imagery.
 */

const SENSORY_IMAGERY_RULES = [
  // Moonlight & celestial atmosphere
  { pattern: /nguyệt hoa như thủy/gi, replacement: "ánh trăng vằng vặc như dòng nước bạc" },
  { pattern: /nguyệt sắc như thủy/gi, replacement: "ánh trăng vằng vặc như dòng nước bạc" },
  { pattern: /ánh trăng như nước/gi, replacement: "ánh trăng vằng vặc như dòng nước bạc" },

  // Scents & fragrances
  { pattern: /u hương trận trận/gi, replacement: "hương thơm thoang thoảng dịu ngọt" },
  { pattern: /u hương phiêu tán/gi, replacement: "hương thơm thoang thoảng lan tỏa" },
  { pattern: /hương thơm trận trận/gi, replacement: "hương thơm thoang thoảng từng đợt" },

  // Mist, fog & spiritual vapor
  { pattern: /bạch vụ nhân uân/gi, replacement: "mây mù trắng xóa lượn lờ bao phủ" },
  { pattern: /sương mù nhân uân/gi, replacement: "sương mù lượn lờ bao phủ" },
  { pattern: /khói đen lượn lờ/gi, replacement: "khói đen cuồn cuộn bốc lên" },
  { pattern: /linh khí nhân uân/gi, replacement: "linh khí mịt mù lượn lờ tụ hội" },

  // Coldness, chill & killing intent
  { pattern: /sát khí sâm nhiên/gi, replacement: "sát khí lạnh thấu xương" },
  { pattern: /hàn ý sâm nhiên/gi, replacement: "khí lạnh buốt giá thấu xương" },
  { pattern: /hàn phong trận trận/gi, replacement: "từng cơn gió lạnh buốt rít gào" },
  { pattern: /lãnh ý sâm nhiên/gi, replacement: "khí lạnh buốt giá thấu xương" },

  // Light, lightning & divine aura
  { pattern: /huyết quang ngút trời/gi, replacement: "huyết quang đỏ thẫm ngút trời" },
  { pattern: /kim quang vạn trượng/gi, replacement: "ánh vàng rực rỡ vạn trượng" },
  { pattern: /lôi đình vạn quân/gi, replacement: "sấm sét gầm vang vạn trượng" },
  { pattern: /thiên hôn địa ám/gi, replacement: "trời đất tối sầm mù mịt" },
  { pattern: /sơn băng địa liệt/gi, replacement: "núi lở đất nứt kinh hoàng" }
];

/**
 * Enhances sensory and atmospheric imagery in text.
 * @param {string} text
 * @returns {string}
 */
function enhanceSensoryImagery(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of SENSORY_IMAGERY_RULES) {
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
  enhanceSensoryImagery,
  SENSORY_IMAGERY_RULES
};
