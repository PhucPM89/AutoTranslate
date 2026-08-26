"use strict";

// Local Neural Translation & Refinement Engine
// Runs neural inference locally (100% offline, 0 API cost) via ONNX Runtime /
// Transformer Sequence-to-Sequence models, with seamless fallback to the Super Trie
// engine when weights are absent.

const fs = require("fs");
const path = require("path");

const DEFAULT_MODEL_PATH = path.join("models", "neural-zh-vi.onnx");
const DEFAULT_VOCAB_PATH = path.join("models", "vocab.json");

class LocalNeuralEngine {
  constructor(options = {}) {
    this.modelPath = options.modelPath || process.env.NEURAL_MODEL_PATH || DEFAULT_MODEL_PATH;
    this.vocabPath = options.vocabPath || process.env.NEURAL_VOCAB_PATH || DEFAULT_VOCAB_PATH;
    this.enabled = options.enabled !== undefined ? options.enabled : process.env.NEURAL_TRANSLATE_ENABLED === "true";
    this.session = null;
    this.vocab = null;
    this.isReady = false;
  }

  // Initialize and load ONNX runtime session if model exists
  async initialize() {
    if (!this.enabled) {
      this.isReady = false;
      return false;
    }

    if (!fs.existsSync(this.modelPath)) {
      this.isReady = false;
      return false;
    }

    try {
      // Dynamic require to prevent crashing if onnxruntime-node is not installed
      const ort = require("onnxruntime-node");
      this.session = await ort.InferenceSession.create(this.modelPath, {
        executionProviders: ["cpu"],
        graphOptimizationLevel: "all",
        intraOpNumThreads: 4
      });

      if (fs.existsSync(this.vocabPath)) {
        this.vocab = JSON.parse(fs.readFileSync(this.vocabPath, "utf8"));
      }

      this.isReady = true;
      return true;
    } catch (e) {
      this.isReady = false;
      return false;
    }
  }

  // Tokenize Chinese text into subword token IDs
  tokenize(text) {
    if (!text) return [];
    if (this.vocab && this.vocab.tokens) {
      const ids = [];
      for (const ch of Array.from(text)) {
        ids.push(this.vocab.tokens[ch] || this.vocab.unk_id || 1);
      }
      return ids;
    }
    // Fallback unicode codepoints
    return Array.from(text).map((ch) => ch.codePointAt(0));
  }

  // Decode token IDs into Vietnamese text
  decode(ids) {
    if (!ids || ids.length === 0) return "";
    if (this.vocab && this.vocab.id_to_token) {
      return ids.map((id) => this.vocab.id_to_token[id] || "").join("");
    }
    return ids.map((id) => String.fromCodePoint(id)).join("");
  }

  // Neural inference pass with graceful fallback
  async translate(text, options = {}) {
    if (!text || typeof text !== "string") return "";

    if (!this.isReady || !this.session) {
      // Graceful fallback to rule-based conversion
      if (options.fallbackEngine && typeof options.fallbackEngine.convert === "function") {
        return options.fallbackEngine.convert(text);
      }
      return text;
    }

    try {
      const ort = require("onnxruntime-node");
      const inputIds = this.tokenize(text);
      const tensor = new ort.Tensor("int64", BigInt64Array.from(inputIds.map(BigInt)), [1, inputIds.length]);
      
      const feeds = { input_ids: tensor };
      const results = await this.session.run(feeds);
      
      if (results && results.output_ids) {
        const outputArray = Array.from(results.output_ids.data).map(Number);
        return this.decode(outputArray);
      }
      
      if (options.fallbackEngine) return options.fallbackEngine.convert(text);
      return text;
    } catch {
      if (options.fallbackEngine) return options.fallbackEngine.convert(text);
      return text;
    }
  }

  // Polish and refine converted text to eliminate remaining stiffness
  refineText(convertedText) {
    if (!convertedText || typeof convertedText !== "string") return "";
    let s = convertedText;

    // Smooth common double particles and awkward literals with unicode support
    s = s.replace(/\s+/g, " ");
    s = s.replace(/(^|\s)(đã|sớm|vừa)\s+đã(\s|[.,!?;:]|$)/gi, "$1đã$3");
    s = s.replace(/(^|\s)(rất|cực kỳ)\s+rất(\s|[.,!?;:]|$)/gi, "$1rất$3");
    s = s.replace(/(^|\s)(không|chẳng)\s+không(\s|[.,!?;:]|$)/gi, "$1không$3");
    s = s.replace(/\s+([,.!?;:])/g, "$1");
    s = s.replace(/([“‘\[])\s+/g, "$1");
    s = s.replace(/\s+([”’\]])/g, "$1");

    return s.trim();
  }
}

let defaultEngine = null;
function getLocalNeuralEngine(options = {}) {
  if (!defaultEngine) {
    defaultEngine = new LocalNeuralEngine(options);
  }
  return defaultEngine;
}

module.exports = {
  LocalNeuralEngine,
  getLocalNeuralEngine,
  DEFAULT_MODEL_PATH,
  DEFAULT_VOCAB_PATH
};
