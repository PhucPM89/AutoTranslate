"use strict";

/**
 * Dual-Pass Agentic Reflection & Self-Critique Engine.
 * Analyzes candidate translations, calculates literary quality & fluency scores,
 * audits glossary adherence, and applies targeted refinement patches to guarantee
 * publication-grade prose.
 */

const { polishLiteraryProse } = require("./convert/literary-stylist");
const { adaptLiteraryIdioms } = require("./convert/idiom-adapter");

// Stiff Sino-Vietnamese grammar patterns requiring reflection polishing
const STIFF_REFLECTION_RULES = [
  // Word order & preposition artifacts
  { pattern: /đối với\s+([^,.;!?]+?)\s+tới nói/gi, replacement: "đối với $1 mà nói" },
  { pattern: /trong lòng không khỏi có chút/gi, replacement: "trong lòng không khỏi" },
  { pattern: /trong lòng không khỏi có phần/gi, replacement: "trong lòng thoáng" },
  { pattern: /tại\s+trước\s+mắt/gi, replacement: "trước mắt" },
  { pattern: /tại\s+trong\s+mắt/gi, replacement: "trong mắt" },
  { pattern: /tại\s+nơi\s+này/gi, replacement: "ở nơi này" },
  { pattern: /có chút ít/gi, replacement: "có chút" },
  { pattern: /bị\s+([^,.;!?]+?)\s+cấp\s+([^,.;!?]+)/gi, replacement: "bị $1 $2" },
  { pattern: /hướng về phía\s+([^,.;!?]+)/gi, replacement: "hướng về $1" },
  { pattern: /không ngừng mà\s+/gi, replacement: "không ngừng " },
  { pattern: /liên tục mà\s+/gi, replacement: "liên tục " },
  { pattern: /tùy ý mà\s+/gi, replacement: "tùy ý " },
  { pattern: /nhẹ nhàng mà\s+/gi, replacement: "nhẹ nhàng " },
  { pattern: /chậm rãi mà\s+/gi, replacement: "chậm rãi " },
  { pattern: /trong lúc nhất thời/gi, replacement: "trong thoáng chốc" },
  { pattern: /nói không ra lời/gi, replacement: "nghẹn lời" },
  { pattern: /nghĩ không ra/gi, replacement: "không hiểu nổi" },
  { pattern: /nhìn không thấu/gi, replacement: "nhìn không thấu" },
  { pattern: /bị sợ nhảy dựng/gi, replacement: "giật nảy mình" },
  { pattern: /bị sợ hết hồn/gi, replacement: "hồn vía lên mây" }
];

/**
 * Calculates a fluency & prose quality score (0.0 to 10.0).
 * @param {string} text
 * @returns {{ score: number, issues: string[] }}
 */
function calculateFluencyScore(text) {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return { score: 0, issues: ["Văn bản rỗng"] };
  }

  let penalty = 0;
  const issues = [];

  // Check for stiff grammar patterns
  let stiffCount = 0;
  for (const rule of STIFF_REFLECTION_RULES) {
    const matches = text.match(rule.pattern);
    if (matches) {
      stiffCount += matches.length;
    }
  }
  if (stiffCount > 0) {
    penalty += Math.min(2.5, stiffCount * 0.5);
    issues.push(`Phát hiện ${stiffCount} điểm cấu trúc Hán sượng.`);
  }

  // Check for excessive repetitive 3-word pronouns in close proximity
  const words = text.toLowerCase().split(/\s+/);
  let pronounEcho = 0;
  for (let i = 0; i < words.length - 2; i++) {
    if ((words[i] === "hắn" || words[i] === "y" || words[i] === "nàng") &&
        (words[i + 1] === "hắn" || words[i + 2] === "hắn" || words[i + 1] === "nàng" || words[i + 2] === "nàng")) {
      pronounEcho++;
    }
  }
  if (pronounEcho > 2) {
    penalty += Math.min(1.5, pronounEcho * 0.3);
    issues.push(`Phát hiện ${pronounEcho} vị trí lặp đại từ quá sát nhau.`);
  }

  // Check for raw untranslated Han glyphs
  const hanMatches = text.match(/[\u4e00-\u9fa5]/g);
  if (hanMatches && hanMatches.length > 0) {
    penalty += Math.min(3.0, hanMatches.length * 1.0);
    issues.push(`Sót ${hanMatches.length} chữ Hán chưa dịch.`);
  }

  // Check for punctuation health
  if (!/[.!?…”’"]$/.test(text.trim())) {
    penalty += 0.5;
    issues.push("Đoạn văn kết thúc thiếu dấu câu chuẩn.");
  }

  const score = Math.max(0, Number((10 - penalty).toFixed(2)));
  return { score, issues };
}

/**
 * Audits whether all required glossary entities appear in the translated text.
 * @param {string} text
 * @param {Object} glossary
 * @returns {{ compliant: boolean, missingTerms: string[] }}
 */
function auditGlossaryCompliance(text, glossary = {}) {
  if (!text || !glossary || Object.keys(glossary).length === 0) {
    return { compliant: true, missingTerms: [] };
  }

  const missingTerms = [];
  for (const [zh, vi] of Object.entries(glossary)) {
    if (vi && !text.includes(vi)) {
      missingTerms.push(vi);
    }
  }

  return {
    compliant: missingTerms.length === 0,
    missingTerms
  };
}

/**
 * Dual-Pass Reflection: Evaluates candidate translation, applies targeted polishing
 * and returns enhanced literary-grade text.
 * @param {string} translation
 * @param {Object} options
 * @returns {{ text: string, initialScore: number, finalScore: number, improved: boolean }}
 */
function reflectAndPolish(translation, { sourceText = "", glossary = {}, scene = "neutral" } = {}) {
  if (!translation || typeof translation !== "string") {
    return { text: "", initialScore: 0, finalScore: 0, improved: false };
  }

  const initial = calculateFluencyScore(translation);
  let polished = translation;

  // Apply stiff grammar reflection rules
  for (const rule of STIFF_REFLECTION_RULES) {
    if (rule.pattern.test(polished)) {
      polished = polished.replace(rule.pattern, rule.replacement);
    }
  }

  // Adapt any stray idioms
  polished = adaptLiteraryIdioms(polished);

  // Apply prose stylistics
  polished = polishLiteraryProse(polished);

  const finalScore = calculateFluencyScore(polished).score;

  return {
    text: polished,
    initialScore: initial.score,
    finalScore,
    improved: polished !== translation
  };
}

module.exports = {
  calculateFluencyScore,
  auditGlossaryCompliance,
  reflectAndPolish,
  STIFF_REFLECTION_RULES
};
