const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_STUDIO_MODEL,
  normalizeStudioModel,
  extractStudioDocumentText,
  splitStudioText,
  countStudioTextUnits,
  assessStudioTranslation,
  mergeStoredStudioTranslations
} = require("./epub-studio-core");

test("EPUB Studio accepts only supported Gemini model ids", () => {
  assert.equal(normalizeStudioModel("gemini-3.7-flash"), "gemini-3.7-flash");
  assert.equal(normalizeStudioModel("model-khong-ton-tai"), DEFAULT_STUDIO_MODEL);
});

test("EPUB Studio extracts semantic blocks without duplicating parent div text", () => {
  const removed = [];
  const blocks = [{ textContent: "Chương 1" }, { textContent: "Đoạn thứ nhất." }, { textContent: "Đoạn thứ hai." }];
  const doc = {
    body: {
      textContent: "Chương 1 Đoạn thứ nhất. Đoạn thứ hai.",
      querySelectorAll: () => blocks
    },
    querySelectorAll: () => [{ remove: () => removed.push(true) }]
  };
  assert.equal(extractStudioDocumentText(doc), "Chương 1\n\nĐoạn thứ nhất.\n\nĐoạn thứ hai.");
  assert.equal(removed.length, 1);
});

test("EPUB Studio chunks long chapters on paragraph boundaries", () => {
  const chunks = splitStudioText(["a".repeat(700), "b".repeat(700), "c".repeat(700)].join("\n\n"), 1000);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [700, 700, 700]);
  assert.equal(chunks.join("\n\n").length, 2104);
});

test("EPUB Studio counts Chinese characters instead of treating a paragraph as one word", () => {
  assert.equal(countStudioTextUnits("天地玄黄，宇宙洪荒。"), 8);
  assert.equal(countStudioTextUnits("hello world 123"), 3);
});

test("EPUB Studio rejects truncated and Han-heavy outputs", () => {
  assert.equal(assessStudioTranslation("中".repeat(500), "Bản dịch ngắn", "MAX_TOKENS").ok, false);
  assert.equal(assessStudioTranslation("中".repeat(500), "这是仍然是中文".repeat(20), "STOP").ok, false);
  assert.equal(assessStudioTranslation("中".repeat(500), "Đây là bản dịch tiếng Việt tự nhiên. ".repeat(20), "STOP").ok, true);
});

test("reloading the same EPUB preserves only matching chapter translations", () => {
  const current = [
    { chapterIndex: 0, title: "Một", originalText: "gốc một", translatedText: "" },
    { chapterIndex: 1, title: "Hai mới", originalText: "gốc hai mới", translatedText: "" }
  ];
  const stored = [
    { chapterIndex: 0, title: "Một", originalText: "gốc một", translatedText: "bản dịch một", model: "gemini-3.7-flash" },
    { chapterIndex: 1, title: "Hai", originalText: "gốc hai", translatedText: "bản dịch hai" }
  ];
  const merged = mergeStoredStudioTranslations(current, stored);
  assert.equal(merged[0].translatedText, "bản dịch một");
  assert.equal(merged[1].translatedText, "");
});
