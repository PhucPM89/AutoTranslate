const { createTranslationEngine } = require("./translation-engine");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_FALLBACK_MODELS = parseCsv(
  process.env.GEMINI_FALLBACK_MODELS || "gemini-1.5-flash,gemini-1.5-pro"
);
const GEMINI_CHUNK_SIZE = Number(process.env.GEMINI_CHUNK_SIZE || 4000);
const GEMINI_TRANSLATE_CONCURRENCY = Number(process.env.GEMINI_TRANSLATE_CONCURRENCY || 1);
const GEMINI_REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 120000);

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
    if (token.startsWith("AQ.") || token.startsWith("AIza") || result.length === 0) {
      result.push(token);
    } else {
      // If browser wrapped the key across newlines without a comma, rejoin it
      result[result.length - 1] += token;
    }
  }

  return result.filter((k) => k.length > 0);
}

async function translateText(text, apiKeys, options = {}) {
  const keyList = parseApiKeys(apiKeys);
  if (!keyList.length) throw new Error("Thiếu GEMINI_API_KEY.");

  const glossary = options.glossary || {};
  const bookTitle = options.bookTitle || "";
  const engine = options.engine || defaultEngine;

  const chunks = splitTextIntoChunks(text, GEMINI_CHUNK_SIZE);
  const startedAt = Date.now();

  let keyIndex = 0;
  function getNextKey() {
    const key = keyList[keyIndex % keyList.length];
    keyIndex += 1;
    return key;
  }

  const chunkResults = await mapWithConcurrency(
    chunks,
    Math.max(1, GEMINI_TRANSLATE_CONCURRENCY),
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

  const keyList = parseApiKeys(apiKeys);
  if (!keyList.length) throw new Error("Thiếu GEMINI_API_KEY.");

  const glossary = options.glossary || {};
  const bookTitle = options.bookTitle || "";
  const engine = options.engine || defaultEngine;

  // Build packed prompt
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
      // Matches both with explicit closing delimiter or preceding next chapter start / end of string
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

  // Fallback to translating each individually
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
    "- Chỉ trả về JSON đúng schema: {\"title\":\"...\",\"author\":\"...\",\"description\":\"...\"}.",
    "Metadata nguồn:",
    JSON.stringify(source)
  ].join("\n");
  const models = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS].filter((model, index, list) => model && list.indexOf(model) === index);
  let lastError = null;

  for (const model of models) {
    try {
      const result = await translateChunkWithModel(apiKey, model, prompt, { responseMimeType: "application/json", temperature: 0.2 });
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
  throw lastError || new Error("Gemini không dịch được metadata truyện.");
}

function parseMetadataJson(value) {
  try {
    return JSON.parse(String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch {
    const error = new Error("Gemini trả metadata không đúng JSON.");
    error.status = 502;
    throw error;
  }
}

function validateTranslatedMetadata(source, translated) {
  if (!translated || typeof translated !== "object" || !cleanMetadataField(translated.title, 120)) {
    const error = new Error("Gemini không trả tên truyện đã dịch.");
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

// Gemini decorates prose with Markdown even when the prompt asks for plain text
// - chapter headings came back as **Chương 7: ...** and the reader, which renders
// text nodes rather than HTML, showed the asterisks. Only emphasis, headings and
// code fences are removed; a lone asterisk in the prose survives because every
// pattern needs a matched pair wrapped around non-space content.
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

function buildTranslationPrompt(text, index, total, isRetry = false) {
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
    "- Bắt buộc chuyển tên người, địa danh, môn phái, chiêu thức và pháp khí sang âm Hán-Việt phù hợp với ngữ cảnh.",
    "- Tuyệt đối không dùng Pinyin hoặc cách đọc Latin tiếng Trung trong bản dịch.",
    "- Ví dụ: 陈清 phải dịch là Trần Thanh, không phải Chen Qing; 张伟 phải dịch là Trương Vĩ, không phải Zhang Wei.",
    "- Giữ nhất quán cách gọi tên riêng trong toàn bộ phần dịch.",
    "- Giữ nguyên cấu trúc đoạn văn.",
    "- Không giải thích thêm.",
    "- Chỉ trả về bản dịch tiếng Việt.",
    "- Không chép lại nguyên văn chữ Trung, trừ trường hợp thật sự không thể chuyển nghĩa.",
    isRetry
      ? "Lần trả lời trước đã bị hệ thống từ chối vì còn quá nhiều chữ Trung. Hãy dịch lại toàn bộ phần này sang tiếng Việt."
      : "",
    chunkNote,
    "",
    "Nội dung cần dịch:",
    text
  ]
    .filter(Boolean)
    .join("\n");
}

async function translateChunkWithKeyPool(keyList, text, index, total, { glossary = {}, bookTitle = "", engine = defaultEngine } = {}) {
  const models = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS].filter(
    (model, modelIndex, list) => model && list.indexOf(model) === modelIndex
  );

  let lastError = null;

  for (let keyIdx = 0; keyIdx < keyList.length; keyIdx += 1) {
    const apiKey = keyList[keyIdx];

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
        if (quality.acceptable) return result;

        const error = new Error(`Gemini trả về nội dung chưa được dịch (${quality.reason}).`);
        error.status = 502;
        error.model = model;
        lastError = error;
        continue;
      } catch (error) {
        lastError = error;
        // If rate limited on this key (429 or quota), break model loop to try the next API key!
        if (error.status === 429 || error.status === 403) {
          console.warn(`API Key ...${apiKey.slice(-4)} bị giới hạn quota (${error.status}), chuyển sang key tiếp theo...`);
          break;
        }
        if (!shouldTryNextModel(error)) break;
      }
    }
  }

  throw lastError || new Error("Gemini API trả về lỗi trên toàn bộ các key.");
}

async function translateChunk(apiKey, text, index, total) {
  return translateChunkWithKeyPool([apiKey], text, index, total);
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

async function translateChunkWithModel(apiKey, model, prompt, generationConfig = {}) {
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
          generationConfig
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

function shouldTryNextModel(error) {
  if (error?.status === 429 || error?.status >= 500) return true;

  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("model") &&
    (message.includes("no longer available") ||
      message.includes("not found") ||
      message.includes("not supported") ||
      message.includes("unavailable"))
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
    const pieces = splitByLength(sentence, maxLength);
    for (const piece of pieces) {
      const next = current ? current + piece : piece;
      if (next.length > maxLength && current) {
        chunks.push(current.trim());
        current = piece;
      } else {
        current = next;
      }
    }
  }

  if (current) chunks.push(current.trim());
  return chunks;
}

function splitByLength(text, maxLength) {
  const pieces = [];
  for (let start = 0; start < text.length; start += maxLength) {
    pieces.push(text.slice(start, start + maxLength));
  }
  return pieces.length ? pieces : [text];
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
  return String(value || "")
    .split(/[\r\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

module.exports = {
  translateText,
  translateBatchChapters,
  translateMetadata,
  assessTranslation,
  splitTextIntoChunks,
  stripMarkdown,
  parseApiKeys
};
