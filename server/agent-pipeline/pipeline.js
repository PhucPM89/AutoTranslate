"use strict";

const { extractParagraphs, hashContent, createAdaptiveBatches } = require("./segmenter");
const { buildBatchPrompt } = require("./context-builder");
const { validateBatchTranslation, validateFullChapterIntegrity } = require("./validator");
const { StoryStateManager } = require("./story-state");
const { CacheManager } = require("./cache-manager");
const { CheckpointManager } = require("./checkpoint-manager");
const { R2IOManager } = require("./r2-io");
const { PipelineMetrics } = require("./metrics");

class AgentTranslationPipeline {
  constructor(options = {}) {
    this.bookId = options.bookId || "fanqie-7027679289931729920";
    this.revision = options.revision || 1;
    this.concurrency = options.concurrency || 1;
    this.minBatchSize = options.minBatchSize || 20;
    this.maxBatchSize = options.maxBatchSize || 50;
    this.targetBatchChars = options.targetBatchChars || 3000;

    this.storyStateManager = options.storyStateManager || new StoryStateManager();
    this.cacheManager = options.cacheManager || new CacheManager();
    this.checkpointManager = options.checkpointManager || new CheckpointManager();
    this.r2IO = options.r2IO || new R2IOManager();
    this.metrics = options.metrics || new PipelineMetrics();

    // The translation worker handler: receives ({ prompt, batch, storyState }) => returns translated string
    this.translateBatchFn = options.translateBatchFn || null;
  }

  setTranslateBatchFn(fn) {
    this.translateBatchFn = fn;
  }

  /**
   * Translates a single chapter end-to-end.
   */
  async processChapter({
    chapterNumber,
    bookId = this.bookId,
    revision = this.revision,
    customTitle = null
  }) {
    const startTime = Date.now();

    // Step 1: Trigger background prefetch for the NEXT chapter
    this.r2IO.prefetchNextChapter({ bookId, revision, chapterNumber });

    // Step 2: Fetch current chapter source
    const rawChapter = await this.r2IO.fetchSourceChapter({ bookId, revision, chapterNumber });
    const originalContent = rawChapter.content || "";
    const chapterTitle = (customTitle || rawChapter.title || "").trim();

    // Step 3: Segment into discrete paragraphs & create adaptive batches
    const rawParagraphs = extractParagraphs(originalContent);
    const sourceHash = hashContent(rawParagraphs);

    let adaptiveBatches = createAdaptiveBatches(rawParagraphs, {
      minBatchSize: this.minBatchSize,
      maxBatchSize: this.maxBatchSize,
      targetChars: this.targetBatchChars
    });

    // Step 4: Initialize or resume persistent checkpoint
    let checkpoint = this.checkpointManager.initChapterCheckpoint({
      bookId,
      chapterNumber,
      title: chapterTitle,
      sourceHash,
      batches: adaptiveBatches
    });

    const storyState = this.storyStateManager.loadState(bookId);
    const stateVersion = storyState.version || 1;

    // Step 5: Process each batch sequentially
    for (let bIdx = 0; bIdx < adaptiveBatches.length; bIdx++) {
      const batch = adaptiveBatches[bIdx];
      const cpBatch = checkpoint.batches.find(b => b.batchIndex === batch.batchIndex);

      // Skip if already completed in checkpoint
      if (cpBatch && cpBatch.status === "completed" && Array.isArray(cpBatch.translatedParagraphs)) {
        // Hydrate batch paragraphs
        batch.paragraphs = cpBatch.translatedParagraphs;
        continue;
      }

      // Check Cache
      const cacheKey = this.cacheManager.computeCacheKey({
        sourceHash: batch.sourceHash,
        modelVersion: "agent-runtime-v1",
        promptVersion: "agent-prompt-v2",
        storyStateVersion: String(stateVersion)
      });

      const cachedEntry = this.cacheManager.get(cacheKey);
      let batchTranslationText = "";
      let isCacheHit = false;

      const batchStartTime = Date.now();

      let promptPayload = null;

      if (cachedEntry && cachedEntry.data?.rawOutput) {
        batchTranslationText = cachedEntry.data.rawOutput;
        isCacheHit = true;
      } else {
        // Build prompt with context
        promptPayload = buildBatchPrompt({
          batch,
          allBatches: adaptiveBatches,
          storyState,
          storyStateManager: this.storyStateManager
        });

        if (!this.translateBatchFn) {
          throw new Error("No translateBatchFn registered. The agent runtime must supply a translation worker function.");
        }

        // Execute translation via registered agent worker
        let retryCount = 0;
        let success = false;
        let lastError = null;

        while (!success && retryCount <= 2) {
          try {
            batchTranslationText = await this.translateBatchFn({
              prompt: promptPayload.prompt,
              batch,
              storyState,
              retryCount
            });
            success = true;
          } catch (err) {
            retryCount++;
            lastError = err;
            if (retryCount <= 2) {
              // Adaptive downsizing on failure: target half batch if possible
              this.metrics.recordBatchExecution({ latencyMs: 0, estimatedTokens: 0, isCacheHit: false, isRetry: true });
            }
          }
        }

        if (!success) {
          this.metrics.recordFailure();
          throw new Error(`Batch ${batch.batchIndex} translation failed after retries: ${lastError?.message}`);
        }
      }

      // Validate batch integrity
      const validationRes = validateBatchTranslation({
        batch,
        rawOutput: batchTranslationText
      });

      // Update in-memory batch with translated paragraphs
      batch.paragraphs = validationRes.paragraphs;

      // Persist to cache
      if (!isCacheHit) {
        this.cacheManager.set(cacheKey, {
          rawOutput: batchTranslationText,
          paragraphs: validationRes.paragraphs,
          translationHash: validationRes.translationHash
        });
      }

      // Persist to checkpoint
      checkpoint = this.checkpointManager.recordBatchSuccess({
        bookId,
        chapterNumber,
        batchIndex: batch.batchIndex,
        translationHash: validationRes.translationHash,
        translatedParagraphs: validationRes.paragraphs
      });

      const batchDuration = Date.now() - batchStartTime;
      const estimatedTokens = Math.round((promptPayload?.prompt?.length || batch.totalChars) / 2);
      this.metrics.recordBatchExecution({
        latencyMs: batchDuration,
        estimatedTokens,
        isCacheHit
      });
    }

    // Step 6: Assemble all completed batches
    const allTranslatedParagraphs = this.checkpointManager.getAllCompletedParagraphs(checkpoint);

    // Full Chapter Integrity Validation
    const fullValidation = validateFullChapterIntegrity({
      bookId,
      chapterNumber,
      title: chapterTitle,
      originalParagraphs: rawParagraphs,
      translatedParagraphs: allTranslatedParagraphs,
      expectedSourceHash: sourceHash
    });

    // Step 7: Atomic single PUT to R2
    const publishResult = await this.r2IO.publishChapterAtomic({
      bookId,
      revision,
      chapterNumber,
      title: fullValidation.title,
      assembledContent: fullValidation.assembledContent,
      characters: fullValidation.characters,
      metadata: {
        provider: "antigravity-agent",
        model: "agent-runtime",
        translationVersion: "agent-pipeline-v2"
      }
    });

    // Mark checkpoint completed
    this.checkpointManager.markChapterCompleted(bookId, chapterNumber, {
      characters: fullValidation.characters,
      totalParagraphs: fullValidation.totalParagraphs,
      assembledHash: fullValidation.assembledHash
    });

    this.metrics.recordChapterCompletion({
      paragraphsCount: fullValidation.totalParagraphs,
      characterCount: fullValidation.characters
    });

    return {
      success: true,
      bookId,
      chapterNumber,
      title: fullValidation.title,
      characters: fullValidation.characters,
      paragraphsCount: fullValidation.totalParagraphs,
      durationMs: Date.now() - startTime,
      publishResult
    };
  }

  /**
   * Process a list or queue of chapters.
   */
  async processQueue(chapterList = []) {
    const results = [];
    for (const chNum of chapterList) {
      try {
        const res = await this.processChapter({ chapterNumber: chNum });
        results.push(res);
      } catch (err) {
        results.push({
          success: false,
          chapterNumber: chNum,
          error: err.message
        });
      }
    }
    return {
      results,
      metrics: this.metrics.getReport(this.r2IO.getMetrics())
    };
  }

  getMetricsReport() {
    return this.metrics.getReport(this.r2IO.getMetrics());
  }
}

module.exports = {
  AgentTranslationPipeline
};
