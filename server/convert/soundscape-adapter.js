"use strict";

/**
 * Soundscape & Onomatopoeia Naturalizer.
 * Replaces unpolished Chinese sound loanwords (phanh, khát sát, phốc, hồng long)
 * with vivid, highly expressive Vietnamese onomatopoeia.
 */

const SOUNDSCAPE_RULES = [
  // Impact & explosion sounds
  { pattern: /phanh một tiếng vang lên/gi, replacement: "rầm một tiếng vang dội" },
  { pattern: /phanh một tiếng/gi, replacement: "rầm một tiếng" },
  { pattern: /hồng long long tiếng nổ/gi, replacement: "tiếng nổ ầm ầm rền vang" },
  { pattern: /hồng long long nổ vang/gi, replacement: "nổ vang ầm ầm rung chuyển" },
  { pattern: /rầm rầm rầm tiếng nổ/gi, replacement: "tiếng nổ ầm ầm vang dội" },

  // Fractures & physical breaks
  { pattern: /khát sát một tiếng vang lên/gi, replacement: "rắc một tiếng giòn giã" },
  { pattern: /khát sát một tiếng/gi, replacement: "rắc một tiếng" },
  { pattern: /răng rắc một tiếng/gi, replacement: "rắc một tiếng giòn giã" },

  // Liquid bursts, blood & spits
  { pattern: /phốc một tiếng phun ra/gi, replacement: "phụt một tiếng hộc ra" },
  { pattern: /phốc một tiếng/gi, replacement: "phụt một tiếng" },
  { pattern: /phốc xuy một tiếng/gi, replacement: "phụt một tiếng" },

  // Weapon resonance, metallic clashes & wind
  { pattern: /kiếm minh ong ong/gi, replacement: "thanh kiếm rung lên ong ong rền rĩ" },
  { pattern: /tiếng kiếm kêu ong ong/gi, replacement: "tiếng kiếm ngân vang rền rĩ" },
  { pattern: /đinh đinh đang đang/gi, replacement: "keng keng keng keng" },
  { pattern: /đinh một tiếng vang lên/gi, replacement: "keng một tiếng sắc lẹm" },
  { pattern: /đinh một tiếng/gi, replacement: "keng một tiếng" },
  { pattern: /hô hô vang lên/gi, replacement: "vù vù rít gào" },
  { pattern: /tiếng gió gào thét hô hô/gi, replacement: "tiếng gió rít gào vù vù" }
];

/**
 * Naturalizes soundscapes and onomatopoeia.
 * @param {string} text
 * @returns {string}
 */
function naturalizeSoundscapes(text) {
  if (!text || typeof text !== "string") return "";

  let result = text;
  for (const rule of SOUNDSCAPE_RULES) {
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
  naturalizeSoundscapes,
  SOUNDSCAPE_RULES
};
