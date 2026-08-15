const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_FALLBACK_MODELS = parseCsv(
  process.env.GEMINI_FALLBACK_MODELS || "gemini-3.1-flash-lite,gemini-2.5-flash,gemini-3.5-flash-lite"
);
const GEMINI_CHUNK_SIZE = Number(process.env.GEMINI_CHUNK_SIZE || 4000);
const GEMINI_TRANSLATE_CONCURRENCY = Number(process.env.GEMINI_TRANSLATE_CONCURRENCY || 1);
const GEMINI_REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 120000);

async function translateText(text, apiKey) {
  const chunks = splitTextIntoChunks(text, GEMINI_CHUNK_SIZE);
  const startedAt = Date.now();
  const chunkResults = await mapWithConcurrency(
    chunks,
    Math.max(1, GEMINI_TRANSLATE_CONCURRENCY),
    (chunk, index) => translateChunk(apiKey, chunk, index, chunks.length)
  );
  const translatedChunks = chunkResults.map((result) => result.text);
  const translation = translatedChunks.join("\n\n").trim();
  const modelsUsed = Array.from(new Set(chunkResults.map((result) => result.model)));

  return {
    translation,
    chunkCount: chunks.length,
    modelsUsed,
    elapsedMs: Date.now() - startedAt
  };
}

function buildTranslationPrompt(text, index, total) {
  const chunkNote =
    total > 1
      ? `Đây là phần ${index + 1}/${total} của cùng một chương. Hãy chỉ dịch phần này, không thêm tiêu đề phần.`
      : "";

  return [
    "Bạn là một dịch giả tiểu thuyết Trung Quốc sang tiếng Việt.",
    "",
    "Hãy dịch nội dung sau sang tiếng Việt tự nhiên, dễ đọc như một bản dịch tiểu thuyết.",
    "",
    "Yêu cầu:",
    "- Dịch đầy đủ, không tóm tắt.",
    "- Không bỏ đoạn.",
    "- Giữ nguyên tên nhân vật và địa danh.",
    "- Giữ nguyên cấu trúc đoạn văn.",
    "- Không giải thích thêm.",
    "- Chỉ trả về bản dịch tiếng Việt.",
    chunkNote,
    "",
    "Nội dung cần dịch:",
    text
  ]
    .filter(Boolean)
    .join("\n");
}

async function translateChunk(apiKey, text, index, total) {
  const prompt = buildTranslationPrompt(text, index, total);
  const models = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS].filter(
    (model, modelIndex, list) => model && list.indexOf(model) === modelIndex
  );

  let lastError = null;
  for (const model of models) {
    try {
      return await translateChunkWithModel(apiKey, model, prompt);
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error)) break;
    }
  }

  throw lastError || new Error("Gemini API trả về lỗi.");
}

async function translateChunkWithModel(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);

    try {
      const geminiResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {}
        })
      });
      const data = await geminiResponse.json();

      if (!geminiResponse.ok) {
        const retryable = geminiResponse.status === 429 || geminiResponse.status >= 500;
        if (retryable && attempt < 1) {
          await wait(800 * (attempt + 1));
          continue;
        }

        const message = data?.error?.message || "Gemini API trả về lỗi.";
        const error = new Error(message);
        error.status = geminiResponse.status;
        error.model = model;
        throw error;
      }

      const text =
        data?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("")
          .trim() || "";

      return { text, model };
    } finally {
      clearTimeout(timeout);
    }
  }

  const error = new Error("Gemini API trả về lỗi.");
  error.model = model;
  throw error;
}

function isRetryableGeminiError(error) {
  return error?.status === 429 || error?.status >= 500;
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

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > maxLength && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}

function splitLongParagraph(paragraph, maxLength) {
  const sentences = paragraph.match(/[^。！？!?]+[。！？!?]?/g) || [paragraph];
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    const next = current ? current + sentence : sentence;
    if (next.length > maxLength && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current.trim());
  return chunks;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCsv(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

module.exports = { translateText };
