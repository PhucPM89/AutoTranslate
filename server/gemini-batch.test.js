"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createGeminiBatchClient, batchResponseText } = require("./gemini-batch");

test("batch client reuses a job by deterministic display name", async () => {
  class FakeGenAI {
    constructor() {
      this.batches = { list: async () => ({ async *[Symbol.asyncIterator]() { yield { name: "batches/1", displayName: "wanted" }; } }) };
      this.models = { list: async () => ({ async *[Symbol.asyncIterator]() { yield { name: "models/gemini-test", supportedActions: ["generateContent"] }; } }) };
    }
  }
  const client = createGeminiBatchClient({ apiKey: "test", GoogleGenAI: FakeGenAI });
  assert.equal((await client.findByDisplayName("wanted")).name, "batches/1");
  assert.equal((await client.listModels())[0].name, "models/gemini-test");
});

test("batch response text supports SDK getter and raw candidates", () => {
  assert.equal(batchResponseText({ response: { text: "ok" } }), "ok");
  assert.equal(batchResponseText({ response: { candidates: [{ content: { parts: [{ text: "raw" }] } }] } }), "raw");
});
