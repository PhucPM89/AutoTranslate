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
const { createProvenanceTrace, createSemanticSignature } = require("./contracts");
const { analyzeCognitiveEvent } = require("./cognitive-event-analyzer");
const { analyzeDialogueAct } = require("./dialogue-act-analyzer");

/**
 * Creates a Master SemanticAnalyzer instance.
 */
function createSemanticAnalyzer({
  initialEntities = [],
  baselineGenre = "XIANXIA",
  initialDomains = {},
  initialPOV = "THIRD_PERSON_OMNISCIENT",
  lexicalResolver = createLexicalResolver()
} = {}) {
  const discourseTracker = createDiscourseTracker({ initialEntities, initialPOV });
  const contextProfiler = createContextProfiler({ baselineGenre, initialDomains });

  const provenanceLog = [];

  /**
   * Analyzes a single paragraph of Chinese text.
   * 
   * @param {string} paraText
   * @param {Object} options
   * @returns {Object} AnalyzedParagraph
   */
  function analyzeParagraph(paraText, {
    paraIndex = 0,
    dialogueContext = null,
    dialogueContexts = {}
  } = {}) {
    const rawClauses = segmentParagraphToClauseIRs(paraText, { paraIndex });
    const analyzedClauses = [];

    for (let cIdx = 0; cIdx < rawClauses.length; cIdx++) {
      const rawClause = rawClauses[cIdx];

      // Cognitive semantics are source decisions made by the analyzer, with
      // thinker/referent/POV supplied only by the discourse authority.
      const cognitiveEvent = analyzeCognitiveEvent(rawClause.sourceZh, {
        fallbackRole: rawClause.role,
        discourse: discourseTracker
      });
      const dialogueHint = dialogueContexts[rawClause.id] || dialogueContexts[cIdx] || dialogueContext || {};
      const resolvedDialogueContext = discourseTracker.resolveDialogueContext({
        speakerId: dialogueHint.speakerId || null,
        listenerId: dialogueHint.listenerId || null
      });
      const dialogueAct = analyzeDialogueAct(rawClause.sourceZh, {
        textRole: cognitiveEvent.textRole,
        discourseContext: resolvedDialogueContext,
        contextHints: dialogueHint
      });
      const semanticSignature = dialogueAct.status === "RESOLVED"
        ? createSemanticSignature({
            denotation: `DIALOGUE_ACT_${dialogueAct.dialogueAct}`,
            affectDistribution: dialogueAct.affect.affectDistribution,
            valence: dialogueAct.affect.valence,
            intensity: dialogueAct.affect.intensity,
            register: dialogueAct.register
          })
        : rawClause.semanticSignature;
      const semanticClause = Object.freeze({
        ...rawClause,
        role: cognitiveEvent.textRole,
        semanticSignature,
        cognitiveEvent,
        dialogueAct
      });

      // 1. Update dynamic context
      const contextSnap = contextProfiler.updateContext(semanticClause);

      // 2. Populate discourse onto ClauseIR
      const populatedClause = discourseTracker.populateClauseDiscourse(semanticClause, {
        clauseIndex: cIdx
      });

      // 3. Resolve lexical candidates in context
      const lexicalRes = lexicalResolver.resolveText(
        semanticClause.sourceZh,
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
          flag: fullClauseIR.uncertainty ? fullClauseIR.uncertainty.flag : null,
          speaker: dialogueAct.speaker,
          listener: dialogueAct.listener,
          relationship: dialogueAct.relationship
        },
        lexicalAudit: lexicalRes.resolutionRecords || [],
        cognitiveAudit: {
          sourceSpan: cognitiveEvent.sourceSpan,
          textRole: cognitiveEvent.textRole,
          cognitiveEventKind: cognitiveEvent.kind,
          speaker: cognitiveEvent.speaker,
          thinker: cognitiveEvent.thinker,
          referent: cognitiveEvent.referent,
          pov: cognitiveEvent.pov,
          emotion: cognitiveEvent.emotion,
          candidate: cognitiveEvent.candidate,
          confidence: cognitiveEvent.confidence,
          status: cognitiveEvent.status,
          reason: cognitiveEvent.reason,
          constraints: cognitiveEvent.constraints
        },
        dialogueAudit: {
          sourceSpan: dialogueAct.sourceSpan,
          textRole: dialogueAct.textRole,
          speaker: dialogueAct.speaker,
          listener: dialogueAct.listener,
          relationship: dialogueAct.relationship,
          dialogueAct: dialogueAct.dialogueAct,
          affect: dialogueAct.affect,
          register: dialogueAct.register,
          candidate: dialogueAct.candidate,
          confidence: dialogueAct.confidence,
          status: dialogueAct.status,
          reason: dialogueAct.reason,
          constraints: dialogueAct.constraints
        },
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
  function analyzeChapter(chapterText, {
    dialogueContext = null,
    dialogueContexts = {}
  } = {}) {
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
      const paragraphDialogueContexts = dialogueContexts[pIdx] || {};
      const analyzedPara = analyzeParagraph(rawParas[pIdx], {
        paraIndex: pIdx,
        dialogueContext: paragraphDialogueContexts.default || dialogueContext,
        dialogueContexts: paragraphDialogueContexts.clauses || paragraphDialogueContexts
      });
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
