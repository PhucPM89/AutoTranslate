"use strict";

/**
 * Rhythm & Pacing Governor (Phase 3)
 * 
 * Defines Rhythm Profiles:
 * - FAST_PUNCHY: Short, energetic 2-4 syllable action compounds, crisp verbal rhythm.
 * - SLOW_DELIBERATE: Balanced 4-4 / 6-6 metric parallelism, lyrical cadence.
 * - MODERATE: Standard natural prose balance.
 */

/**
 * Creates a RhythmProfile for a clause based on context pacing and syntactic role.
 * 
 * @param {Object} clauseIR
 * @param {Object} context
 * @returns {Object} RhythmProfile
 */
function createRhythmProfile(clauseIR, context = {}) {
  const pacing = (context && context.pacing) || "MODERATE";
  const role = (clauseIR && clauseIR.role) || "ACTION";

  if (pacing === "FAST_PUNCHY" || role === "ACTION") {
    return Object.freeze({
      pacing: "FAST_PUNCHY",
      targetVerbSyllables: 2, // Prefer 2-syllable concise verbs e.g. "vung kiếm", "tung chưởng"
      maxPhraseSyllables: 8,
      preferShortPauses: true,
      allowLyricalParallelism: false
    });
  }

  if (pacing === "SLOW_DELIBERATE" || role === "DESCRIPTION" || role === "INCANTATION") {
    return Object.freeze({
      pacing: "SLOW_DELIBERATE",
      targetVerbSyllables: 4, // e.g. "thưởng trà đàm đạo", "tâm tịnh như nước"
      maxPhraseSyllables: 16,
      preferShortPauses: false,
      allowLyricalParallelism: true
    });
  }

  return Object.freeze({
    pacing: "MODERATE",
    targetVerbSyllables: 3,
    maxPhraseSyllables: 12,
    preferShortPauses: false,
    allowLyricalParallelism: false
  });
}

module.exports = {
  createRhythmProfile
};
