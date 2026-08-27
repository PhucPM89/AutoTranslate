"use strict";

/**
 * Master Semantic Orchestrator (Phase 4)
 * 
 * Unifies the entire Symbolic Literary Translation Engine:
 * 1. Semantic Analysis (Clause Segmentation, Discourse Salience, Dynamic Context Profiling)
 * 2. Stylist Routing & Slot Conflict Resolution
 * 3. Expression Planning (Expansion Budget & Rhythm Governor)
 * 4. 1-Pass Vietnamese Realization with Semantic-Preserving Anti-Repetition & Full Provenance Tracing
 */

const { createSemanticAnalyzer } = require("./semantic-analyzer");
const { createStylistRouter } = require("./stylist-router");
const { createExpressionPlanner } = require("./expression-planner");
const { createVietnameseRealizer } = require("./vietnamese-realizer");

function createSemanticOrchestrator({
  initialEntities = [],
  baselineGenre = "XIANXIA",
  initialDomains = {},
  baseConvertFunction = null
} = {}) {
  const analyzer = createSemanticAnalyzer({ initialEntities, baselineGenre, initialDomains });
  const router = createStylistRouter();
  const planner = createExpressionPlanner({ router });
  const realizer = createVietnameseRealizer({ planner, baseConvertFunction });

  /**
   * Translates a chapter or multi-paragraph text using the full semantic pipeline.
   * 
   * @param {string} text
   * @param {Object} options
   * @returns {{ text: string, analyzedChapter: Object, traces: Array<Object> }}
   */
  function translateChapter(text, options = {}) {
    if (!text || typeof text !== "string") {
      return { text: "", analyzedChapter: null, traces: [] };
    }

    const analyzed = analyzer.analyzeChapter(text);
    const renderedParas = [];
    const allTraces = [];

    for (let pIdx = 0; pIdx < analyzed.paragraphs.length; pIdx++) {
      const para = analyzed.paragraphs[pIdx];
      const contextSnap = para.contextSnapshot;

      const { text: paraText, traces } = realizer.realizeParagraph(para.clauses, contextSnap);
      renderedParas.push(paraText);
      allTraces.push(...traces);
    }

    const finalResult = renderedParas.join("\n\n").trim();

    return Object.freeze({
      text: finalResult,
      analyzedChapter: analyzed,
      traces: Object.freeze(allTraces)
    });
  }

  /**
   * Shadow Mode: Computes baseline translation along with deep lexical resolution analysis.
   * Does NOT alter baseline production output.
   * 
   * @param {string} text
   * @returns {{ baselineOutput: string, lexicalResolutionAnalysis: Object, traces: Array<Object> }}
   */
  function translateShadow(text) {
    if (!text || typeof text !== "string") {
      return { baselineOutput: "", lexicalResolutionAnalysis: null, traces: [] };
    }

    const baselineOutput = baseConvertFunction ? baseConvertFunction(text) : "";
    const analyzed = analyzer.analyzeChapter(text);
    const traces = [];

    for (const para of analyzed.paragraphs) {
      for (const cl of para.clauses) {
        if (cl.lexicalResolution) {
          traces.push(...(cl.lexicalResolution.resolutionRecords || []));
        }
      }
    }

    return Object.freeze({
      baselineOutput,
      lexicalResolutionAnalysis: analyzed,
      traces: Object.freeze(traces)
    });
  }

  function translateLine(line) {
    if (!line || typeof line !== "string") return "";
    const { text } = translateChapter(line);
    return text;
  }

  return Object.freeze({
    translateChapter,
    translateLine,
    translateShadow,
    getAnalyzer: () => analyzer,
    getRouter: () => router,
    getPlanner: () => planner,
    getRealizer: () => realizer
  });
}

module.exports = {
  createSemanticOrchestrator
};
