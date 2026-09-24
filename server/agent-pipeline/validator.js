"use strict";

const { hashContent } = require("./segmenter");

class IntegrityValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "IntegrityValidationError";
    this.details = details;
  }
}

/**
 * Extracts tagged paragraphs from translation text.
 * Expects <P001>content</P001> ... <Pxxx>content</Pxxx>
 */
function parseTaggedTranslation(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new IntegrityValidationError("Empty translation text provided");
  }

  const regex = /<P(\d+)>([\s\S]*?)<\/P\1>/gi;
  const items = [];
  const seenIndexes = new Set();
  const duplicateIndexes = [];

  let match;
  while ((match = regex.exec(text)) !== null) {
    const index = parseInt(match[1], 10);
    const content = match[2].trim();

    if (seenIndexes.has(index)) {
      duplicateIndexes.push(index);
    }
    seenIndexes.add(index);
    items.push({ index, content });
  }

  return {
    items,
    seenIndexes: Array.from(seenIndexes),
    duplicateIndexes
  };
}

/**
 * Validates a single batch translation against expected input paragraphs.
 */
function validateBatchTranslation({
  batch,
  rawOutput
}) {
  const expectedParagraphs = batch.paragraphs || [];
  const expectedCount = expectedParagraphs.length;
  if (expectedCount === 0) {
    return { valid: true, paragraphs: [] };
  }

  const parsed = parseTaggedTranslation(rawOutput);

  // 1. Check duplicate IDs
  if (parsed.duplicateIndexes.length > 0) {
    throw new IntegrityValidationError(
      `Duplicate paragraph IDs found in batch ${batch.batchIndex}: ${parsed.duplicateIndexes.join(", ")}`,
      { duplicateIndexes: parsed.duplicateIndexes }
    );
  }

  // 2. Map items by index
  const itemMap = new Map(parsed.items.map(it => [it.index, it.content]));

  // 3. Verify every expected paragraph exists
  const missingIndexes = [];
  const emptyIndexes = [];
  const untranslatedIndexes = [];

  const validatedParagraphs = [];

  for (const exp of expectedParagraphs) {
    const content = itemMap.get(exp.index);
    if (content === undefined) {
      missingIndexes.push(exp.index);
      continue;
    }
    if (!content.trim()) {
      emptyIndexes.push(exp.index);
      continue;
    }

    // Check for high percentage of residual Chinese in translated text (if source was mostly Chinese)
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    if (chineseChars > 20 && chineseChars / content.length > 0.45) {
      untranslatedIndexes.push(exp.index);
    }

    validatedParagraphs.push({
      index: exp.index,
      source: exp.source,
      translation: content.trim()
    });
  }

  if (missingIndexes.length > 0) {
    throw new IntegrityValidationError(
      `Missing paragraph IDs in batch ${batch.batchIndex}: ${missingIndexes.join(", ")}`,
      { missingIndexes }
    );
  }

  if (emptyIndexes.length > 0) {
    throw new IntegrityValidationError(
      `Empty translation paragraphs in batch ${batch.batchIndex}: ${emptyIndexes.join(", ")}`,
      { emptyIndexes }
    );
  }

  if (untranslatedIndexes.length > 0) {
    throw new IntegrityValidationError(
      `Untranslated Chinese paragraphs detected in batch ${batch.batchIndex}: ${untranslatedIndexes.join(", ")}`,
      { untranslatedIndexes }
    );
  }

  // 4. Verify order
  for (let i = 0; i < validatedParagraphs.length; i++) {
    if (validatedParagraphs[i].index !== expectedParagraphs[i].index) {
      throw new IntegrityValidationError(
        `Paragraph order mismatch at position ${i}: expected P${expectedParagraphs[i].index}, got P${validatedParagraphs[i].index}`
      );
    }
  }

  return {
    valid: true,
    batchIndex: batch.batchIndex,
    paragraphs: validatedParagraphs,
    translationHash: hashContent(validatedParagraphs.map(p => p.translation))
  };
}

/**
 * Validates the complete assembled chapter before putting to R2.
 */
function validateFullChapterIntegrity({
  bookId,
  chapterNumber,
  title,
  originalParagraphs,
  translatedParagraphs,
  expectedSourceHash
}) {
  if (!bookId || !chapterNumber) {
    throw new IntegrityValidationError("Missing bookId or chapterNumber in chapter validation");
  }
  if (!title || !title.trim()) {
    throw new IntegrityValidationError(`Missing chapter title for chapter ${chapterNumber}`);
  }

  const origCount = originalParagraphs.length;
  const transCount = translatedParagraphs.length;

  if (origCount === 0 || transCount === 0) {
    throw new IntegrityValidationError(`Zero paragraphs in chapter ${chapterNumber}: orig=${origCount}, trans=${transCount}`);
  }

  if (origCount !== transCount) {
    throw new IntegrityValidationError(
      `Paragraph count mismatch in chapter ${chapterNumber}: original has ${origCount}, translated has ${transCount}`
    );
  }

  if (expectedSourceHash) {
    const actualSourceHash = hashContent(originalParagraphs);
    if (actualSourceHash !== expectedSourceHash) {
      throw new IntegrityValidationError(
        `Source hash mismatch in chapter ${chapterNumber}: expected ${expectedSourceHash}, got ${actualSourceHash}`
      );
    }
  }

  // Check strict sequence 1..N
  for (let i = 0; i < transCount; i++) {
    const p = translatedParagraphs[i];
    const expectedIndex = i + 1;
    if (p.index !== expectedIndex) {
      throw new IntegrityValidationError(
        `Sequential gap in translated paragraphs at index ${i}: expected P${expectedIndex}, got P${p.index}`
      );
    }
    if (!p.translation || !p.translation.trim()) {
      throw new IntegrityValidationError(`Paragraph P${p.index} has empty translation`);
    }
  }

  // Build clean markdown content
  const cleanTitle = title.replace(/^#+\s*/, "").trim();
  const assembledLines = [`# ${cleanTitle}`, ""];
  for (const p of translatedParagraphs) {
    assembledLines.push(p.translation.trim());
    assembledLines.push("");
  }
  const assembledContent = assembledLines.join("\n").trim();

  return {
    valid: true,
    title: cleanTitle,
    assembledContent,
    totalParagraphs: transCount,
    characters: assembledContent.length,
    assembledHash: hashContent(assembledContent)
  };
}

module.exports = {
  IntegrityValidationError,
  parseTaggedTranslation,
  validateBatchTranslation,
  validateFullChapterIntegrity
};

