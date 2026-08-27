"use strict";

/**
 * Lexical Candidate Generator (Phase 1: Architecture Reconciliation)
 * 
 * Generates a multi-hypothesis LexicalCandidateGraph from a Chinese source chunk.
 * Gathers candidate evidence from:
 * 1. Book Glossaries (LOCKED)
 * 2. Proper Noun Matcher (Names & Places)
 * 3. Genre Dictionaries & Translation Memory
 * 4. Phrase Dictionary (Trie Longest Match)
 * 5. Polysemy Context Tables
 * 6. Han-Viet Fallback
 */

const { createLexicalCandidate } = require("./lexical-candidate");
const { createSemanticSignature } = require("./contracts");

// Explicit Polysemy Table for common ambiguous Chinese characters & roots
const KNOWN_POLYSEMOUS_ENTRIES = {
  "重": [
    {
      candidateVi: "nặng",
      partOfSpeech: "adj",
      semanticFeatures: ["WEIGHT", "SEVERITY"],
      semanticSignature: createSemanticSignature({ denotation: "HEAVY_OR_SEVERE", valence: 0.0, intensity: 0.70 }),
      confidence: 0.90,
      indicatorContexts: ["如泰山", "重如", "伤", "创", "量", "重沉", "万斤"]
    },
    {
      candidateVi: "trùng",
      partOfSpeech: "num",
      semanticFeatures: ["LAYER", "MULTIPLE"],
      semanticSignature: createSemanticSignature({ denotation: "LAYERED_REPETITION", valence: 0.0, intensity: 0.50 }),
      confidence: 0.85,
      indicatorContexts: ["九重", "三重", "重天", "重叠", "叠"]
    },
    {
      candidateVi: "lại",
      partOfSpeech: "adv",
      semanticFeatures: ["ITERATION", "RENEWAL"],
      semanticSignature: createSemanticSignature({ denotation: "AGAIN_OR_RENEW", valence: 0.10, intensity: 0.60 }),
      confidence: 0.90,
      indicatorContexts: ["重整", "重新", "重逢", "重聚", "重见", "重出"]
    }
  ],
  "门": [
    {
      candidateVi: "cửa",
      partOfSpeech: "noun",
      semanticFeatures: ["PHYSICAL_PORTAL", "OBJECT"],
      semanticSignature: createSemanticSignature({ denotation: "PHYSICAL_DOOR", valence: 0.0, intensity: 0.30 }),
      confidence: 0.95,
      indicatorContexts: ["关", "开", "推", "房", "大门", "铁门", "木门", "锁", "门扇", "门前", "破门"]
    },
    {
      candidateVi: "môn",
      partOfSpeech: "noun",
      semanticFeatures: ["ORGANIZATION", "FACTION", "DOCTRINE"],
      semanticSignature: createSemanticSignature({ denotation: "SECT_OR_DOCTRINE", valence: 0.10, intensity: 0.50 }),
      confidence: 0.95,
      indicatorContexts: ["佛", "宗", "师", "山门", "入门", "外门", "内门", "旁门", "法门", "宗门", "掌门"]
    }
  ],
  "行": [
    {
      candidateVi: "đoàn",
      partOfSpeech: "cl",
      semanticFeatures: ["GROUP", "PEOPLE_SEQUENCE"],
      semanticSignature: createSemanticSignature({ denotation: "PARTY_OR_GROUP", valence: 0.0, intensity: 0.40 }),
      confidence: 0.95,
      indicatorContexts: ["一行人", "一行", "同行"]
    },
    {
      candidateVi: "đi",
      partOfSpeech: "verb",
      semanticFeatures: ["MOTION", "ACTION"],
      semanticSignature: createSemanticSignature({ denotation: "WALK_OR_MOVE", valence: 0.0, intensity: 0.50 }),
      confidence: 0.90,
      indicatorContexts: ["走", "行进", "行走", "潜行", "前行"]
    }
  ],
  "便": [
    {
      candidateVi: "liền",
      partOfSpeech: "adv",
      semanticFeatures: ["ASPECT_IMMEDIATE"],
      semanticSignature: createSemanticSignature({ denotation: "IMMEDIATELY_THEN", valence: 0.0, intensity: 0.50 }),
      confidence: 0.95,
      indicatorContexts: ["出招", "是", "可", "能", "退", "去", "杀", "至", "斩"]
    },
    {
      candidateVi: "tiện",
      partOfSpeech: "adj",
      semanticFeatures: ["CONVENIENCE"],
      semanticSignature: createSemanticSignature({ denotation: "CONVENIENT", valence: 0.30, intensity: 0.40 }),
      confidence: 0.85,
      indicatorContexts: ["方便", "便宜", "随手", "便当", "不便"]
    }
  ]
};

function createLexicalCandidateGenerator({
  trie = null,
  phraseDict = {},
  properNounMatcher = null,
  nameGlossary = {},
  genreDict = {},
  hanvietChars = {}
} = {}) {
  /**
   * Generates a LexicalCandidateGraph for a given source text.
   * 
   * @param {string} textZh
   * @param {Object} contextHints
   * @returns {{ nodes: Array<Object>, hasAmbiguity: boolean, isFastPathEligible: boolean }}
   */
  function generateCandidateGraph(textZh, contextHints = {}) {
    if (!textZh || typeof textZh !== "string") {
      return { nodes: [], hasAmbiguity: false, isFastPathEligible: true };
    }

    const chars = Array.from(textZh);
    const nodes = [];
    let hasAmbiguity = false;
    let i = 0;

    while (i < chars.length) {
      const ch = chars[i];
      const positionCandidates = [];

      // 1. Check Book Glossary (LOCKED)
      for (const [gZh, gVi] of Object.entries(nameGlossary || {})) {
        if (textZh.startsWith(gZh, i)) {
          positionCandidates.push(createLexicalCandidate({
            spanZh: gZh,
            candidateVi: gVi,
            segmentation: { start: i, end: i + gZh.length, length: gZh.length },
            lexicalSource: "BOOK_GLOSSARY",
            isLocked: true,
            partOfSpeech: "name",
            confidence: 1.0,
            provenance: "book-glossary"
          }));
        }
      }

      // 2. Check Proper Noun Matcher
      if (properNounMatcher) {
        const pMatch = properNounMatcher.match(chars, i);
        if (pMatch) {
          positionCandidates.push(createLexicalCandidate({
            spanZh: chars.slice(i, i + pMatch.length).join(""),
            candidateVi: pMatch.vi,
            segmentation: { start: i, end: i + pMatch.length, length: pMatch.length },
            lexicalSource: "PROPER_NOUN",
            isProperNoun: true,
            partOfSpeech: "name",
            confidence: 0.90,
            provenance: "proper-noun-matcher"
          }));
        }
      }

      // 3. Check Trie Longest Match (Phrase Dictionary)
      let phraseMatch = null;
      if (trie) {
        let node = trie.root || (trie instanceof Map ? trie : null);
        if (node) {
          let j = i;
          let longest = null;
          while (j < chars.length) {
            const next = node.get(chars[j]);
            if (!next) break;
            node = next;
            j++;
            // Check terminal value
            for (const [k, val] of node.entries()) {
              if ((typeof k === "symbol" || k === "") && typeof val === "string") {
                longest = { vi: val, length: j - i };
              }
            }
          }
          if (longest) {
            phraseMatch = longest;
          }
        }
      } else if (phraseDict) {
        for (let len = 6; len >= 2; len--) {
          const sub = chars.slice(i, i + len).join("");
          if (phraseDict[sub]) {
            phraseMatch = { vi: phraseDict[sub], length: len };
            break;
          }
        }
      }

      if (phraseMatch) {
        positionCandidates.push(createLexicalCandidate({
          spanZh: chars.slice(i, i + phraseMatch.length).join(""),
          candidateVi: phraseMatch.vi,
          segmentation: { start: i, end: i + phraseMatch.length, length: phraseMatch.length },
          lexicalSource: "PHRASE_DICT",
          confidence: 0.85,
          provenance: "trie-phrase-dict"
        }));

        // Lookahead for overlapping proper nouns or glossary within phrase span
        if (phraseMatch.length > 1) {
          for (let k = 1; k < phraseMatch.length; k++) {
            if (properNounMatcher) {
              const subName = properNounMatcher.match(chars, i + k);
              if (subName && subName.length >= 2) {
                hasAmbiguity = true;
                // Provide single char prefix candidate to allow alternative segmentation
                const singleChar = chars[i];
                const singleHv = hanvietChars[singleChar] ? hanvietChars[singleChar].hv : singleChar;
                positionCandidates.push(createLexicalCandidate({
                  spanZh: singleChar,
                  candidateVi: singleHv,
                  segmentation: { start: i, end: i + 1, length: 1 },
                  lexicalSource: "PHRASE_DICT",
                  confidence: 0.70,
                  provenance: "competing-segmentation:prefix"
                }));
              }
            }
          }
        }
      }

      // 4. Check Explicit Polysemy Table
      for (const [polyZh, polyAlts] of Object.entries(KNOWN_POLYSEMOUS_ENTRIES)) {
        if (textZh.startsWith(polyZh, i)) {
          hasAmbiguity = true;
          for (const alt of polyAlts) {
            positionCandidates.push(createLexicalCandidate({
              spanZh: polyZh,
              candidateVi: alt.candidateVi,
              segmentation: { start: i, end: i + polyZh.length, length: polyZh.length },
              lexicalSource: "POLYSEMY_ALT",
              partOfSpeech: alt.partOfSpeech,
              semanticFeatures: alt.semanticFeatures,
              semanticSignature: alt.semanticSignature,
              confidence: alt.confidence,
              provenance: `polysemy-table:${polyZh}`
            }));
          }
        }
      }

      // 5. Fallback Han-Viet if no candidates at all
      if (positionCandidates.length === 0 && hanvietChars[ch]) {
        const hv = hanvietChars[ch].hv || ch;
        positionCandidates.push(createLexicalCandidate({
          spanZh: ch,
          candidateVi: hv,
          segmentation: { start: i, end: i + 1, length: 1 },
          lexicalSource: "HANVIET_FALLBACK",
          confidence: 0.50,
          provenance: "hanviet-chars"
        }));
      }

      // If multiple candidates exist with different segmentations or meanings, flag ambiguity
      if (positionCandidates.length > 1) {
        const uniqueVi = new Set(positionCandidates.map((c) => c.candidateVi));
        const uniqueLens = new Set(positionCandidates.map((c) => c.segmentation.length));
        if (uniqueVi.size > 1 || uniqueLens.size > 1) {
          hasAmbiguity = true;
        }
      }

      // Determine step forward
      const maxLen = positionCandidates.reduce((max, c) => Math.max(max, c.segmentation.length), 1);
      nodes.push({
        position: i,
        sourceChar: ch,
        candidates: Object.freeze(positionCandidates)
      });

      i += Math.max(1, phraseMatch ? phraseMatch.length : 1);
    }

    return Object.freeze({
      textZh,
      nodes: Object.freeze(nodes),
      hasAmbiguity,
      isFastPathEligible: !hasAmbiguity
    });
  }

  return Object.freeze({
    generateCandidateGraph,
    KNOWN_POLYSEMOUS_ENTRIES
  });
}

module.exports = {
  createLexicalCandidateGenerator,
  KNOWN_POLYSEMOUS_ENTRIES
};
