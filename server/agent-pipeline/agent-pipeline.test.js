"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const {
  formatParagraphTag,
  parseParagraphTag,
  extractParagraphs,
  hashContent,
  createAdaptiveBatches
} = require("./segmenter");

const { StoryStateManager, createEmptyStoryState } = require("./story-state");
const { buildBatchPrompt } = require("./context-builder");
const {
  IntegrityValidationError,
  parseTaggedTranslation,
  validateBatchTranslation,
  validateFullChapterIntegrity
} = require("./validator");

const { CacheManager } = require("./cache-manager");
const { CheckpointManager } = require("./checkpoint-manager");
const { R2IOManager } = require("./r2-io");
const { PipelineMetrics } = require("./metrics");
const { AgentTranslationPipeline } = require("./pipeline");

test("Segmenter: extracts paragraphs and creates adaptive batches with tags", () => {
  const raw = `
    第1章 测试章节

    这是第一段内容。

    这是第二段内容，带有对话：“你好！”

    这是第三段内容。
  `;

  const paragraphs = extractParagraphs(raw);
  assert.equal(paragraphs.length, 4);
  assert.equal(paragraphs[0], "第1章 测试章节");

  const batches = createAdaptiveBatches(paragraphs, { minBatchSize: 2, maxBatchSize: 3, targetChars: 50 });
  assert.ok(batches.length >= 2);
  assert.equal(batches[0].paragraphs[0].tag, "<P001>");
  assert.equal(batches[0].paragraphs[0].endTag, "</P001>");
  assert.equal(batches[0].paragraphs[0].source, "第1章 测试章节");
  assert.equal(parseParagraphTag("<P001>"), 1);
  assert.equal(parseParagraphTag("</P005>"), 5);
});

test("StoryStateManager: maintains compact state, bounds size, updates incrementally", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "story-state-test-"));
  const mgr = new StoryStateManager({ storageDir: tmpDir });
  const bookId = "test-novel";

  const s1 = mgr.loadState(bookId);
  assert.equal(s1.characters.length, 0);

  // Incremental update 1
  mgr.updateIncremental(bookId, {
    characters: [{ name: "Trần Dịch", aliases: ["Dịch Ca"], role: "Nhân vật chính" }],
    terminology: [{ zh: "恶梦币", vi: "Ác Mộng Tệ" }],
    currentScene: "Trần Dịch đang ở căn cứ."
  });

  const s2 = mgr.loadState(bookId);
  assert.equal(s2.characters.length, 1);
  assert.equal(s2.characters[0].name, "Trần Dịch");
  assert.equal(s2.terminology[0].vi, "Ác Mộng Tệ");

  // Incremental update 2: alias merge
  mgr.updateIncremental(bookId, {
    characters: [{ name: "Trần Dịch", aliases: ["Trần tiểu tử"] }]
  });

  const s3 = mgr.loadState(bookId);
  assert.equal(s3.characters.length, 1);
  assert.ok(s3.characters[0].aliases.includes("Dịch Ca"));
  assert.ok(s3.characters[0].aliases.includes("Trần tiểu tử"));

  // Check state hash
  const hash1 = mgr.computeStateHash(s3);
  assert.ok(typeof hash1 === "string" && hash1.length === 16);

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("ContextBuilder: builds prompt with previous context, next context, and story state", () => {
  const batch1 = {
    batchIndex: 0,
    startIndex: 1,
    endIndex: 2,
    paragraphs: [
      { index: 1, source: "段落一", translation: "Đoạn một." },
      { index: 2, source: "段落二", translation: "Đoạn hai." }
    ]
  };

  const batch2 = {
    batchIndex: 1,
    startIndex: 3,
    endIndex: 4,
    paragraphs: [
      { index: 3, source: "段落三" },
      { index: 4, source: "段落四" }
    ]
  };

  const batch3 = {
    batchIndex: 2,
    startIndex: 5,
    endIndex: 6,
    paragraphs: [
      { index: 5, source: "段落五" },
      { index: 6, source: "段落六" }
    ]
  };

  const promptRes = buildBatchPrompt({
    batch: batch2,
    allBatches: [batch1, batch2, batch3],
    storyState: { characters: [{ name: "Trần Dịch", role: "Nhân vật chính" }] },
    storyStateManager: new StoryStateManager()
  });

  assert.ok(promptRes.prompt.includes("<P003>段落三</P003>"));
  assert.ok(promptRes.prompt.includes("<P004>段落四</P004>"));
  assert.ok(promptRes.prompt.includes("=== NGỮ CẢNH TRƯỚC ĐÓ"));
  assert.ok(promptRes.prompt.includes("[P002]: Đoạn hai."));
  assert.ok(promptRes.prompt.includes("=== ĐOẠN KẾ TIẾP"));
  assert.ok(promptRes.prompt.includes("[P005]: 段落五"));
  assert.ok(promptRes.prompt.includes("Semantic Fidelity"));
});

test("Validator: validates tagged output and catches integrity issues", () => {
  const batch = {
    batchIndex: 0,
    paragraphs: [
      { index: 1, source: "苹果" },
      { index: 2, source: "香蕉" }
    ]
  };

  // Valid output
  const validOutput = "<P001>Quả táo</P001>\n<P002>Quả chuối</P002>";
  const res = validateBatchTranslation({ batch, rawOutput: validOutput });
  assert.equal(res.valid, true);
  assert.equal(res.paragraphs.length, 2);
  assert.equal(res.paragraphs[0].translation, "Quả táo");

  // Missing paragraph P002
  const missingOutput = "<P001>Quả táo</P001>";
  assert.throws(() => {
    validateBatchTranslation({ batch, rawOutput: missingOutput });
  }, /Missing paragraph IDs/);

  // Duplicate ID
  const dupOutput = "<P001>Quả táo</P001>\n<P001>Quả táo nữa</P001>\n<P002>Quả chuối</P002>";
  assert.throws(() => {
    validateBatchTranslation({ batch, rawOutput: dupOutput });
  }, /Duplicate paragraph IDs/);

  // Empty translation
  const emptyOutput = "<P001>Quả táo</P001>\n<P002></P002>";
  assert.throws(() => {
    validateBatchTranslation({ batch, rawOutput: emptyOutput });
  }, /Empty translation paragraphs/);
});

test("Validator: validates full chapter integrity before R2 PUT", () => {
  const origParagraphs = ["段落1", "段落2"];
  const transParagraphs = [
    { index: 1, source: "段落1", translation: "Đoạn 1." },
    { index: 2, source: "段落2", translation: "Đoạn 2." }
  ];
  const sourceHash = hashContent(origParagraphs);

  const fullRes = validateFullChapterIntegrity({
    bookId: "book-1",
    chapterNumber: 10,
    title: "Chương 10: Khởi Đầu",
    originalParagraphs: origParagraphs,
    translatedParagraphs: transParagraphs,
    expectedSourceHash: sourceHash
  });

  assert.equal(fullRes.valid, true);
  assert.ok(fullRes.assembledContent.includes("# Chương 10: Khởi Đầu"));
  assert.ok(fullRes.assembledContent.includes("Đoạn 1."));
  assert.ok(fullRes.assembledContent.includes("Đoạn 2."));
  assert.equal(fullRes.totalParagraphs, 2);

  // Count mismatch test
  assert.throws(() => {
    validateFullChapterIntegrity({
      bookId: "book-1",
      chapterNumber: 10,
      title: "Chương 10",
      originalParagraphs: origParagraphs,
      translatedParagraphs: transParagraphs.slice(0, 1),
      expectedSourceHash: sourceHash
    });
  }, /Paragraph count mismatch/);
});

test("CacheManager: caches translations by composite key and survives restarts", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cache-mgr-test-"));
  const cacheMgr = new CacheManager({ cacheDir: tmpDir });

  const key = cacheMgr.computeCacheKey({
    sourceHash: "abc123hash",
    modelVersion: "test-model-v1",
    promptVersion: "v1",
    storyStateVersion: "1"
  });

  assert.equal(cacheMgr.get(key), null);

  cacheMgr.set(key, { rawOutput: "<P001>Bản dịch</P001>" });
  const hit = cacheMgr.get(key);
  assert.equal(hit.data.rawOutput, "<P001>Bản dịch</P001>");

  // Restart simulation: instantiate new CacheManager pointing to same directory
  const cacheMgr2 = new CacheManager({ cacheDir: tmpDir });
  const hit2 = cacheMgr2.get(key);
  assert.equal(hit2.data.rawOutput, "<P001>Bản dịch</P001>");

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("CheckpointManager: records batch progress and enables resumability", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-mgr-test-"));
  const cpMgr = new CheckpointManager({ checkpointDir: tmpDir });
  const bookId = "test-book";
  const chNum = 5;

  const batches = [
    { batchIndex: 0, startIndex: 1, endIndex: 2, sourceHash: "h0" },
    { batchIndex: 1, startIndex: 3, endIndex: 4, sourceHash: "h1" }
  ];

  const cp = cpMgr.initChapterCheckpoint({
    bookId,
    chapterNumber: chNum,
    title: "Chương 5",
    sourceHash: "orig-hash",
    batches
  });

  assert.equal(cp.batches[0].status, "pending");
  assert.equal(cpMgr.getFirstPendingBatch(cp).batchIndex, 0);

  // Complete batch 0
  cpMgr.recordBatchSuccess({
    bookId,
    chapterNumber: chNum,
    batchIndex: 0,
    translationHash: "trans-h0",
    translatedParagraphs: [
      { index: 1, translation: "Đoạn 1" },
      { index: 2, translation: "Đoạn 2" }
    ]
  });

  // Resume check
  const reloaded = cpMgr.loadCheckpoint(bookId, chNum);
  assert.equal(reloaded.batches[0].status, "completed");
  assert.equal(reloaded.batches[1].status, "pending");
  assert.equal(cpMgr.getFirstPendingBatch(reloaded).batchIndex, 1);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Pipeline: executes end-to-end translation with mock storage and worker", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-test-"));

  // Mock in-memory storage
  const inMemoryStore = new Map();
  const mockStorage = {
    async head(key) {
      if (!inMemoryStore.has(key)) return null;
      return { key, etag: '"mock-etag"' };
    },
    async get(key) {
      return inMemoryStore.get(key) || null;
    },
    async put(key, val) {
      inMemoryStore.set(key, val);
    },
    async list(prefix) {
      return { keys: Array.from(inMemoryStore.keys()).filter(k => k.startsWith(prefix)) };
    }
  };

  const bookId = "pipeline-book-test";
  const chNum = 1;

  // Put source chapter in mock R2
  const sourceContent = `第1章 测试\n\n小黑是一只猫。\n\n大白是一只虎。`;
  inMemoryStore.set(`books/${bookId}/r1/ch/1.json`, JSON.stringify({
    schema: 1,
    bookId,
    revision: 1,
    chapterNumber: chNum,
    title: "第1章 测试",
    content: sourceContent
  }));

  const r2IO = new R2IOManager({
    storage: mockStorage,
    rawCacheDir: path.join(tmpDir, "raw"),
    rollbackDir: path.join(tmpDir, "rollback")
  });

  const cacheMgr = new CacheManager({ cacheDir: path.join(tmpDir, "cache") });
  const cpMgr = new CheckpointManager({ checkpointDir: path.join(tmpDir, "cp") });
  const stateMgr = new StoryStateManager({ storageDir: path.join(tmpDir, "state") });

  const pipeline = new AgentTranslationPipeline({
    bookId,
    revision: 1,
    minBatchSize: 1,
    maxBatchSize: 10,
    r2IO,
    cacheManager: cacheMgr,
    checkpointManager: cpMgr,
    storyStateManager: stateMgr
  });

  // Mock translation function preserving tags
  pipeline.setTranslateBatchFn(async ({ batch }) => {
    return batch.paragraphs.map(p => {
      const trans = p.source.includes("小黑") ? "Tiểu Hắc là một con mèo." :
                    p.source.includes("大白") ? "Đại Bạch là một con hổ." :
                    "Chương 1: Thử Nghiệm";
      return `<P${String(p.index).padStart(3, "0")}>${trans}</P${String(p.index).padStart(3, "0")}>`;
    }).join("\n\n");
  });

  const result = await pipeline.processChapter({ chapterNumber: chNum });
  assert.equal(result.success, true);
  assert.equal(result.paragraphsCount, 3);

  // Verify R2 Put result
  const putKey = `books/${bookId}/r1/ch/1.json`;
  const savedChapter = JSON.parse(inMemoryStore.get(putKey));
  assert.equal(savedChapter.translationStatus, "completed");
  assert.ok(savedChapter.content.includes("Tiểu Hắc là một con mèo."));
  assert.ok(savedChapter.content.includes("Đại Bạch là một con hổ."));

  // Check metrics
  const metrics = pipeline.getMetricsReport();
  assert.equal(metrics.completedChapters, 1);
  assert.equal(metrics.completedBatches, 1);
  assert.equal(metrics.failureRate, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Pipeline: rolls back and preserves backup on validation failure", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-rollback-test-"));
  const inMemoryStore = new Map();
  const mockStorage = {
    async get(key) { return inMemoryStore.get(key) || null; },
    async put(key, val) { inMemoryStore.set(key, val); }
  };

  const bookId = "rollback-book";
  const chNum = 1;
  const initialContent = JSON.stringify({
    schema: 1,
    bookId,
    revision: 1,
    chapterNumber: chNum,
    title: "Chương 1",
    content: "Bản dịch cũ ban đầu"
  });
  inMemoryStore.set(`books/${bookId}/r1/ch/1.json`, initialContent);

  const r2IO = new R2IOManager({
    storage: mockStorage,
    rawCacheDir: path.join(tmpDir, "raw"),
    rollbackDir: path.join(tmpDir, "rollback")
  });

  const pipeline = new AgentTranslationPipeline({
    bookId,
    revision: 1,
    r2IO,
    cacheManager: new CacheManager({ cacheDir: path.join(tmpDir, "cache") }),
    checkpointManager: new CheckpointManager({ checkpointDir: path.join(tmpDir, "cp") }),
    storyStateManager: new StoryStateManager({ storageDir: path.join(tmpDir, "state") })
  });

  // Broken worker that omits tags
  pipeline.setTranslateBatchFn(async () => {
    return "Không có thẻ P nào cả!";
  });

  await assert.rejects(async () => {
    await pipeline.processChapter({ chapterNumber: chNum });
  }, /Empty translation text provided|Missing paragraph IDs/);

  // Assert initial R2 content is untouched
  const currentR2 = inMemoryStore.get(`books/${bookId}/r1/ch/1.json`);
  assert.equal(currentR2, initialContent);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("Pipeline: processes queue of multiple chapters sequentially", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-queue-test-"));
  const inMemoryStore = new Map();
  const mockStorage = {
    async head(key) {
      if (!inMemoryStore.has(key)) return null;
      return { key, etag: '"mock-etag"' };
    },
    async get(key) { return inMemoryStore.get(key) || null; },
    async put(key, val) { inMemoryStore.set(key, val); },
    async list(prefix) {
      return { keys: Array.from(inMemoryStore.keys()).filter(k => k.startsWith(prefix)) };
    }
  };

  const bookId = "queue-book";
  for (let ch = 1; ch <= 2; ch++) {
    inMemoryStore.set(`books/${bookId}/r1/ch/${ch}.json`, JSON.stringify({
      schema: 1,
      bookId,
      revision: 1,
      chapterNumber: ch,
      title: `第${ch}章`,
      content: `第${ch}章 内容\n\n段落一`
    }));
  }

  const pipeline = new AgentTranslationPipeline({
    bookId,
    revision: 1,
    minBatchSize: 1,
    maxBatchSize: 5,
    r2IO: new R2IOManager({ storage: mockStorage, rawCacheDir: path.join(tmpDir, "raw"), rollbackDir: path.join(tmpDir, "rollback") }),
    cacheManager: new CacheManager({ cacheDir: path.join(tmpDir, "cache") }),
    checkpointManager: new CheckpointManager({ checkpointDir: path.join(tmpDir, "cp") }),
    storyStateManager: new StoryStateManager({ storageDir: path.join(tmpDir, "state") })
  });

  pipeline.setTranslateBatchFn(async ({ batch }) => {
    return batch.paragraphs.map(p => `<P${String(p.index).padStart(3, "0")}>Dịch ${p.source}</P${String(p.index).padStart(3, "0")}>`).join("\n\n");
  });

  const { results, metrics } = await pipeline.processQueue([1, 2]);
  assert.equal(results.length, 2);
  assert.equal(results[0].success, true);
  assert.equal(results[1].success, true);
  assert.equal(metrics.completedChapters, 2);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

