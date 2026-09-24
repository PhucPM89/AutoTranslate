"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createTranslationEngine } = require("./translation-engine");
const { translateText, assessTranslation, generateStructuredText } = require("./gemini");
const engine = createTranslationEngine();

test("postprocessing preserves Vietnamese words, quantities, names and uncertainty", () => {
  for (const input of [
    "Con mèo lao vào quật ngã con ma già đó.", "Tôi bị ngã xuống đất.",
    "Ngã ba phía trước có một quán ăn.", "Màng nhĩ của tôi vẫn bình thường.",
    "Món canh của tôi có thịt ba ba.", "Bị bệnh viện cấp thuốc, tôi về nhà.",
    "Trong lòng không khỏi có chút lo lắng.", "Tỷ Tỷ là tên cửa hàng.",
    "Khóe miệng 竟然 ngoác rộng ra.", "Cô ấy đứng cạnh Hải Nhược颖."
  ]) {
    assert.equal(engine.postProcessTranslation(input), input);
    assert.equal(engine.postProcessTranslation(engine.postProcessTranslation(input)), input);
  }
});

test("quality rejects isolated untranslated glyphs and unresolved tokens even in titles", () => {
  for (const source of ["标题", "这是一个需要翻译的故事。".repeat(30)]) {
    for (const tail of ["字", "竟然", "__TC_NAME_0000__"]) {
      const result = assessTranslation(source, engine.postProcessTranslation(`Tôi đã về nhà ${tail}.`));
      assert.equal(result.acceptable, false);
      assert.match(result.reason, /chữ Hán|token/);
    }
  }
});

test("API preserves correct raw prose, excludes thought parts and exposes model evidence", async () => {
  const originalFetch = global.fetch;
  const text = "Con mèo lao vào quật ngã con ma già đó. Màng nhĩ của tôi không bị thương.";
  global.fetch = async () => ({ ok: true, json: async () => ({modelVersion: "test-version", candidates: [{content: {parts: [{thought: true, text: "private reasoning"}, {text}]}}]}) });
  try {
    const raw = await generateStructuredText("test", ["AIza-fidelity-raw"], {responseFormat: "text"});
    assert.equal(raw.rawText, text);
    assert.equal(raw.modelVersion, "test-version");
    const result = await translateText("猫把鬼打倒了。", "AIza-fidelity-prose", {provider: "cloud"});
    assert.equal(result.translation, text);
  } finally { global.fetch = originalFetch; }
});

// Translation no longer rewrites or rejects semantic content automatically.
// Direct pass-through API/Web behavior is covered in direct-translation.test.js.
