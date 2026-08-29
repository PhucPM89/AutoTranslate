"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTranslationEngine, glossaryKey, DEFAULT_TM_PATTERNS } = require("./translation-engine");

test("translation-engine: findMatchedGlossaryTerms matches Chinese terms", () => {
  const engine = createTranslationEngine();
  const glossary = {
    "林枫": "Lâm Phong",
    "松下助": "Matsushita Tasuku",
    "空间异能": "dị năng không gian"
  };

  const text = "林枫看着眼前的松下助，心中冷笑。他的空间异能已经开启。";
  const matched = engine.findMatchedGlossaryTerms(text, glossary);

  assert.equal(matched.length, 3);
  assert.deepEqual(matched, [
    { zh: "林枫", vi: "Lâm Phong" },
    { zh: "松下助", vi: "Matsushita Tasuku" },
    { zh: "空间异能", vi: "dị năng không gian" }
  ]);
});

test("translation-engine: buildContextualPrompt injects glossary section", () => {
  const engine = createTranslationEngine();
  const glossary = {
    "林枫": "Lâm Phong",
    "大板": "Osaka"
  };

  const text = "林枫到达了大板机场。";
  const prompt = engine.buildContextualPrompt({
    text,
    index: 0,
    total: 1,
    bookTitle: "Mạt Thế Băng Hà",
    glossary
  });

  assert.ok(prompt.includes("THUẬT NGỮ & TÊN RIÊNG"));
  assert.ok(prompt.includes('"林枫" ➔ "Lâm Phong"'));
  assert.ok(prompt.includes('"大板" ➔ "Osaka"'));
  assert.ok(prompt.includes("Văn bản tiếng Trung cần dịch:"));
  assert.ok(prompt.includes("林枫到达了大板机场。"));
});

test("translation-engine: prompt carries book context and fiction literature framing", () => {
  const prompt = createTranslationEngine().buildContextualPrompt({
    text: "他有1200块灵石。",
    bookTitle: "Kiếm Đạo Trường Sinh"
  });
  assert.match(prompt, /Tác phẩm: Kiếm Đạo Trường Sinh/);
  assert.match(prompt, /FICTION LITERATURE TRANSLATION/);
});

test("translation-engine: postProcessTranslation cleans markdown & enforces glossary", () => {
  const engine = createTranslationEngine();
  const glossary = {
    "林枫": "Lâm Phong"
  };

  const raw = "```markdown\n# Chương 1\n**Lâm Phong** “nói”: ‘Đi thôi!’\n\n\n\n林枫 bước đi.\n```";
  const processed = engine.postProcessTranslation(raw, glossary);

  assert.ok(!processed.includes("```"));
  assert.ok(!processed.includes("# Chương 1"));
  assert.ok(!processed.includes("**"));
  assert.ok(!processed.includes("林枫")); // Leftover Hanzi replaced by glossary
  assert.ok(processed.includes('"nói"')); // Normalized quotes
  assert.ok(processed.includes("'Đi thôi!'"));
});

test("translation-engine: in-memory glossary save and load", async () => {
  const mockStorage = {
    store: new Map(),
    async get(key) {
      if (!this.store.has(key)) return null;
      return Buffer.from(this.store.get(key));
    },
    async put(key, body) {
      this.store.set(key, body);
    }
  };

  const engine = createTranslationEngine({ storage: mockStorage });
  const bookId = "test-book-123";
  const glossary = { "陈清": "Trần Thanh", "金丹期": "Kim Đan kỳ" };

  await engine.saveGlossary(bookId, glossary);
  const loaded = await engine.loadGlossary(bookId);

  assert.deepEqual(loaded, glossary);
  assert.ok(mockStorage.store.has(glossaryKey(bookId)));
});

test("translation-engine: loadTranslationMemory returns default patterns", async () => {
  const engine = createTranslationEngine();
  const tm = await engine.loadTranslationMemory();

  assert.ok(Array.isArray(tm));
  assert.ok(tm.length >= DEFAULT_TM_PATTERNS.length);
  assert.ok(tm.some((p) => p.zh === "倒吸一口凉气" && p.vi === "hít sâu một hơi khí lạnh"));
});

test("translation-engine: mineAndMergeGlossary extracts and saves book entities", async () => {
  const mockStorage = {
    store: new Map(),
    async get(key) {
      if (!this.store.has(key)) return null;
      return Buffer.from(this.store.get(key));
    },
    async put(key, body) {
      this.store.set(key, body);
    }
  };

  const engine = createTranslationEngine({ storage: mockStorage });
  const bookId = "test-book-mine";
  const texts = ["李子夜手持诛仙剑，踏入青云门，运转太玄剑诀。"];

  const merged = await engine.mineAndMergeGlossary(bookId, texts);
  assert.ok(merged["青云门"]);
  assert.ok(merged["诛仙剑"]);
  assert.ok(mockStorage.store.has(glossaryKey(bookId)));
});

test("translation-engine: mines character names and keeps manual decisions", async () => {
  const mockStorage = {
    store: new Map(),
    async get(key) { return this.store.has(key) ? Buffer.from(this.store.get(key)) : null; },
    async put(key, body) { this.store.set(key, body); }
  };
  const engine = createTranslationEngine({ storage: mockStorage });
  await engine.saveGlossary("cast", { "李子夜": "Lý Tử Dạ (đã duyệt)" });
  const glossary = await engine.mineAndMergeGlossary("cast", [
    "李子夜说道：王天明走了过来。王天明笑着看向李子夜。"
  ]);
  assert.equal(glossary["李子夜"], "Lý Tử Dạ (đã duyệt)");
  assert.equal(glossary["王天明"], "Vương Thiên Minh");
});

test("translation-engine: locks names before translation and restores altered sentinels", () => {
  const engine = createTranslationEngine();
  const locked = engine.protectGlossaryTerms("李子夜看向王天明。", {
    "李子夜": "Lý Tử Dạ",
    "王天明": "Vương Thiên Minh"
  });
  assert.doesNotMatch(locked.text, /李子夜|王天明/);
  const simulatedModelOutput = locked.text
    .replace("__TC_NAME_0000__", "__TC NAME 0000__")
    .replace("看向", "nhìn về phía");
  assert.equal(
    engine.restoreGlossaryTerms(simulatedModelOutput, locked.replacements),
    "Lý Tử Dạ nhìn về phía Vương Thiên Minh。"
  );
});
