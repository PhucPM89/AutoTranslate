"use strict";

/**
 * HachimiMT Client (Google Colab / Dedicated Server)
 * Connects epub-translator to HachimiMT Hugging Face model running on Google Colab or local GPU.
 * 
 * Endpoints supported:
 * - GET  /health           -> Check model and server status
 * - POST /translate        -> Translate single text / full chapter preserving paragraph breaks (\n\n)
 * - POST /translate-batch  -> Translate array of paragraphs/sentences
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds per request
const DEFAULT_MAX_RETRIES = 3;

/**
 * Perform an HTTP/HTTPS request with JSON payload and timeout support.
 */
function makeJsonRequest(targetUrl, { method = "GET", body = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === "https:";
      const client = isHttps ? https : http;

      const payload = body ? JSON.stringify(body) : null;
      const headers = {
        "User-Agent": "epub-translator-hachimi/1.0",
        "Accept": "application/json"
      };

      if (payload) {
        headers["Content-Type"] = "application/json";
        headers["Content-Length"] = Buffer.byteLength(payload);
      }

      const req = client.request(
        parsed,
        {
          method,
          headers,
          timeout: timeoutMs
        },
        (res) => {
          let chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const rawBody = Buffer.concat(chunks).toString("utf8");
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const parsedData = rawBody ? JSON.parse(rawBody) : {};
                resolve(parsedData);
              } catch (err) {
                reject(new Error(`Hachimi Colab Server returned non-JSON response (HTTP ${res.statusCode}): ${rawBody.slice(0, 200)}`));
              }
            } else {
              reject(new Error(`Hachimi Colab Server error (HTTP ${res.statusCode}): ${rawBody.slice(0, 300)}`));
            }
          });
        }
      );

      req.on("timeout", () => {
        req.destroy(new Error(`Hachimi Colab request timed out after ${timeoutMs}ms`));
      });

      req.on("error", (err) => {
        reject(err);
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Automatically resolves the active Hachimi URL:
 * 1. Checks current environment URL or supplied preferredUrl.
 * 2. If unreachable, reads latest auto-published URL from R2 storage (config/hachimi_url.json).
 */
async function resolveActiveHachimiUrl(storage = null, preferredUrl = null) {
  let url = (preferredUrl || process.env.HACHIMI_API_URL || "").replace(/\/+$/, "");
  
  if (url) {
    const health = await checkHachimiHealth(url);
    if (health.ok) return url;
  }

  // Fallback: Check if Colab auto-published its new URL to R2
  if (storage) {
    try {
      const raw = await storage.get("config/hachimi_url.json");
      if (raw) {
        const conf = JSON.parse(raw.toString("utf8"));
        if (conf && conf.url) {
          const candidateUrl = conf.url.replace(/\/+$/, "");
          const health = await checkHachimiHealth(candidateUrl);
          if (health.ok) {
            process.env.HACHIMI_API_URL = candidateUrl;
            return candidateUrl;
          }
        }
      }
    } catch {}
  }

  return url;
}

/**
 * Check if the Hachimi Colab Server is active and healthy.
 */
async function checkHachimiHealth(apiUrl = process.env.HACHIMI_API_URL) {
  if (!apiUrl) {
    return { ok: false, error: "Chưa cấu hình HACHIMI_API_URL trong biến môi trường (.env)" };
  }
  const cleanUrl = apiUrl.replace(/\/+$/, "");
  try {
    const data = await makeJsonRequest(`${cleanUrl}/health`, { method: "GET", timeoutMs: 8000 });
    return {
      ok: data && (data.status === "ok" || data.ready === true),
      data
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Post-processes Hachimi translation output.
 */
function cleanHachimiOutput(text) {
  if (!text || typeof text !== "string") return "";
  return text
    // Normalize quotation marks
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    // Collapse horizontal whitespace (spaces/tabs)
    .replace(/[^\S\r\n]+/g, " ")
    // Fix common punctuation spacing artifacts
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/(["'\[])\s+/g, "$1")
    .replace(/\s+(["'\]])/g, "$1")
    // Normalize newlines
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Translate a block of text (single paragraph or whole chapter) using HachimiMT on Colab.
 */
async function translateTextWithHachimi(text, {
  apiUrl = process.env.HACHIMI_API_URL,
  maxRetries = DEFAULT_MAX_RETRIES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxLength = 512,
  beamSize = 4,
  glossary = null
} = {}) {
  if (!text || typeof text !== "string" || !text.trim()) {
    return { translation: "", latencyMs: 0 };
  }

  if (!apiUrl) {
    throw new Error(
      "Không tìm thấy HACHIMI_API_URL. Vui lòng mở Google Colab (colab/hachimi_colab_server.ipynb), chạy Server và dán link public URL vào file .env."
    );
  }

  const cleanUrl = apiUrl.replace(/\/+$/, "");
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const locked = glossary && typeof glossary === "object"
        ? require("./translation-engine").createTranslationEngine().protectGlossaryTerms(text, glossary)
        : { text, replacements: [] };
      const response = await makeJsonRequest(`${cleanUrl}/translate`, {
        method: "POST",
        body: {
          text: locked.text,
          max_length: maxLength,
          beam_size: beamSize
        },
        timeoutMs
      });

      let translation = cleanHachimiOutput(response.translation || "");
      if (locked.replacements.length) {
        translation = require("./translation-engine").createTranslationEngine()
          .restoreGlossaryTerms(translation, locked.replacements);
      }

      // Apply glossary substitutions if supplied
      if (glossary && typeof glossary === "object") {
        for (const [zh, vi] of Object.entries(glossary)) {
          if (vi && translation.includes(zh)) {
            translation = translation.split(zh).join(vi);
          }
        }
      }

      return {
        translation,
        latencyMs: response.latency_ms || 0,
        model: response.model || "HachimiMT"
      };
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const waitMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  throw new Error(`[Hachimi Colab] Dịch thất bại sau ${maxRetries} lần thử: ${lastError ? lastError.message : "Unknown error"}`);
}

/**
 * Translate an array of text paragraphs in batch.
 */
async function translateBatchWithHachimi(texts, {
  apiUrl = process.env.HACHIMI_API_URL,
  maxRetries = DEFAULT_MAX_RETRIES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxLength = 512,
  beamSize = 4
} = {}) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return { translations: [], latencyMs: 0 };
  }

  if (!apiUrl) {
    throw new Error("Chưa cấu hình HACHIMI_API_URL trong .env");
  }

  const cleanUrl = apiUrl.replace(/\/+$/, "");
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await makeJsonRequest(`${cleanUrl}/translate-batch`, {
        method: "POST",
        body: {
          texts,
          max_length: maxLength,
          beam_size: beamSize
        },
        timeoutMs
      });

      const cleaned = (response.translations || []).map(cleanHachimiOutput);
      return {
        translations: cleaned,
        latencyMs: response.latency_ms || 0,
        model: response.model || "HachimiMT"
      };
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const waitMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  throw new Error(`[Hachimi Colab Batch] Thất bại sau ${maxRetries} lần thử: ${lastError ? lastError.message : "Unknown error"}`);
}

/**
 * Translate an entire chapter object { chapterNumber, title, content }.
 */
async function translateChapterWithHachimi(chapter, options = {}) {
  if (!chapter || !chapter.content) {
    return {
      title: chapter?.title || "",
      content: "",
      translationStatus: "failed"
    };
  }

  const titleZh = chapter.title || "";
  const contentZh = chapter.content || "";

  // Translate title and content
  let titleVi = titleZh;
  if (titleZh && /[\u4e00-\u9fa5]/.test(titleZh)) {
    try {
      const resTitle = await translateTextWithHachimi(titleZh, options);
      titleVi = resTitle.translation || titleZh;
    } catch {
      titleVi = titleZh;
    }
  }

  const resContent = await translateTextWithHachimi(contentZh, options);
  const quality = require("./translation-quality")
    .evaluateTranslationQuality(contentZh, resContent.translation);

  return {
    chapterNumber: chapter.chapterNumber,
    title: titleVi,
    content: resContent.translation,
    translationStatus: "completed",
    provider: "hachimi",
    model: resContent.model || "HachimiMT",
    latencyMs: resContent.latencyMs,
    ...quality
  };
}

module.exports = {
  checkHachimiHealth,
  resolveActiveHachimiUrl,
  translateTextWithHachimi,
  translateBatchWithHachimi,
  translateChapterWithHachimi,
  cleanHachimiOutput,
  makeJsonRequest
};
