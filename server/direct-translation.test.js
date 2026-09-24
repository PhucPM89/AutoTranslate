"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { translateText, translateBatchChapters } = require("./gemini");
const { createTranslationEngine } = require("./translation-engine");
const { buildDirectPrompt } = require("./direct-translation");
const { buildChapterDocument } = require("./ingest/documents");

test("whole original reaches API without glossary, examples, draft, splitting or generation overrides", async () => {
  const previous = global.fetch;
  const source = "  他没有死。\n\n".repeat(900);
  const answer = "  # Chương 1\n\n" + "Anh ấy vẫn chưa chết.\n\n".repeat(900);
  const requests = [];
  global.fetch = async (_, options) => {
    requests.push(JSON.parse(options.body));
    return {ok: true, json: async () => ({candidates: [{content: {parts: [{text: answer}]}}]})};
  };
  const engine = new Proxy({}, {get() { throw new Error("No engine enrichment allowed"); }});
  try {
    const result = await translateText(source, "AIza-direct-source-test", {provider:"cloud", engine, glossary: {"他":"SAI"}, translationMemory:[{zh:"死",vi:"SAI"}]});
    assert.equal(requests.length, 1);
    assert.equal(requests[0].contents[0].parts[0].text, buildDirectPrompt(source));
    assert.equal(requests[0].generationConfig.thinkingConfig, undefined);
    assert.equal(requests[0].generationConfig.temperature, undefined);
    assert.equal(requests[0].safetySettings, undefined);
    assert.equal(result.translation, answer.trim());
    assert.equal(result.chunkCount, 1);
  } finally { global.fetch = previous; }
});

test("Web transport wrappers are removed without rewriting translated prose", async () => {
  const previous = process.env.GEMINI_WEB_MOCK_RESPONSE;
  const answer = "Gemini said:\n```text\n# Chương 1\n\nMàng nhĩ và thịt ba ba.\n```";
  process.env.GEMINI_WEB_MOCK_RESPONSE = answer;
  try { assert.equal((await translateText("原标题", "", {provider:"gemini-web"})).translation, "# Chương 1\n\nMàng nhĩ và thịt ba ba."); }
  finally { if (previous === undefined) delete process.env.GEMINI_WEB_MOCK_RESPONSE; else process.env.GEMINI_WEB_MOCK_RESPONSE = previous; }
});

test("invalid direct answers are retried and never published", async () => {
  const previous = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    const answer = calls < 3 ? "Gemini said: 原文" : "Đây là một câu chuyện cần được dịch đầy đủ. ".repeat(25);
    return {ok: true, json: async () => ({candidates: [{content: {parts: [{text: answer}]}}]})};
  };
  try {
    const result = await translateText("这是一个需要翻译的故事。".repeat(25), "AIza-quality-retry", {provider:"cloud"});
    assert.equal(calls, 3);
    assert.equal(result.translation, "Đây là một câu chuyện cần được dịch đầy đủ. ".repeat(25).trim());
  } finally { global.fetch = previous; }
});

test("storage and compatibility postprocessor preserve exact AI text and title", () => {
  const answer = "  # Chương 1\n\nBản dịch: Tôi ngã.\n\n\"Thoại chưa đóng\n";
  assert.equal(createTranslationEngine().postProcessTranslation(answer, {"ngã":"tôi"}), answer);
  const doc = buildChapterDocument({bookId:"test",revision:1,chapter:{chapterNumber:1,title:"Tiêu đề AI",content:"原文"},translation:answer,translationStatus:"completed"});
  assert.equal(doc.content, answer);
  assert.equal(doc.title, "Tiêu đề AI");
});

test("batch submits separate untouched chapters without packing markers", async () => {
  const previous = global.fetch;
  const requests = [];
  global.fetch = async (_, opts) => {
    requests.push(JSON.parse(opts.body).contents[0].parts[0].text);
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:"Đáp án."}]}}]})};
  };
  try {
    const results = await translateBatchChapters([{chapterNumber:1,content:"甲"},{chapterNumber:2,content:"乙"}], "AIza-direct-batch-test", {provider:"cloud"});
    assert.deepEqual(requests, [buildDirectPrompt("甲"),buildDirectPrompt("乙")]);
    assert.equal(results.length,2);
  } finally { global.fetch = previous; }
});
