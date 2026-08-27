"use strict";

/**
 * Master Semantic Analyzer (Phase 1 Coordinator)
 * 
 * Orchestrates the full symbolic analysis pipeline:
 * 1. Clause Segmentation (Roles, Pro-drop, Serial actions, Topic-comment)
 * 2. Entity & Discourse Tracking (Salience stack, POV, Pronoun resolution, Multi-factor abstention)
 * 3. Dynamic Context Profiling (Multi-domain distribution, Syntactic damping, Shock detection)
 * 
 * Produces structured `AnalyzedChapter` and `ProvenanceTrace` records.
 * STRICT INVARIANT: Read-only analysis — does NOT alter existing translation realization.
 */

const { segmentParagraphToClauseIRs } = require("./clause-segmenter");
const { createDiscourseTracker } = require("./entity-discourse-tracker");
const { createContextProfiler } = require("./dynamic-context-profiler");
const { createLexicalResolver } = require("./lexical-resolver");
const { createProvenanceTrace } = require("./contracts");

/**
 * Creates a Master SemanticAnalyzer instance.
 */
function createSemanticAnalyzer({
  initialEntities = [],
  baselineGenre = "XIANXIA",
  initialDomains = {},
  lexicalResolver = createLexicalResolver()
} = {}) {
  const discourseTracker = createDiscourseTracker({ initialEntities });
  const contextProfiler = createContextProfiler({ baselineGenre, initialDomains });

  const provenanceLog = [];

  /**
   * Analyzes a single paragraph of Chinese text.
   * 
   * @param {string} paraText
   * @param {Object} options
   * @returns {Object} AnalyzedParagraph
   */
  function analyzeParagraph(paraText, { paraIndex = 0 } = {}) {
    const rawClauses = segmentParagraphToClauseIRs(paraText, { paraIndex });
    const analyzedClauses = [];

    for (let cIdx = 0; cIdx < rawClauses.length; cIdx++) {
      const rawClause = rawClauses[cIdx];

      // 1. Update dynamic context
      const contextSnap = contextProfiler.updateContext(rawClause);

      // 2. Populate discourse onto ClauseIR
      const populatedClause = discourseTracker.populateClauseDiscourse(rawClause, {
        clauseIndex: cIdx
      });

      // 3. Resolve lexical candidates in context
      const lexicalRes = lexicalResolver.resolveText(
        rawClause.sourceZh,
        contextSnap,
        discourseTracker.getState(),
        populatedClause
      );

      // 4. Attach context weights & lexical resolution to ClauseIR
      const fullClauseIR = Object.freeze({
        ...populatedClause,
        contextWeights: Object.freeze({ ...contextSnap.domainWeights }),
        lexicalResolution: Object.freeze(lexicalRes)
      });

      // 5. Create Provenance Trace with lexical audit
      const trace = createProvenanceTrace({
        clauseId: fullClauseIR.id,
        sourceZh: fullClauseIR.sourceZh,
        finalVi: "", // Realization happens in Phase 3
        contextSnapshot: contextSnap,
        discourseResolution: {
          status: fullClauseIR.uncertainty ? fullClauseIR.uncertainty.status : "RESOLVED",
          resolvedPronoun: fullClauseIR.subjectSlot ? fullClauseIR.subjectSlot.resolvedPronoun : null,
          flag: fullClauseIR.uncertainty ? fullClauseIR.uncertainty.flag : null
        },
        lexicalAudit: lexicalRes.resolutionRecords || [],
        stylistAudit: [],
        budgetAudit: {
          preserveClauseOrder: fullClauseIR.invariants.preserveClauseOrder,
          allowMetaphor: fullClauseIR.invariants.allowMetaphor
        }
      });

      provenanceLog.push(trace);
      analyzedClauses.push(fullClauseIR);
    }

    return Object.freeze({
      paraIndex,
      sourceText: paraText,
      clauses: Object.freeze(analyzedClauses),
      contextSnapshot: contextProfiler.getContextSnapshot()
    });
  }

  /**
   * Analyzes a full chapter text, paragraph by paragraph.
   * 
   * @param {string} chapterText
   * @returns {Object} AnalyzedChapter
   */
  function analyzeChapter(chapterText) {
    if (!chapterText || typeof chapterText !== "string") {
      return Object.freeze({
        paragraphs: [],
        totalClauses: 0,
        contextSnapshot: contextProfiler.getContextSnapshot()
      });
    }

    const rawParas = chapterText
      .replace(/\r\n/g, "\n")
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const paragraphs = [];
    const allClauses = [];

    for (let pIdx = 0; pIdx < rawParas.length; pIdx++) {
      const analyzedPara = analyzeParagraph(rawParas[pIdx], { paraIndex: pIdx });
      paragraphs.push(analyzedPara);
      allClauses.push(...analyzedPara.clauses);
    }

    return Object.freeze({
      paragraphs: Object.freeze(paragraphs),
      totalClauses: allClauses.length,
      allClauses: Object.freeze(allClauses),
      finalContext: contextProfiler.getContextSnapshot(),
      salienceStack: discourseTracker.getSalienceStack(),
      entityRegistry: discourseTracker.getRegistry()
    });
  }

  return {
    analyzeParagraph,
    analyzeChapter,
    getDiscourseTracker: () => discourseTracker,
    getContextProfiler: () => contextProfiler,
    getProvenanceLog: () => [...provenanceLog]
  };
}

module.exports = {
  createSemanticAnalyzer
};
