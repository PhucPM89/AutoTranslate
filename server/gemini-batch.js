"use strict";

function createGeminiBatchClient({ apiKey = process.env.GEMINI_API_KEY, GoogleGenAI } = {}) {
  if (!apiKey) throw new Error("Thiếu GEMINI_API_KEY cho Batch API.");
  const Constructor = GoogleGenAI || require("@google/genai").GoogleGenAI;
  const ai = new Constructor({ apiKey });
  return {
    async findByDisplayName(displayName) {
      const pager = await ai.batches.list({ config: { pageSize: 100 } });
      for await (const job of pager) if (job.displayName === displayName) return job;
      return null;
    },
    create({ model, displayName, requests }) {
      return ai.batches.create({ model, src: requests, config: { displayName } });
    },
    get(name) { return ai.batches.get({ name }); },
    async listModels() {
      const pager = await ai.models.list({ config: { pageSize: 100 } });
      const models = [];
      for await (const model of pager) models.push(model);
      return models;
    }
  };
}

function batchResponseText(item) {
  if (!item?.response) return "";
  if (typeof item.response.text === "string") return item.response.text;
  return (item.response.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text || "")
    .join("")
    .trim();
}

module.exports = { createGeminiBatchClient, batchResponseText };
