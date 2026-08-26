"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { LocalNeuralEngine, getLocalNeuralEngine } = require("./neural-engine");
const { buildConvertEngineFromDisk } = require("./index");

test("neural-engine initializes and reports readiness", async () => {
  const engine = new LocalNeuralEngine({ enabled: false });
  const ready = await engine.initialize();
  assert.strictEqual(ready, false, "disabled engine reports not ready");
  assert.strictEqual(engine.isReady, false);
});

test("neural-engine tokenizes and decodes text", () => {
  const engine = new LocalNeuralEngine({
    enabled: false,
    vocabPath: "models/vocab.json"
  });

  const tokens = engine.tokenize("天玄宗");
  assert.ok(Array.isArray(tokens), "tokens is an array");
  assert.strictEqual(tokens.length, 3, "tokenized 3 characters");

  const decoded = engine.decode([65, 66, 67]);
  assert.strictEqual(decoded, "ABC", "decoded unicode code points properly");
});

test("neural-engine falls back safely to convert engine when offline", async () => {
  const convertEngine = buildConvertEngineFromDisk(process.env);
  const neuralEngine = new LocalNeuralEngine({ enabled: false });

  const result = await neuralEngine.translate("林动看着眼前的少女。", {
    fallbackEngine: convertEngine
  });

  assert.ok(result.includes("Lâm Động"), `expected Lâm Động in fallback, got: ${result}`);
  assert.ok(result.includes("thiếu nữ"), `expected thiếu nữ in fallback, got: ${result}`);
});

test("neural-engine refineText cleans double particles and spacing", () => {
  const engine = getLocalNeuralEngine();
  const raw = "Hắn  đã  đã  biết   chuyện này ,  và rất  rất  vui .";
  const refined = engine.refineText(raw);
  assert.strictEqual(refined, "Hắn đã biết chuyện này, và rất vui.");
});

test("singleton getLocalNeuralEngine returns persistent instance", () => {
  const e1 = getLocalNeuralEngine();
  const e2 = getLocalNeuralEngine();
  assert.strictEqual(e1, e2, "returns identical singleton instance");
});
