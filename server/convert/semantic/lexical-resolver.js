"use strict";

/**
 * Lexical Resolution Engine (Phase 1: Architecture Reconciliation)
 * 
 * Performs deterministic, multi-factor disambiguation over the LexicalCandidateGraph.
 * Implements:
 * 1. Fast Path for unambiguous Trie/Glossary matches (Zero-Overhead).
 * 2. Multi-Factor Contextual Disambiguation for Polysemy & Segmentation Conflicts.
 * 3. Hard Lock (Book Glossary) vs Soft Preference (Genre/Trie).
 * 4. Multi-Factor Uncertainty & Correct Abstention.
 * 5. Full Provenance Tracing for every lexical decision.
 */

const { checkSignatureCompatibility } = require("./contracts");
const { createLexicalCandidateGenerator } = require("./lexical-candidate-generator");

// Scoring Weights (Explicit, Configurable, Traceable)
const RESOLVER_WEIGHTS = Object.freeze({
  LEXICAL_SOURCE: 0.30,      // Priority of source (Glossary > TM > Genre > Trie > Han-Viet)
  CONTEXT_INDICATOR: 0.30,   // Match with surrounding context keywords/domain
  SYNTACTIC_COMPAT: 0.20,    // Part-of-speech & syntactic position compatibility
  SIGNATURE_COMPAT: 0.20     // Semantic signature & affect alignment
});

function createLexicalResolver({
  candidateGenerator = createLexicalCandidateGenerator(),
  weights = RESOLVER_WEIGHTS
} = {}) {
  /**
   * Resolves a Chinese sentence into unambiguous lexical units.
   * 
   * @param {string} textZh
   * @param {Object} context - SemanticContext snapshot
   * @param {Object} discourse - DiscourseState snapshot
   * @param {Object} clauseIR - Optional ClauseIR for syntactic cues
   * @returns {Object} LexicalResolutionResult
   */
  function resolveText(textZh, context = {}, discourse = {}, clauseIR = null) {
    const graph = candidateGenerator.generateCandidateGraph(textZh, { context, discourse });
    const resolvedSlots = [];
    const resolutionRecords = [];
    let overallStatus = "RESOLVED";
    let minConfidence = 1.0;

    // FAST PATH: If graph is completely unambiguous, return in O(1)
    if (graph.isFastPathEligible) {
      for (const node of graph.nodes) {
        const top = node.candidates[0];
        if (top) {
          const method = top.isLocked ? "GLOSSARY_LOCK" : "FAST_PATH";
          resolvedSlots.push({
            spanZh: top.spanZh,
            chosenVi: top.candidateVi,
            lexicalSource: top.lexicalSource,
            confidence: 1.0,
            method
          });
          resolutionRecords.push(Object.freeze({
            sourceSpan: top.spanZh,
            selectedCandidate: top.candidateVi,
            status: "RESOLVED",
            confidence: 1.0,
            margin: 1.0,
            method,
            evidence: { fastPath: true, isLocked: top.isLocked },
            alternatives: Object.freeze([]),
            provenance: top.provenance
          }));
        }
      }

      return Object.freeze({
        textZh,
        status: "RESOLVED",
        method: "FAST_PATH",
        confidence: 1.0,
        resolvedSlots: Object.freeze(resolvedSlots),
        resolutionRecords: Object.freeze(resolutionRecords),
        provenance: "lexical-resolver:fast-path"
      });
    }

    // DISAMBIGUATION PATH: Multi-factor contextual scoring for ambiguous nodes
    for (const node of graph.nodes) {
      const candidates = node.candidates;
      if (!candidates || candidates.length === 0) continue;

      // 1. Single candidate -> trivial resolution
      if (candidates.length === 1) {
        const single = candidates[0];
        const method = single.isLocked ? "GLOSSARY_LOCK" : "DIRECT_MATCH";
        resolvedSlots.push({
          spanZh: single.spanZh,
          chosenVi: single.candidateVi,
          lexicalSource: single.lexicalSource,
          confidence: single.confidence,
          method
        });
        resolutionRecords.push(Object.freeze({
          sourceSpan: single.spanZh,
          selectedCandidate: single.candidateVi,
          status: "RESOLVED",
          confidence: single.confidence,
          margin: 1.0,
          method,
          evidence: { directMatch: true, isLocked: single.isLocked },
          alternatives: Object.freeze([]),
          provenance: single.provenance
        }));
        continue;
      }

      // 2. Check for Hard Locked Candidates (e.g. Book Glossary)
      const lockedCandidate = candidates.find((c) => c.isLocked);
      if (lockedCandidate) {
        resolvedSlots.push({
          spanZh: lockedCandidate.spanZh,
          chosenVi: lockedCandidate.candidateVi,
          lexicalSource: lockedCandidate.lexicalSource,
          confidence: 1.0,
          method: "GLOSSARY_LOCK"
        });
        const rejected = candidates
          .filter((c) => c !== lockedCandidate)
          .map((c) => ({ candidate: c.candidateVi, reason: "OVERRULED_BY_HARD_GLOSSARY_LOCK" }));

        resolutionRecords.push(Object.freeze({
          sourceSpan: lockedCandidate.spanZh,
          selectedCandidate: lockedCandidate.candidateVi,
          status: "RESOLVED",
          confidence: 1.0,
          margin: 1.0,
          method: "GLOSSARY_LOCK",
          evidence: { isLocked: true },
          alternatives: Object.freeze(rejected),
          provenance: lockedCandidate.provenance
        }));
        continue;
      }

      // 3. Multi-Factor Scoring
      const scoredCandidates = [];
      const primaryDomain = (context && context.primaryDomain) || "NEUTRAL";
      const sourceSig = (clauseIR && clauseIR.semanticSignature) || null;

      for (const cand of candidates) {
        let lexicalScore = cand.sourcePriority; // 0.0 - 1.0
        let contextIndicatorScore = 0.50;      // Default neutral
        let syntacticCompat = 0.70;            // Default reasonable
        let signatureScore = 0.80;             // Default

        // Check context indicators (e.g. surrounding keywords in textZh)
        const polyEntry = cand.provenance.includes("polysemy-table") ? cand : null;
        if (polyEntry && polyEntry.semanticFeatures) {
          // Check if textZh has indicator keywords
          if (cand.spanZh === "门") {
            if (/关|开|推|房|大门|铁门|锁|门扇|门前|破门/.test(textZh)) {
              if (cand.candidateVi === "cửa" || cand.candidateVi.includes("cửa")) {
                contextIndicatorScore = 1.00;
              } else {
                contextIndicatorScore = 0.10;
              }
            } else if (/佛|宗|师|山门|入门|外门|内门|旁门|法门|掌门/.test(textZh) || primaryDomain === "ZEN_TEA" || primaryDomain === "CULTIVATION_BREAKTHROUGH") {
              if (cand.candidateVi === "môn" || cand.candidateVi.includes("môn")) {
                contextIndicatorScore = 1.00;
              } else {
                contextIndicatorScore = 0.20;
              }
            }
          } else if (cand.spanZh === "重") {
            if (/如泰山|重如|伤|创|量|重沉|万斤|千斤/.test(textZh)) {
              contextIndicatorScore = cand.candidateVi === "nặng" ? 1.00 : 0.10;
            } else if (/重整|重新|重逢|重聚|重见|重出/.test(textZh)) {
              contextIndicatorScore = (cand.candidateVi === "lại" || cand.candidateVi === "chấn chỉnh lại") ? 1.00 : 0.10;
            } else if (/九重|三重|重天|重叠/.test(textZh)) {
              contextIndicatorScore = cand.candidateVi === "trùng" ? 1.00 : 0.10;
            }
          } else if (cand.spanZh === "行") {
            if (/一行人|一行|同行/.test(textZh)) {
              contextIndicatorScore = (cand.candidateVi === "đoàn" || cand.candidateVi === "hàng") ? 1.00 : 0.10;
            } else if (/走|行进|行走|潜行|前行/.test(textZh)) {
              contextIndicatorScore = cand.candidateVi === "đi" ? 1.00 : 0.20;
            }
          } else if (cand.spanZh === "幽幽") {
            if (/茶香|清香|花香|香气|药香|暗香|茶|花|泉/.test(textZh) || primaryDomain === "ZEN_TEA") {
              contextIndicatorScore = (cand.candidateVi === "thoang thoảng" || cand.candidateVi === "phảng phất") ? 1.00 : 0.10;
            } else if (/叹|语|声|古刹|冷风|鬼火|阴森|幽暗/.test(textZh)) {
              contextIndicatorScore = (cand.candidateVi === "u u" || cand.candidateVi === "khẽ") ? 1.00 : 0.20;
            }
          } else if (cand.spanZh === "轰然") {
            if (/劈下|倒下|破裂|爆发|降临|镇压|炸开|作响|巨响|雷劫|崩塌/.test(textZh) || primaryDomain === "TRIBULATION" || primaryDomain === "COMBAT") {
              contextIndicatorScore = cand.candidateVi === "ầm ầm" ? 1.00 : 0.30;
            }
          } else if (cand.spanZh === "包在我身上") {
            contextIndicatorScore = 1.00;
          } else if (cand.spanZh === "舞刀弄枪") {
            contextIndicatorScore = 1.00;
          } else if (cand.spanZh === "打入冷宫") {
            contextIndicatorScore = 1.00;
          } else if (cand.spanZh === "九字真言") {
            contextIndicatorScore = 1.00;
          } else if (cand.spanZh === "依窗" || cand.spanZh === "依窗而立") {
            contextIndicatorScore = 1.00;
          } else if (cand.spanZh === "吓得") {
            contextIndicatorScore = 1.00;
          } else if (cand.spanZh === "直往我怀里钻") {
            contextIndicatorScore = 1.00;
          } else if (cand.spanZh === "直往") {
            if (/怀里|钻|深处|去|冲|飞|落|洞/.test(textZh)) {
              contextIndicatorScore = cand.candidateVi === "thẳng vào" ? 1.00 : 0.20;
            }
          } else if (cand.spanZh === "不可不") {
            if (/防|察|戒|留心|慎|虑|备/.test(textZh)) {
              contextIndicatorScore = cand.candidateVi === "nhất định phải" ? 1.00 : 0.20;
            }
          } else if (cand.spanZh === "却于") {
            contextIndicatorScore = 1.00;
          } else if (cand.spanZh === "戏谑道" || cand.spanZh === "干笑道") {
            contextIndicatorScore = 1.00;
          }
        }

        // Check Proper Noun boundary bonus
        if (cand.isProperNoun && cand.segmentation && cand.segmentation.length >= 2) {
          // If proper noun matcher found a multi-character name (e.g. 付宇茜), give it strong structural weight
          contextIndicatorScore = 0.95;
          syntacticCompat = 0.90;
        }

        // Check Semantic Signature Compatibility
        if (sourceSig && cand.semanticSignature) {
          const compat = checkSignatureCompatibility(sourceSig, cand.semanticSignature);
          signatureScore = compat.compatible ? compat.score : 0.10;
        }

        const composite = Number((
          lexicalScore * weights.LEXICAL_SOURCE +
          contextIndicatorScore * weights.CONTEXT_INDICATOR +
          syntacticCompat * weights.SYNTACTIC_COMPAT +
          signatureScore * weights.SIGNATURE_COMPAT
        ).toFixed(3));

        scoredCandidates.push({
          candidate: cand,
          compositeScore: composite,
          breakdown: {
            lexicalScore,
            contextIndicatorScore,
            syntacticCompat,
            signatureScore
          }
        });
      }

      // Sort by composite score descending
      scoredCandidates.sort((a, b) => b.compositeScore - a.compositeScore);

      const top1 = scoredCandidates[0];
      const top2 = scoredCandidates.length > 1 ? scoredCandidates[1] : null;
      const margin = top2 ? Number((top1.compositeScore - top2.compositeScore).toFixed(3)) : 1.0;

      let status = "RESOLVED";
      let method = "CONTEXTUAL_DISAMBIGUATION";

      // Uncertainty / Multi-Factor Abstention Check
      if (top2 && margin < 0.05 && top1.compositeScore < 0.85) {
        status = "AMBIGUOUS";
        method = "ABSTENTION_TIE";
        overallStatus = "AMBIGUOUS";
      } else if (top1.compositeScore < 0.40) {
        status = "LOW_CONFIDENCE";
        method = "ABSTENTION_LOW_EVIDENCE";
        overallStatus = "LOW_CONFIDENCE";
      }

      minConfidence = Math.min(minConfidence, top1.compositeScore);

      resolvedSlots.push({
        spanZh: top1.candidate.spanZh,
        chosenVi: top1.candidate.candidateVi,
        lexicalSource: top1.candidate.lexicalSource,
        confidence: top1.compositeScore,
        method
      });

      const alternatives = scoredCandidates.slice(1).map((item) => ({
        candidate: item.candidate.candidateVi,
        lexicalSource: item.candidate.lexicalSource,
        score: item.compositeScore,
        rejectedBecause: [
          item.breakdown.contextIndicatorScore < 0.3 ? "LOW_CONTEXT_INDICATOR" : null,
          item.breakdown.signatureScore < 0.3 ? "SIGNATURE_POLARITY_MISMATCH" : null,
          margin >= 0.05 ? "LOWER_COMPOSITE_SCORE" : "TIED_MARGIN"
        ].filter(Boolean)
      }));

      resolutionRecords.push(Object.freeze({
        sourceSpan: top1.candidate.spanZh,
        selectedCandidate: top1.candidate.candidateVi,
        status,
        confidence: top1.compositeScore,
        margin,
        method,
        evidence: top1.breakdown,
        alternatives: Object.freeze(alternatives),
        provenance: top1.candidate.provenance
      }));
    }

    return Object.freeze({
      textZh,
      status: overallStatus,
      method: "CONTEXTUAL_DISAMBIGUATION",
      confidence: Number(minConfidence.toFixed(3)),
      resolvedSlots: Object.freeze(resolvedSlots),
      resolutionRecords: Object.freeze(resolutionRecords),
      provenance: "lexical-resolver:contextual"
    });
  }

  return Object.freeze({
    resolveText,
    getCandidateGenerator: () => candidateGenerator
  });
}

module.exports = {
  createLexicalResolver,
  RESOLVER_WEIGHTS
};
