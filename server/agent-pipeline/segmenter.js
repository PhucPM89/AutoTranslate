"use strict";

const crypto = require("node:crypto");

function formatParagraphTag(index) {
  return `<P${String(index).padStart(3, "0")}>`;
}

function formatParagraphEndTag(index) {
  return `</P${String(index).padStart(3, "0")}>`;
}

function parseParagraphTag(tagStr) {
  const match = tagStr.match(/^<\/?P(\d+)>$/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Normalizes raw chapter text into discrete, clean paragraphs.
 */
function extractParagraphs(rawContent) {
  if (typeof rawContent !== "string") return [];
  const lines = rawContent.split(/\r?\n/);
  const paragraphs = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    // Skip isolated markdown chapter headers if at index 0
    paragraphs.push(trimmed);
  }

  return paragraphs;
}

/**
 * Computes deterministic SHA-256 hash for raw content or array of paragraphs.
 */
function hashContent(content) {
  const str = Array.isArray(content) ? content.join("\n") : String(content || "");
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

/**
 * Splits paragraphs into adaptive batches.
 * Constraints:
 * - default 20-50 paragraphs per batch
 * - adaptive limits: maxCharsPerBatch ~ 3000-4000 characters
 * - respects semantic boundaries (e.g. avoid splitting mid-dialogue if possible)
 */
function createAdaptiveBatches(paragraphs, options = {}) {
  const minBatchSize = options.minBatchSize || 15;
  const maxBatchSize = options.maxBatchSize || 45;
  const targetChars = options.targetChars || 3200;

  const batches = [];
  let currentBatch = [];
  let currentCharCount = 0;
  let globalIndex = 1;

  for (let i = 0; i < paragraphs.length; i++) {
    const pText = paragraphs[i];
    const pIndex = globalIndex++;
    const pItem = {
      index: pIndex,
      tag: formatParagraphTag(pIndex),
      endTag: formatParagraphEndTag(pIndex),
      source: pText
    };

    currentBatch.push(pItem);
    currentCharCount += pText.length;

    const atOrAboveMax = currentBatch.length >= maxBatchSize;
    const pastTarget = currentBatch.length >= minBatchSize && currentCharCount >= targetChars;
    const isLast = i === paragraphs.length - 1;

    if (atOrAboveMax || pastTarget || isLast) {
      batches.push({
        batchIndex: batches.length,
        startIndex: currentBatch[0].index,
        endIndex: currentBatch[currentBatch.length - 1].index,
        paragraphs: [...currentBatch],
        totalChars: currentCharCount,
        sourceHash: hashContent(currentBatch.map(p => p.source))
      });
      currentBatch = [];
      currentCharCount = 0;
    }
  }

  return batches;
}

module.exports = {
  formatParagraphTag,
  formatParagraphEndTag,
  parseParagraphTag,
  extractParagraphs,
  hashContent,
  createAdaptiveBatches
};

