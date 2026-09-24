"use strict";

const fs = require("node:fs");
const path = require("node:path");

class CheckpointManager {
  constructor({ checkpointDir = path.resolve(process.cwd(), ".cache", "checkpoints") } = {}) {
    this.checkpointDir = checkpointDir;
    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true });
    }
  }

  getCheckpointPath(bookId, chapterNumber) {
    const safeBookId = bookId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const dir = path.join(this.checkpointDir, safeBookId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${chapterNumber}.json`);
  }

  loadCheckpoint(bookId, chapterNumber) {
    const file = this.getCheckpointPath(bookId, chapterNumber);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  }

  initChapterCheckpoint({
    bookId,
    chapterNumber,
    title,
    sourceHash,
    batches
  }) {
    const existing = this.loadCheckpoint(bookId, chapterNumber);
    if (existing && existing.sourceHash === sourceHash) {
      return existing;
    }

    const checkpoint = {
      bookId,
      chapterNumber,
      title: title || "",
      sourceHash,
      status: "in_progress", // "in_progress" | "completed" | "failed"
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      batches: batches.map(b => ({
        batchIndex: b.batchIndex,
        startIndex: b.startIndex,
        endIndex: b.endIndex,
        sourceHash: b.sourceHash,
        translationHash: null,
        status: "pending", // "pending" | "completed" | "failed"
        translatedParagraphs: null
      }))
    };

    this.saveCheckpoint(checkpoint);
    return checkpoint;
  }

  saveCheckpoint(checkpoint) {
    checkpoint.updatedAt = new Date().toISOString();
    const file = this.getCheckpointPath(checkpoint.bookId, checkpoint.chapterNumber);
    fs.writeFileSync(file, JSON.stringify(checkpoint, null, 2), "utf8");
    return checkpoint;
  }

  recordBatchSuccess({
    bookId,
    chapterNumber,
    batchIndex,
    translationHash,
    translatedParagraphs
  }) {
    const checkpoint = this.loadCheckpoint(bookId, chapterNumber);
    if (!checkpoint) {
      throw new Error(`Cannot record batch success: checkpoint not found for chapter ${chapterNumber}`);
    }

    const target = checkpoint.batches.find(b => b.batchIndex === batchIndex);
    if (!target) {
      throw new Error(`Batch ${batchIndex} not found in chapter ${chapterNumber} checkpoint`);
    }

    target.status = "completed";
    target.translationHash = translationHash;
    target.translatedParagraphs = translatedParagraphs;

    // Check if all batches are completed
    const allCompleted = checkpoint.batches.every(b => b.status === "completed");
    if (allCompleted) {
      checkpoint.status = "ready_for_assembly";
    }

    return this.saveCheckpoint(checkpoint);
  }

  markChapterCompleted(bookId, chapterNumber, metadata = {}) {
    const checkpoint = this.loadCheckpoint(bookId, chapterNumber);
    if (checkpoint) {
      checkpoint.status = "completed";
      checkpoint.completedAt = new Date().toISOString();
      checkpoint.metadata = metadata;
      this.saveCheckpoint(checkpoint);
    }
  }

  getFirstPendingBatch(checkpoint) {
    if (!checkpoint || !Array.isArray(checkpoint.batches)) return null;
    return checkpoint.batches.find(b => b.status !== "completed") || null;
  }

  getAllCompletedParagraphs(checkpoint) {
    if (!checkpoint || !Array.isArray(checkpoint.batches)) return [];
    const allParagraphs = [];
    for (const b of checkpoint.batches) {
      if (b.status === "completed" && Array.isArray(b.translatedParagraphs)) {
        allParagraphs.push(...b.translatedParagraphs);
      }
    }
    return allParagraphs.sort((a, b) => a.index - b.index);
  }
}

module.exports = {
  CheckpointManager
};

