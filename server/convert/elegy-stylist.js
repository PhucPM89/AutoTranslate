"use strict";

/**
 * Elegy, Memorial & Epitaph Stylist.
 * Elevates memorial elegies, tomb sacrifices, departed mentors, martial heroes,
 * and poignant parting laments with solemn, sacred, and emotionally moving prose.
 */

const ELEGY_RULES = [
  // Soul calling & tomb sacrifices
  { pattern: /hồn quy lai hề/gi, replacement: "hồn hỡi hồn ơi, xin hãy quy hồi nơi cố hương!" },
  { pattern: /(?:ngậm cười nơi chín suối|ngậm cười chín suối)/gi, replacement: "nguyện cho người an lòng ngậm cười nơi chín suối" },

  // Heroic spirits & memories
  { pattern: /anh hồn bất diệt/gi, replacement: "anh hồn bất diệt, muôn đời khắc ghi công đức" },
  { pattern: /âm dung uyển tại/gi, replacement: "nụ cười và giọng nói ấm áp tựa như vẫn còn văng vẳng bên tai" },
  { pattern: /âm dương cách biệt/gi, replacement: "âm dương cách biệt, đôi ngả chia lìa đau xót khôn nguôi" }
];

/**
 * Polishes elegy and memorial prose.
 * @param {string} text
 * @returns {string}
 */
function polishElegyProse(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of ELEGY_RULES) {
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
  polishElegyProse,
  ELEGY_RULES
};
