"use strict";

/**
 * Semantic-Preserving Anti-Repetition Filter (Phase 3)
 * 
 * Rotates synonyms strictly within Isomorphic Equivalence Sets, preserving
 * the exact semantic signature and polarity without hallucinating meaning shifts.
 */

const EQUIVALENCE_SETS = {
  INVOLUNTARILY: [
    { text: "không khỏi", priority: 1.0 },
    { text: "bất giác", priority: 0.9 },
    { text: "thoáng chốc", priority: 0.8 }
  ],
  SUDDENLY: [
    { text: "bỗng nhiên", priority: 1.0 },
    { text: "đột nhiên", priority: 0.95 },
    { text: "chợt", priority: 0.85 }
  ],
  COLD_GAZE: [
    { text: "ánh mắt lạnh lùng", priority: 1.0 },
    { text: "ánh mắt sắc lạnh", priority: 0.95 },
    { text: "đôi mắt lạnh băng", priority: 0.90 }
  ],
  IMMEDIATELY: [
    { text: "lập tức", priority: 1.0 },
    { text: "ngay tức khắc", priority: 0.95 },
    { text: "lập tức liền", priority: 0.80 }
  ],
  FACE_DRASTIC_CHANGE: [
    { text: "sắc mặt đại biến", priority: 1.0 },
    { text: "sắc mặt biến đổi dữ dội", priority: 0.90 },
    { text: "sắc mặt tái mét", priority: 0.85 }
  ]
};

function createAntiRepetitionTracker({ windowSize = 4 } = {}) {
  // History of recently chosen terms: array of strings
  const history = [];

  function recordTerm(term) {
    if (!term) return;
    history.push(term);
    if (history.length > windowSize * 3) {
      history.shift();
    }
  }

  /**
   * Applies synonym rotation to avoid repetition in recent clause window.
   * 
   * @param {string} text
   * @returns {string} Rotated text
   */
  function applyRotation(text) {
    if (!text || typeof text !== "string") return text;

    let result = text;

    for (const [key, candidates] of Object.entries(EQUIVALENCE_SETS)) {
      for (let i = 0; i < candidates.length; i++) {
        const item = candidates[i];
        if (result.includes(item.text)) {
          // Check if item.text was used very recently in history
          const recentCount = history.filter((t) => t === item.text).length;
          if (recentCount > 0) {
            // Find an alternative that was NOT used recently
            const alt = candidates.find((c) => !history.includes(c.text)) || candidates[(i + 1) % candidates.length];
            result = result.replace(item.text, alt.text);
            recordTerm(alt.text);
            break;
          } else {
            recordTerm(item.text);
            break;
          }
        }
      }
    }

    return result;
  }

  function reset() {
    history.length = 0;
  }

  return Object.freeze({
    applyRotation,
    recordTerm,
    reset,
    getHistory: () => [...history]
  });
}

module.exports = {
  createAntiRepetitionTracker,
  EQUIVALENCE_SETS
};
