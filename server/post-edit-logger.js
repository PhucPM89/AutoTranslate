"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Observability & Audit Logger for Neural Post-Editing
 * Provides structured trace logging, metric calculation, and error category analytics.
 */

class PostEditLogger {
  constructor(options = {}) {
    this.bookId = options.bookId || "unknown";
    this.logDir = options.logDir || path.join(process.cwd(), ".cache", "post-edit-logs");
    this.entries = [];
    this.stats = {
      totalSentences: 0,
      passed: 0,
      minorIssues: 0,
      majorIssues: 0,
      criticalIssues: 0,
      ambiguous: 0,
      totalErrorsDetected: 0,
      errorTypes: {},
      totalFixesProposed: 0,
      verifierAccepted: 0,
      verifierRejected: 0,
      verifierRetried: 0,
      unchangedDrafts: 0
    };
  }

  logIntervention({
    chapterNumber,
    sentenceIndex,
    sourceSentence,
    draftSentence,
    context = {},
    evaluation = {},
    errors = [],
    appliedFixes = [],
    verifierResult = {},
    finalSentence,
    processingTimeMs = 0
  }) {
    const entry = {
      timestamp: new Date().toISOString(),
      bookId: this.bookId,
      chapterNumber,
      sentenceIndex,
      sourceSentence,
      draftSentence,
      contextPrev: context.prevSentences || [],
      contextNext: context.nextSentences || [],
      evaluation,
      errors,
      appliedFixes,
      verifierVerdict: verifierResult.verdict || "ACCEPT",
      verifierChecks: verifierResult.checks || {},
      rejectionReason: verifierResult.rejection_reason || "",
      finalSentence,
      wasModified: draftSentence !== finalSentence,
      processingTimeMs
    };

    this.entries.push(entry);

    // Update stats
    this.stats.totalSentences += 1;
    const status = evaluation.status || "PASS";
    if (status === "PASS") this.stats.passed += 1;
    else if (status === "MINOR_ISSUE") this.stats.minorIssues += 1;
    else if (status === "MAJOR_ISSUE") this.stats.majorIssues += 1;
    else if (status === "CRITICAL_ISSUE") this.stats.criticalIssues += 1;
    else if (status === "AMBIGUOUS") this.stats.ambiguous += 1;

    if (!entry.wasModified) this.stats.unchangedDrafts += 1;

    for (const err of errors) {
      this.stats.totalErrorsDetected += 1;
      const types = Array.isArray(err.error_types) ? err.error_types : [err.error_type || "UNKNOWN"];
      for (const t of types) {
        this.stats.errorTypes[t] = (this.stats.errorTypes[t] || 0) + 1;
      }
    }

    if (appliedFixes.length > 0) {
      this.stats.totalFixesProposed += appliedFixes.length;
      if (entry.verifierVerdict === "ACCEPT") this.stats.verifierAccepted += 1;
      else if (entry.verifierVerdict === "REJECT") this.stats.verifierRejected += 1;
      else if (entry.verifierVerdict === "RETRY_EXPANDED") this.stats.verifierRetried += 1;
    }

    return entry;
  }

  getSummary() {
    const passRate = this.stats.totalSentences ? (this.stats.passed / this.stats.totalSentences * 100).toFixed(1) : "0.0";
    const preservationRate = this.stats.totalSentences ? (this.stats.unchangedDrafts / this.stats.totalSentences * 100).toFixed(1) : "0.0";
    const rejectRate = this.stats.totalFixesProposed ? (this.stats.verifierRejected / (this.stats.verifierAccepted + this.stats.verifierRejected || 1) * 100).toFixed(1) : "0.0";

    return {
      bookId: this.bookId,
      ...this.stats,
      passRate: `${passRate}%`,
      preservationRate: `${preservationRate}%`,
      verifierRejectRate: `${rejectRate}%`,
      topErrors: Object.entries(this.stats.errorTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    };
  }

  flushToFile(chapterNumber) {
    try {
      fs.mkdirSync(this.logDir, { recursive: true });
      const filename = path.join(this.logDir, `${this.bookId}-ch${chapterNumber}-audit.json`);
      fs.writeFileSync(filename, JSON.stringify({
        summary: this.getSummary(),
        entries: this.entries
      }, null, 2), "utf8");
    } catch (e) {
      console.warn("Could not flush post-edit log to file:", e.message);
    }
  }
}

module.exports = { PostEditLogger };

