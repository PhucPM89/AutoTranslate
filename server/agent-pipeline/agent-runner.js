"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { AgentTranslationPipeline } = require("./pipeline");
const { StoryStateManager } = require("./story-state");
const { CheckpointManager } = require("./checkpoint-manager");

/**
 * High-fidelity agent runner that coordinates translation tasks.
 */
class AgentRunner {
  constructor(options = {}) {
    this.pipeline = new AgentTranslationPipeline(options);
    this.bookId = options.bookId || "fanqie-7027679289931729920";
    this.revision = options.revision || 1;
    this.taskQueueDir = options.taskQueueDir || path.resolve(process.cwd(), ".cache", "agent-tasks");

    if (!fs.existsSync(this.taskQueueDir)) {
      fs.mkdirSync(this.taskQueueDir, { recursive: true });
    }
  }

  /**
   * Generates a pending batch task file for the agent to inspect or translate.
   */
  createAgentTaskFile(taskData) {
    const filename = `task-${taskData.bookId}-${taskData.chapterNumber}-b${taskData.batchIndex}.json`;
    const filePath = path.join(this.taskQueueDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(taskData, null, 2), "utf8");
    return filePath;
  }

  /**
   * Attaches a custom translation handler to the pipeline.
   */
  registerTranslator(fn) {
    this.pipeline.setTranslateBatchFn(fn);
  }

  async runChapter(chapterNumber) {
    return this.pipeline.processChapter({
      bookId: this.bookId,
      revision: this.revision,
      chapterNumber
    });
  }

  async runQueue(chapterNumbers) {
    return this.pipeline.processQueue(chapterNumbers);
  }

  getMetrics() {
    return this.pipeline.getMetricsReport();
  }
}

module.exports = {
  AgentRunner
};

