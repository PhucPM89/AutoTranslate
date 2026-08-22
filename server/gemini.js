"use strict";

const { createTranslationEngine } = require("./translation-engine");

const GROQ_MODEL = process.env.GROQ_MODEL || process.env.GEMINI_MODEL || "qwen/qwen3.6-27b";
const GROQ_FALLBACK_MODELS = parseCsv(
  process.env.GROQ_FALLBACK_MODELS || process.env.GEMINI_FALLBACK_MODELS || "openai/gpt-oss-120b,openai/gpt-oss-20b,groq/compound"
);
const TRANSLATE_CHUNK_SIZE = Number(process.env.GEMINI_CHUNK_SIZE || 6000);
const TRANSLATE_CONCURRENCY = Number(process.env.GEMINI_TRANSLATE_CONCURRENCY || 1);
const REQUEST_TIMEOUT_MS = Number(process.env.GROQ_REQUEST_TIMEOUT_MS || process.env.GEMINI_REQUEST_TIMEOUT_MS || 90000);

const defaultEngine = createTranslationEngine();

function parseApiKeys(keys) {
  if (Array.isArray(keys)) {
    return keys
      .flatMap((k) => parseApiKeys(String(k)))
      .filter((k) => k.length > 0);
  }
  if (typeof keys !== "string") return [];

  const cleaned = keys.replace(/\r\n/g, "\n");
  const rawTokens = cleaned.split(/[\n,;]+/);
  const result = [];

  for (let token of rawTokens) {
    token = token.trim();
    if (!token) continue;
    if (token.startsWith("gsk_") || token.startsWith("AQ.") || token.startsWith("AIza") || result.length === 0) {
      result.push(token);
    } else {
      result[result.length - 1] += token;
    }
  }

  return result.filter((k) => k.length > 0);
}

function stripThinkTags(text) {
  if (typeof text !== "string") return "";
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "$1")
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "$1")
    .replace(/(^|[\s(])\*(?=\S)([^*\n]*?\S)\*(?=[\s.,;:!?)]|$)/g, "$1$2")
    .replace(/(^|[\s(])_(?=\S)([^_\n]*?\S)_(?=[\s.,;:!?)]|$)/g, "$1$2")
    .trim();
}

function cleanMetadataField(value, maxLength) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function hasHan(value) {
  return /\p{Script=Han}/u.test(String(value || ""));
}

function getActiveKeys(apiKeys) {
  const parsed = parseApiKeys(apiKeys);
  if (parsed.length) return parsed;

  const fromEnv = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY;
  return parseApiKeys(fromEnv);
}

async function translateText(text, apiKeys, options = {}) {
  const keyList = getActiveKeys(apiKeys);
  if (!keyList.length) throw new Error("Thiếu GROQ_API_KEY / GEMINI_API_KEY.");

  const glossary = options.glossary || {};
  const bookTitle = options.bookTitle || "";
  const engine = options.engine || defaultEngine;

  const chunks = splitTextIntoChunks(text, TRANSLATE_CHUNK_SIZE);
  const startedAt = Date.now();

  const chunkResults = await mapWithConcurrency(
    chunks,
    Math.max(1, TRANSLATE_CONCURRENCY),
    (chunk, index) =>
      translateChunkWithKeyPool(keyList, chunk, index, chunks.length, {
        glossary,
        bookTitle,
        engine
      })
  );

  const translatedChunks = chunkResults.map((result) => result.text);
  const rawTranslation = translatedChunks.join("\n\n").trim();
  const translation = engine.postProcessTranslation(rawTranslation, glossary);
  const modelsUsed = Array.from(new Set(chunkResults.map((result) => result.model)));

  return {
    translation,
    chunkCount: chunks.length,
    modelsUsed,
    elapsedMs: Date.now() - startedAt
  };
}

async function translateBatchChapters(chapters, apiKeys, options = {}) {
  if (!Array.isArray(chapters) || !chapters.length) return [];
  if (chapters.length === 1) {
    const single = await translateText(chapters[0].content, apiKeys, options);
    return [{ chapterNumber: chapters[0].chapterNumber, translation: single.translation }];
  }

  const keyList = getActiveKeys(apiKeys);
  if (!keyList.length) throw new Error("Thiếu GROQ_API_KEY / GEMINI_API_KEY.");

  const glossary = options.glossary || {};
  const bookTitle = options.bookTitle || "";
  const engine = options.engine || defaultEngine;

  const parts = [];
  parts.push("Bạn là một dịch giả tiểu thuyết Trung Quốc sang tiếng Việt chuyên nghiệp.");
  parts.push("Hãy dịch trọn vẹn các chương truyện sau đây sang tiếng Việt tự nhiên, đúng chất tiên hiệp/huyền huyễn.");
  parts.push("Yêu cầu bắt buộc:");
  parts.push("- Chuyển toàn bộ tên người, địa danh, môn phái, cảnh giới sang âm Hán-Việt phù hợp.");
  parts.push("- Tuyệt đối không dùng Pinyin hoặc chữ Hán.");
  parts.push("- Giữ nguyên cấu trúc các phân tách chương dạng: === CHAPTER_START_{n} === và === CHAPTER_END_{n} ===");
  parts.push("");
  for (const ch of chapters) {
    parts.push(`=== CHAPTER_START_${ch.chapterNumber} ===`);
    parts.push(ch.content || "");
    parts.push(`=== CHAPTER_END_${ch.chapterNumber} ===`);
    parts.push("");
  }

  const packedPrompt = parts.join("\n");
  try {
    const result = await translateChunkWithKeyPool(keyList, packedPrompt, 0, 1, {
      glossary,
      bookTitle,
      engine
    });

    const parsed = [];
    const raw = result.text || "";
    for (const ch of chapters) {
      const regex = new RegExp(
        `===\\s*CHAPTER_START_${ch.chapterNumber}\\s*===([\\s\\S]*?)(?:===\\s*CHAPTER_END_${ch.chapterNumber}\\s*===|(?====\\s*CHAPTER_START_)|$)`,
        "i"
      );
      const match = raw.match(regex);
      if (match && match[1] && match[1].trim().length > 30) {
        const cleaned = engine.postProcessTranslation(match[1].trim(), glossary);
        parsed.push({ chapterNumber: ch.chapterNumber, translation: cleaned });
      }
    }

    if (parsed.length === chapters.length) {
      return parsed;
    }
  } catch (err) {
    console.warn(`Batch translate failed (${err.message}), falling back to single translation`);
  }

  const fallbackResults = [];
  for (const ch of chapters) {
    const single = await translateText(ch.content, apiKeys, options);
    fallbackResults.push({ chapterNumber: ch.chapterNumber, translation: single.translation });
  }
  return fallbackResults;
}

async function translateMetadata(metadata, apiKey) {
  const source = {
    title: cleanMetadataField(metadata?.title, 120),
    author: cleanMetadataField(metadata?.author, 100),
    description: cleanMetadataField(metadata?.description, 3000)
  };
  if (!source.title) throw new Error("Metadata thiếu tên truyện.");

  const prompt = [
    "Bạn là biên tập viên truyện Trung Quốc cho một thư viện tiếng Việt.",
    "Hãy dịch metadata sau sang tiếng Việt tự nhiên.",
    "Yêu cầu bắt buộc:",
    "- title: dịch thành tên truyện tiếng Việt gọn, tự nhiên, đúng nghĩa.",
    "- author: chuyển bút danh/tên tác giả sang âm Hán-Việt; không dùng Pinyin.",
    "- description: dịch đầy đủ phần giới thiệu, không tóm tắt và không thêm bình luận.",
    "- Không để lại chữ Hán trong bất kỳ trường nào nếu trường nguồn có chữ Hán.",
    "- Chỉ trả về duy nhất định dạng JSON đúng schema: {\"title\":\"...\",\"author\":\"...\",\"description\":\"...\"}.",
    "Metadata nguồn:",
    JSON.stringify(source)
  ].join("\n");

  const models = [GROQ_MODEL, ...GROQ_FALLBACK_MODELS].filter((model, index, list) => model && list.indexOf(model) === index);
  let lastError = null;

  const keyList = getActiveKeys(apiKey);
  for (const key of keyList) {
    for (const model of models) {
      try {
        const result = await translateChunkWithModel(key, model, prompt, { responseFormat: "json", temperature: 0.2 });
        const translated = parseMetadataJson(result.text);
        validateTranslatedMetadata(source, translated);
        return {
          title: cleanMetadataField(translated.title, 120),
          author: cleanMetadataField(translated.author, 100),
          description: cleanMetadataField(translated.description, 3000),
          model: result.model
        };
      } catch (error) {
        lastError = error;
        if (!shouldTryNextModel(error) && error.status !== 502) break;
      }
    }
  }

  // Resilient fallback: If AI metadata translation fails, never fail the entire book ingest.
  // Use source metadata cleanly so the novel is published and translated normally.
  console.warn("Metadata AI translation fallback:", lastError?.message);
  return {
    title: cleanMetadataField(source.title, 120),
    author: cleanMetadataField(source.author, 100) || "Tác giả",
    description: cleanMetadataField(source.description, 3000) || "Đang cập nhật giới thiệu truyện.",
    model: "fallback-source"
  };
}

function parseMetadataJson(value) {
  try {
    const raw = stripThinkTags(String(value || "")).trim();
    return JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    const error = new Error("API trả metadata không đúng định dạng JSON.");
    error.status = 502;
    throw error;
  }
}

function validateTranslatedMetadata(source, translated) {
  if (!translated || typeof translated !== "object" || !cleanMetadataField(translated.title, 120)) {
    const error = new Error("Không có tên truyện đã dịch.");
    error.status = 502;
    throw error;
  }
  for (const key of ["title", "author", "description"]) {
    if (hasHan(source[key]) && hasHan(translated[key])) {
      const error = new Error(`Metadata ${key} vẫn còn chữ Trung.`);
      error.status = 502;
      throw error;
    }
  }
}

// In-memory key health state to prevent pounding keys that hit 429/safety errors
const keyHealthMap = new Map();

function getKeyHealth(key) {
  if (!keyHealthMap.has(key)) {
    keyHealthMap.set(key, { cooldownUntil: 0, consecutiveErrors: 0, lastUsed: 0 });
  }
  return keyHealthMap.get(key);
}

function markKeyCooldown(key, durationMs = 60000) {
  const health = getKeyHealth(key);
  health.cooldownUntil = Date.now() + durationMs;
  health.consecutiveErrors += 1;
}

function markKeySuccess(key) {
  const health = getKeyHealth(key);
  health.consecutiveErrors = 0;
  health.lastUsed = Date.now();
}

function isContentSafetyRefusal(data, error) {
  if (data?.choices?.[0]?.finish_reason === "content_filter") return true;
  if (data?.candidates?.[0]?.finish_reason === "SAFETY") return true;
  const msg = String(error?.message || data?.error?.message || "").toLowerCase();
  return (
    msg.includes("safety") ||
    msg.includes("content_filter") ||
    msg.includes("harm_category") ||
    msg.includes("violates") ||
    msg.includes("policy") ||
    msg.includes("prohibited")
  );
}

async function translateChunkWithKeyPool(keyList, text, index, total, { glossary = {}, bookTitle = "", engine = defaultEngine } = {}) {
  const models = [GROQ_MODEL, ...GROQ_FALLBACK_MODELS].filter(
    (model, modelIndex, list) => model && list.indexOf(model) === modelIndex
  );

  let lastError = null;

  // Sort keys prioritizing those not on cooldown and least recently used
  const now = Date.now();
  const sortedKeys = [...keyList].sort((a, b) => {
    const healthA = getKeyHealth(a);
    const healthB = getKeyHealth(b);
    const onCooldownA = healthA.cooldownUntil > now ? 1 : 0;
    const onCooldownB = healthB.cooldownUntil > now ? 1 : 0;
    if (onCooldownA !== onCooldownB) return onCooldownA - onCooldownB;
    return healthA.lastUsed - healthB.lastUsed;
  });

  for (let keyIdx = 0; keyIdx < sortedKeys.length; keyIdx += 1) {
    const apiKey = sortedKeys[keyIdx];
    const health = getKeyHealth(apiKey);
    if (health.cooldownUntil > Date.now()) {
      continue; // Skip keys currently on cooldown
    }

    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
      const model = models[modelIndex];
      const prompt = engine.buildContextualPrompt({
        text,
        index,
        total,
        bookTitle,
        glossary,
        isRetry: modelIndex > 0
      });

      try {
        const result = await translateChunkWithModel(apiKey, model, prompt);
        const quality = assessTranslation(text, result.text);
        if (quality.acceptable) {
          markKeySuccess(apiKey);
          return result;
        }

        const error = new Error(`Bản dịch chưa đạt yêu cầu (${quality.reason}).`);
        error.status = 502;
        error.model = model;
        lastError = error;
        continue;
      } catch (error) {
        lastError = error;

        // Anti-Ban Safety Circuit Breaker:
        if (isContentSafetyRefusal(null, error)) {
          console.warn("Phát hiện bộ lọc an toàn nội dung. Dừng retry để tránh vi phạm chính sách API.");
          // Soften and fallback gracefully using translation engine
          const fallbackClean = engine.postProcessTranslation(text, glossary);
          return { text: fallbackClean || "Nội dung chương đang được cập nhật bản dịch phù hợp.", model: "safety-fallback" };
        }

        if (error.status === 429 || error.status === 403) {
          console.warn(`Key ...${apiKey.slice(-6)} bị giới hạn quota (${error.status}), tạm dừng 60s và chuyển sang key tiếp theo...`);
          markKeyCooldown(apiKey, 60000);
          break; // Try next key
        }
        if (!shouldTryNextModel(error)) break;
      }
    }
  }

  throw lastError || new Error("Tất cả các API key đều đang trong thời gian chờ hoặc hết hạn mức.");
}

async function translateChunkWithModel(apiKey, model, prompt, generationConfig = {}) {
  const isGroq = apiKey.startsWith("gsk_");
  
  if (isGroq) {
    return translateWithGroq(apiKey, model, prompt, generationConfig);
  } else {
    return translateWithGemini(apiKey, model, prompt, generationConfig);
  }
}

async function translateWithGroq(apiKey, model, prompt, generationConfig = {}) {
  const url = "https://api.groq.com/openai/v1/chat/completions";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const bodyPayload = {
        model,
        messages: [
          {
            role: "system",
            content: "Bạn là dịch giả tiểu thuyết Trung Quốc sang tiếng Việt chuyên nghiệp. Hãy dịch toàn bộ sang tiếng Việt tự nhiên, đúng chuẩn văn phong tiểu thuyết/tiên hiệp/huyền huyễn. Chỉ trả về nội dung đã dịch, không kèm lời giải thích hay ghi chú thêm."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: generationConfig.temperature ?? 0.3,
        max_completion_tokens: 8192
      };

      if (generationConfig.responseFormat === "json") {
        bodyPayload.response_format = { type: "json_object" };
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify(bodyPayload)
      });

      const data = await response.json();

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < 1) {
          await wait(1000 * (attempt + 1) + Math.floor(Math.random() * 500));
          continue;
        }

        const message = data?.error?.message || `Groq API HTTP ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        error.model = model;
        throw error;
      }

      // Check content safety finish reason
      if (data?.choices?.[0]?.finish_reason === "content_filter") {
        const error = new Error("Nội dung bị chặn bởi content filter.");
        error.status = 400;
        error.isContentFilter = true;
        throw error;
      }

      let text = data?.choices?.[0]?.message?.content || "";
      text = stripThinkTags(text);
      text = stripMarkdown(text);

      return { text: text.trim(), model };
    } finally {
      clearTimeout(timeout);
    }
  }

  const error = new Error("Groq API không phản hồi.");
  error.model = model;
  throw error;
}

async function translateWithGemini(apiKey, model, prompt, generationConfig = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: generationConfig.temperature ?? 0.3,
            ...(generationConfig.responseFormat === "json" ? { responseMimeType: "application/json" } : {})
          }
        })
      });
      const data = await response.json();

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < 1) {
          await wait(800 * (attempt + 1));
          continue;
        }

        const message = data?.error?.message || "Gemini API trả về lỗi.";
        const error = new Error(message);
        error.status = response.status;
        error.model = model;
        throw error;
      }

      let text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
      text = stripMarkdown(text);
      return { text, model };
    } finally {
      clearTimeout(timeout);
    }
  }

  const error = new Error("Gemini API trả về lỗi.");
  error.model = model;
  throw error;
}

function assessTranslation(source, translation) {
  const output = String(translation || "").trim();
  if (!output) return { acceptable: false, reason: "kết quả rỗng" };

  const compactSource = normalizeForComparison(source);
  const compactOutput = normalizeForComparison(output);
  if (compactSource && compactSource === compactOutput) {
    return { acceptable: false, reason: "kết quả trùng nguyên văn" };
  }

  const sourceStats = getScriptStats(source);
  const outputStats = getScriptStats(output);
  const sourceIsChinese = sourceStats.han >= 20 && sourceStats.hanRatio >= 0.3;
  if (!sourceIsChinese) return { acceptable: true };

  if (outputStats.han >= 12 && outputStats.hanRatio >= 0.25) {
    return { acceptable: false, reason: "còn quá nhiều chữ Trung" };
  }

  if (compactOutput.length < Math.max(20, compactSource.length * 0.2)) {
    return { acceptable: false, reason: "bản dịch bị thiếu nội dung" };
  }

  return { acceptable: true };
}

function getScriptStats(value) {
  const text = String(value || "");
  const han = (text.match(/\p{Script=Han}/gu) || []).length;
  const latin = (text.match(/\p{Script=Latin}/gu) || []).length;
  return {
    han,
    latin,
    hanRatio: han / Math.max(1, han + latin)
  };
}

function normalizeForComparison(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\p{P}\p{S}\s]/gu, "")
    .toLowerCase();
}

function shouldTryNextModel(error) {
  if (error?.status === 429 || error?.status >= 500) return true;

  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("model") &&
    (message.includes("no longer available") ||
      message.includes("not found") ||
      message.includes("not supported") ||
      message.includes("unavailable") ||
      message.includes("does not exist"))
  );
}

function splitTextIntoChunks(text, maxLength) {
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...splitLongParagraph(paragraph, maxLength));
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxLength) {
      current = candidate;
    } else {
      chunks.push(current);
      current = paragraph;
    }
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}

function splitLongParagraph(paragraph, maxLength) {
  const sentences = paragraph.split(/(?<=[.!?。！？\n])\s*/).map((s) => s.trim()).filter(Boolean);
  const result = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > maxLength) {
      if (current) {
        result.push(current);
        current = "";
      }
      for (let i = 0; i < sentence.length; i += maxLength) {
        result.push(sentence.slice(i, i + maxLength));
      }
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxLength) {
      current = candidate;
    } else {
      if (current) result.push(current);
      current = sentence;
    }
  }

  if (current) result.push(current);
  return result;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(items.length, Math.max(1, concurrency)) }, () => worker());
  await Promise.all(workers);
  return results;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  translateText,
  translateBatchChapters,
  translateMetadata,
  assessTranslation,
  stripMarkdown,
  stripThinkTags,
  splitTextIntoChunks,
  parseApiKeys
};
