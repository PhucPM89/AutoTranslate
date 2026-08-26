"use strict";

/**
 * Military Strategy & Siege Warfare Stylist.
 * Elevates battlefield drums, troop charges, siege engines, clarion horns,
 * and bloodstained battlegrounds into epic, thundering prose.
 */

const WARFARE_RULES = [
  // Drums & withdrawal gongs
  { pattern: /đánh trống trợ uy/gi, replacement: "tiếng trống trận dồn dập rền vang rung chuyển trời đất" },
  { pattern: /(?:gõ chiêng thu quân|minh kim thu binh)/gi, replacement: "tiếng chiêng thu quân giục giã vang lên khắp chiến trường" },

  // Troop charges & battlefield fires
  { pattern: /(?:thiên quân vạn mã xung phong|thiên quân vạn mã lao tới)/gi, replacement: "thiên quân vạn mã gầm thét ầm ầm xông pha trận mạc" },
  { pattern: /khói lửa ngập trời/gi, replacement: "khói lửa ngút trời bao trùm cả một vùng biên cương quan ải" },
  { pattern: /huyết chiến sa trường/gi, replacement: "quyết tử huyết chiến nơi sa trường đẫm máu" }
];

/**
 * Polishes military and siege warfare prose.
 * @param {string} text
 * @returns {string}
 */
function polishWarfareProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of WARFARE_RULES) {
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
  polishWarfareProse,
  WARFARE_RULES
};
