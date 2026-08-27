"use strict";

/**
 * Lexical Candidate Schema & Contract (Phase 1: Architecture Reconciliation)
 * 
 * Defines the immutable contract for candidate lexical entries generated from
 * Trie, Proper Noun Matcher, Book Glossary, Genre Packs, and Polysemy tables.
 */

const { createSemanticSignature } = require("./contracts");

// Source Priority tiers
const LEXICAL_SOURCE_TIERS = Object.freeze({
  BOOK_GLOSSARY: { tier: "LOCKED", basePriority: 1.00 },
  TRANSLATION_MEMORY: { tier: "PREFERRED", basePriority: 0.95 },
  GENRE_PACK: { tier: "PREFERRED", basePriority: 0.85 },
  PROPER_NOUN: { tier: "PREFERRED", basePriority: 0.80 },
  PHRASE_DICT: { tier: "CANDIDATE", basePriority: 0.70 },
  POLYSEMY_ALT: { tier: "CANDIDATE", basePriority: 0.65 },
  HANVIET_FALLBACK: { tier: "FALLBACK", basePriority: 0.40 }
});

/**
 * Creates an immutable LexicalCandidate.
 * 
 * @param {Object} spec
 * @returns {Object} LexicalCandidate
 */
function createLexicalCandidate({
  id = "",
  spanZh = "",
  candidateVi = "",
  segmentation = null, // { start: number, end: number, length: number }
  lexicalSource = "PHRASE_DICT",
  sourcePriority = null,
  partOfSpeech = "noun", // noun | verb | adj | adv | name | prep | cl | fn
  semanticFeatures = [], // e.g. ["PHYSICAL_OBJECT", "ACTION", "TITLE", "LOCATION"]
  semanticSignature = null,
  isProperNoun = false,
  isLocked = false,
  confidence = 1.0,
  provenance = ""
} = {}) {
  const sourceInfo = LEXICAL_SOURCE_TIERS[lexicalSource] || LEXICAL_SOURCE_TIERS.PHRASE_DICT;
  const effectivePriority = typeof sourcePriority === "number" ? sourcePriority : sourceInfo.basePriority;
  const effectiveLocked = isLocked || sourceInfo.tier === "LOCKED";

  return Object.freeze({
    id: String(id || `${spanZh}_${lexicalSource}_${candidateVi}`),
    spanZh: String(spanZh || ""),
    candidateVi: String(candidateVi || ""),
    segmentation: segmentation ? Object.freeze({ ...segmentation }) : null,
    lexicalSource,
    tier: sourceInfo.tier, // LOCKED | PREFERRED | CANDIDATE | FALLBACK
    sourcePriority: Number(effectivePriority.toFixed(3)),
    partOfSpeech,
    semanticFeatures: Object.freeze([...semanticFeatures]),
    semanticSignature: semanticSignature || createSemanticSignature(),
    isProperNoun: Boolean(isProperNoun),
    isLocked: effectiveLocked,
    confidence: Number(confidence.toFixed(3)),
    provenance: String(provenance || "")
  });
}

module.exports = {
  createLexicalCandidate,
  LEXICAL_SOURCE_TIERS
};
