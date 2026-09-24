"use strict";

class PipelineMetrics {
  constructor() {
    this.startTime = Date.now();
    this.completedChapters = 0;
    this.completedBatches = 0;
    this.totalBatchLatencyMs = 0;
    this.totalEstimatedTokens = 0;
    this.retries = 0;
    this.failures = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  recordBatchExecution({ latencyMs = 0, estimatedTokens = 0, isCacheHit = false, isRetry = false }) {
    this.completedBatches++;
    this.totalBatchLatencyMs += latencyMs;
    this.totalEstimatedTokens += estimatedTokens;
    if (isCacheHit) this.cacheHits++;
    else this.cacheMisses++;
    if (isRetry) this.retries++;
  }

  recordChapterCompletion({ paragraphsCount = 0, characterCount = 0 }) {
    this.completedChapters++;
  }

  recordFailure() {
    this.failures++;
  }

  getReport(ioMetrics = {}) {
    const elapsedSeconds = Math.max(1, (Date.now() - this.startTime) / 1000);
    const elapsedHours = elapsedSeconds / 3600;

    const chaptersPerHour = Number((this.completedChapters / elapsedHours).toFixed(2));
    const jobsPerHour = Number((this.completedBatches / elapsedHours).toFixed(2));
    const avgBatchLatencyMs = this.completedBatches > 0
      ? Math.round(this.totalBatchLatencyMs / this.completedBatches)
      : 0;
    const avgTokensPerChapter = this.completedChapters > 0
      ? Math.round(this.totalEstimatedTokens / this.completedChapters)
      : (this.completedBatches > 0 ? Math.round(this.totalEstimatedTokens / this.completedBatches * 3) : 0);

    const totalCacheReqs = this.cacheHits + this.cacheMisses;
    const cacheHitRate = totalCacheReqs > 0 ? Number((this.cacheHits / totalCacheReqs).toFixed(4)) : 0;

    const retriesPerChapter = this.completedChapters > 0
      ? Number((this.retries / this.completedChapters).toFixed(2))
      : this.retries;

    const totalAttempts = this.completedBatches + this.failures;
    const failureRate = totalAttempts > 0 ? Number((this.failures / totalAttempts).toFixed(4)) : 0;

    return {
      uptimeSeconds: Math.round(elapsedSeconds),
      completedChapters: this.completedChapters,
      completedBatches: this.completedBatches,
      chaptersPerHour,
      jobsPerHour,
      averageBatchLatencyMs: avgBatchLatencyMs,
      averageTokensPerChapter: avgTokensPerChapter,
      cacheHitRate,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      retriesPerChapter,
      totalRetries: this.retries,
      failureRate,
      totalFailures: this.failures,
      r2GetCount: ioMetrics.r2GetCount || 0,
      r2PutCount: ioMetrics.r2PutCount || 0
    };
  }
}

module.exports = {
  PipelineMetrics
};

