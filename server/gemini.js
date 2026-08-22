"use strict";

const dns = require("dns");
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

const { createTranslationEngine } = require("./translation-engine");

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_FALLBACK_MODELS = parseCsv(
  process.env.GROQ_FALLBACK_MODELS || "qwen/qwen3.6-27b,openai/gpt-oss-20b"
);
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct";
const OPENROUTER_FALLBACK_MODELS = parseCsv(
  process.env.OPENROUTER_FALLBACK_MODELS || "deepseek/deepseek-chat,qwen/qwen-2.5-72b-instruct"
);
const TRANSLATE_CHUNK_SIZE = Number(process.env.GEMINI_CHUNK_SIZE || 5000);
const TRANSLATE_CONCURRENCY = Number(process.env.GEMINI_TRANSLATE_CONCURRENCY || 2);
const REQUEST_TIMEOUT_MS = Number(process.env.GROQ_REQUEST_TIMEOUT_MS || process.env.GEMINI_REQUEST_TIMEOUT_MS || 90000);

const defaultEngine = createTranslationEngine();

const DEPRECATED_GROQ_MODELS = new Set([
  "gemma2-9b-it",
  "mixtral-8x7b-32768",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-20b"
]);

function sanitizeGroqModel(model) {
  if (!model || DEPRECATED_GROQ_MODELS.has(model)) return "openai/gpt-oss-120b";
  return model;
}

function getModelsForApiKey(apiKey) {
  if (typeof apiKey !== "string") return [GROQ_MODEL, ...GROQ_FALLBACK_MODELS];
  if (apiKey.startsWith("gsk_")) {
    const rawPrimary = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    const primary = sanitizeGroqModel(rawPrimary);
    const fallbacks = parseCsv(process.env.GROQ_FALLBACK_MODELS || "qwen/qwen3.6-27b,openai/gpt-oss-120b")
      .filter((m) => m && !DEPRECATED_GROQ_MODELS.has(m));
    return [primary, ...fallbacks].filter((m, i, l) => m && l.indexOf(m) === i);
  }
  if (apiKey.startsWith("sk-or-v1-")) {
    const primary = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct";
    const fallbacks = parseCsv(process.env.OPENROUTER_FALLBACK_MODELS || "deepseek/deepseek-chat,qwen/qwen-2.5-72b-instruct");
    return [primary, ...fallbacks].filter((m, i, l) => m && l.indexOf(m) === i);
  }
  if (apiKey.startsWith("cfut_") || apiKey.startsWith("cf_")) {
    const primary = process.env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.1-70b-instruct";
    const fallbacks = parseCsv(
      process.env.CLOUDFLARE_AI_FALLBACK_MODELS ||
        "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b,@cf/meta/llama-3.1-8b-instruct"
    );
    return [primary, ...fallbacks].filter((m, i, l) => m && l.indexOf(m) === i);
  }
  const primary = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  const fallbacks = parseCsv(process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-flash,gemini-flash-latest,gemini-3.7-flash,gemini-1.5-flash");
  return [primary, ...fallbacks].filter((m, i, l) => m && l.indexOf(m) === i);
}

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
    if (token.startsWith("gsk_") || token.startsWith("sk-or-v1-") || token.startsWith("AQ.") || token.startsWith("AIza") || result.length === 0) {
      result.push(token);
    } else {
      result.push(token);
    }
  }

  return result.filter((k) => k.length > 0);
}

function stripThinkTags(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/<think[\s\S]*?(?:<\/think>|$)/gi, "")
    .replace(/<thought[\s\S]*?(?:<\/thought>|$)/gi, "")
    .replace(/<\/(?:think|thought)>/gi, "")
    .trim();
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

  const fromEnv = [
    process.env.GROQ_API_KEYS,
    process.env.GROQ_API_KEY,
    process.env.OPENROUTER_API_KEYS,
    process.env.OPENROUTER_API_KEY
  ].filter(Boolean).join(",");
  return parseApiKeys(fromEnv);
}

async function translateText(text, apiKeys, options = {}) {
  const keyList = getActiveKeys(apiKeys);
  if (!keyList.length) throw new Error("Thiếu GROQ_API_KEY / OPENROUTER_API_KEY.");

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
  const totalTokens = chunkResults.reduce((sum, result) => sum + (result.usage?.total_tokens || 0), 0);

  return {
    translation,
    chunkCount: chunks.length,
    modelsUsed,
    tokensUsed: totalTokens,
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
  if (!keyList.length) throw new Error("Thiếu GROQ_API_KEY / OPENROUTER_API_KEY.");

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

  const fallbackResults = await Promise.all(
    chapters.map(async (ch) => {
      const single = await translateText(ch.content, apiKeys, options);
      return { chapterNumber: ch.chapterNumber, translation: single.translation };
    })
  );
  return fallbackResults;
}

function cleanTranslatedTitle(title) {
  return String(title || "")
    .replace(/[\-_|·].*(bản hoàn chỉnh|đọc miễn phí|trực tuyến|tiểu thuyết|toàn bộ|toàn văn).*$/i, "")
    .replace(/\s*(toàn bộ|toàn văn|hoàn chỉnh|bản toàn thể)?\s*trực tuyến miễn phí đọc\s*$/i, "")
    .replace(/\s*toàn văn đọc miễn phí\s*$/i, "")
    .replace(/\s*bản hoàn chỉnh\s*$/i, "")
    .replace(/\s*bản toàn thể\s*$/i, "")
    .replace(/\s*tiểu thuyết\s*$/i, "")
    .trim();
}

async function translateMetadata(metadata, apiKey) {
  const rawTitle = String(metadata?.title || "")
    .replace(/_?番茄小说.*$/i, "")
    .replace(/[\-_|·]?\s*(完整版|最新章节|免费阅读|全文阅读|小说).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const source = {
    title: cleanMetadataField(rawTitle, 120),
    author: cleanMetadataField(metadata?.author, 100),
    description: cleanMetadataField(metadata?.description, 3000)
  };
  if (!source.title) throw new Error("Metadata thiếu tên truyện.");

  const prompt = [
    "Bạn là biên tập viên kiêm dịch giả tiểu thuyết mạng Trung Quốc (Tiên hiệp, Huyền huyễn, Mạt thế, Quái đàm, Hệ thống, Đô thị) kỳ cựu sang tiếng Việt.",
    "Hãy dịch thông tin metadata sau sang tiếng Việt chuẩn văn phong tiểu thuyết hay và tự nhiên nhất.",
    "",
    "QUY TẮC BẮT BUỘC:",
    "1. TIÊU ĐỀ (title):",
    "   - PHẢI dùng âm Hán-Việt hoặc lối dịch quy ước chuẩn mực của cộng đồng tiểu thuyết cho các danh từ riêng, cảnh giới, thể loại, chiêu thức.",
    "   - Tuyệt đối KHÔNG dịch máy móc từng chữ thô thiển. Không giữ lại các từ quảng cáo đọc miễn phí.",
    "   - Ví dụ chuẩn:",
    "     * 通幽小儒仙 ➔ Thông U Tiểu Nho Tiên",
    "     * 逆徒，你还要忤逆为师多少次？ ➔ Nghịch Đồ, Ngươi Còn Muốn Cãi Lời Vi Sư Bao Nhiêu Lần?",
    "     * 剑道圣体的我只想躺平 ➔ Ta Là Kiếm Đạo Thánh Thể Chỉ Muốn Nằm Ngửa",
    "     * 太古剑尊 ➔ Thái Cổ Kiếm Tôn",
    "     * 我靠避凶天赋苟道长生 ➔ Ta Dựa Vào Thiên Phú Tị Hung Cẩu Đạo Trường Sinh",
    "     * 武道丹帝 ➔ Võ Đạo Đan Đế",
    "     * 太好了，是变态邻居，我们没救了 ➔ Tốt Quá Rồi, Là Hàng Xóm Biến Thái, Chúng Ta Hết Cứu Rồi",
    "     * 盗墓：我拆了格尔木疗养院 ➔ Đạo Mộ: Ta Phá Viện Dưỡng Lão Golmud",
    "     * 踏天境 ➔ Đạp Thiên Cảnh",
    "     * 十日终焉 ➔ Thập Nhật Chung Yên",
    "2. TÁC GIẢ (author):",
    "   - Chuyển 100% tên/bút danh tác giả sang âm Hán-Việt chuẩn xác. Tuyệt đối không để chữ Hán hoặc Pinyin (Ví dụ: 油子吟 ➔ Du Tử Ngâm, 暮霭烟尘 ➔ Mộ Ngải Yên Trần, 青石细语 ➔ Thanh Thạch Tế Ngữ, 鹤顶红加冰 ➔ Hạc Đỉnh Hồng Gia Băng, 吃人的妖怪 ➔ Yêu Quái Ăn Thịt Người).",
    "3. GIỚI THIỆU (description):",
    "   - Dịch toàn bộ giới thiệu trôi chảy, đúng chất tiểu thuyết, xưng hô chuẩn mực (ta-ngươi thay vì tôi-bạn), không tóm tắt, không thêm bình luận.",
    "",
    "Chỉ trả về duy nhất định dạng JSON đúng schema sau:",
    "{\"title\":\"...\",\"author\":\"...\",\"description\":\"...\"}",
    "",
    "Metadata nguồn:",
    JSON.stringify(source)
  ].join("\n");

  let lastError = null;

  const keyList = getActiveKeys(apiKey);
  for (const key of keyList) {
    const models = getModelsForApiKey(key);
    for (const model of models) {
      const formats = key.startsWith("gsk_") ? ["text"] : ["json", "text"];
      for (const format of formats) {
        try {
          const result = await translateChunkWithModel(key, model, prompt, { responseFormat: format, temperature: 0.2 });
          const translated = parseMetadataJson(result.text);
          validateTranslatedMetadata(source, translated);
          return {
            title: cleanTranslatedTitle(cleanMetadataField(translated.title, 120)),
            author: cleanMetadataField(translated.author, 100),
            description: cleanMetadataField(translated.description, 3000),
            model: result.model
          };
        } catch (error) {
          lastError = error;
          if (format === "json" && String(error?.message || "").includes("Failed to generate JSON")) {
            continue;
          }
          if (!shouldTryNextModel(error) && error.status !== 502) break;
        }
      }
    }
  }

  // If AI metadata translation fails and source contains Chinese, throw error so untranslated books are never uploaded!
  if (hasHan(source.title) || hasHan(source.author) || hasHan(source.description)) {
    const err = lastError || new Error("Không thể dịch metadata: Tất cả API key đều hết hạn mức hoặc lỗi mô hình.");
    err.status = lastError?.status || 429;
    throw err;
  }

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
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    }
  } catch {}
  const error = new Error("API trả metadata không đúng định dạng JSON.");
  error.status = 502;
  throw error;
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

// In-memory key health state to track 24/7 key rotation, tokens, and precise cooldowns
const keyHealthMap = new Map();
let globalKeyIndex = 0;

function getKeyHealth(key) {
  if (!keyHealthMap.has(key)) {
    keyHealthMap.set(key, {
      cooldownUntil: 0,
      consecutiveErrors: 0,
      lastUsed: 0,
      tokensUsedSession: 0,
      lastErrorMsg: ""
    });
  }
  return keyHealthMap.get(key);
}

function parseGroqRetryDurationMs(errorMsg) {
  if (!errorMsg || typeof errorMsg !== "string") return 60000;
  // Match "Please try again in 3m50.688s" or "Please try again in 14.5s" or "try again in 1h20m10s"
  const match = errorMsg.match(/try again in (?:(\d+)h)?(?:(\d+)m)?(\d+(?:\.\d+)?)s/i);
  if (match) {
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
    return Math.max(5000, totalMs + 3000); // 3s safety cushion
  }
  if (errorMsg.includes("TPD") || errorMsg.includes("tokens per day")) {
    return 300000; // 5 mins default for TPD
  }
  if (errorMsg.includes("TPM") || errorMsg.includes("tokens per minute")) {
    return 20000; // 20s default for TPM
  }
  return 60000;
}

function markKeyCooldown(key, durationMs = 60000, errorMsg = "") {
  const health = getKeyHealth(key);
  health.cooldownUntil = Date.now() + durationMs;
  health.consecutiveErrors += 1;
  if (errorMsg) health.lastErrorMsg = errorMsg;
}

function markKeySuccess(key, tokens = 0) {
  const health = getKeyHealth(key);
  health.consecutiveErrors = 0;
  health.lastUsed = Date.now();
  health.tokensUsedSession = (health.tokensUsedSession || 0) + tokens;
}

function getKeyPoolStats(keyList = []) {
  const now = Date.now();
  return keyList.map((key, idx) => {
    const health = getKeyHealth(key);
    const onCooldown = health.cooldownUntil > now;
    return {
      index: idx + 1,
      masked: key.slice(0, 8) + "..." + key.slice(-6),
      ready: !onCooldown,
      cooldownRemainingMs: onCooldown ? Math.max(0, health.cooldownUntil - now) : 0,
      consecutiveErrors: health.consecutiveErrors,
      tokensUsedSession: health.tokensUsedSession || 0,
      lastUsed: health.lastUsed ? new Date(health.lastUsed).toISOString() : null
    };
  });
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
  if (!keyList || !keyList.length) {
    throw new Error("Không có API key nào trong danh sách.");
  }

  const nKeys = keyList.length;
  const now = Date.now();
  let lastError = null;

  // Build candidate order starting from globalKeyIndex in strict round-robin fashion
  const startIndex = globalKeyIndex % nKeys;
  const keyOrder = [];
  for (let i = 0; i < nKeys; i++) {
    const idx = (startIndex + i) % nKeys;
    keyOrder.push({ key: keyList[idx], index: idx });
  }

  // Separate keys into: ready (not on cooldown) vs on cooldown
  const readyKeys = keyOrder.filter(({ key }) => getKeyHealth(key).cooldownUntil <= now);
  const cooldownKeys = keyOrder.filter(({ key }) => getKeyHealth(key).cooldownUntil > now);

  // Chain ready keys first, followed by cooldown keys in order of earliest cooldown
  const sortedCooldownKeys = [...cooldownKeys].sort((a, b) => getKeyHealth(a.key).cooldownUntil - getKeyHealth(b.key).cooldownUntil);
  const prioritizedKeys = [...readyKeys, ...sortedCooldownKeys];

  for (const { key: apiKey, index: keyIdx } of prioritizedKeys) {
    const health = getKeyHealth(apiKey);
    const timeUntilReady = health.cooldownUntil - Date.now();
    if (timeUntilReady > 5000) {
      continue;
    }
    if (timeUntilReady > 0) {
      await wait(timeUntilReady + 100);
    }

    const models = getModelsForApiKey(apiKey);
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
        const processedText = engine.postProcessTranslation(result.text, glossary);
        const quality = assessTranslation(text, processedText);
        if (quality.acceptable) {
          markKeySuccess(apiKey, result.usage?.total_tokens || 0);
          // Advance global key pointer so the NEXT request uses the next key
          globalKeyIndex = (keyIdx + 1) % nKeys;
          return { text: processedText, model: result.model, usage: result.usage };
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
          const fallbackClean = engine.postProcessTranslation(text, glossary);
          return { text: fallbackClean || "Nội dung chương đang được cập nhật bản dịch phù hợp.", model: "safety-fallback" };
        }

        if (error.status === 429 || error.status === 403 || error.status === 401) {
          if (modelIndex < models.length - 1 && error.status !== 401) {
            continue;
          }
          const cooldownDuration = error.status === 401 ? 86400000 : parseGroqRetryDurationMs(error.message);
          markKeyCooldown(apiKey, cooldownDuration, error.message);
          break; // Switch to next key in pool immediately
        }
        if (!shouldTryNextModel(error)) break;
      }
    }
  }

  // If initial pass failed, check if any key is nearing cooldown reset
  const earliestCooldown = Math.min(...keyList.map((k) => getKeyHealth(k).cooldownUntil));
  const err = lastError || new Error("Tất cả các API key đều đang trong thời gian chờ hoặc hết hạn mức.");
  err.earliestCooldown = earliestCooldown;
  throw err;
}

async function translateChunkWithModel(apiKey, model, prompt, generationConfig = {}) {
  const isGroq = apiKey.startsWith("gsk_");
  const isOpenRouter = apiKey.startsWith("sk-or-v1-");
  const isCloudflare = apiKey.startsWith("cfut_") || apiKey.startsWith("cf_");
  
  if (isGroq) {
    return translateWithGroq(apiKey, model, prompt, generationConfig);
  } else if (isOpenRouter) {
    return translateWithOpenRouter(apiKey, model, prompt, generationConfig);
  } else if (isCloudflare) {
    return translateWithCloudflareWorkersAi(apiKey, model, prompt, generationConfig);
  } else {
    return translateWithGemini(apiKey, model, prompt, generationConfig);
  }
}

async function translateWithCloudflareWorkersAi(apiKey, model, prompt, generationConfig = {}) {
  let token = apiKey;
  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || "aa644d98f2377007f0fa98abcafe3d21";

  if (typeof apiKey === "string") {
    if (apiKey.includes(":")) {
      const parts = apiKey.split(":");
      if (parts[0].startsWith("cfut_") || parts[0].startsWith("cf_")) {
        token = parts[0];
        accountId = parts[1];
      } else {
        accountId = parts[0];
        token = parts[1];
      }
    } else if (apiKey.includes("@")) {
      const parts = apiKey.split("@");
      token = parts[0];
      accountId = parts[1];
    }
  }

  const cfModel = model && model.startsWith("@cf/") ? model : "@cf/meta/llama-3.1-70b-instruct";
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${cfModel}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content:
                "Bạn là dịch giả văn học mạng Trung - Việt xuất sắc. Hãy dịch toàn bộ sang tiếng Việt tự nhiên, đúng chất tiên hiệp/huyền huyễn."
            },
            { role: "user", content: prompt }
          ],
          max_tokens: generationConfig.maxTokens || 4000
        })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < 1) {
          await wait(800 * (attempt + 1));
          continue;
        }

        const errMsg = Array.isArray(data?.errors) ? data.errors.map((e) => e.message).join(", ") : "Cloudflare AI lỗi.";
        const message = `${errMsg} [Key: ${token.slice(0, 10)}...] (Status: ${response.status})`;
        const error = new Error(message);
        error.status = response.status;
        error.model = cfModel;
        throw error;
      }

      let text = data?.result?.response || "";
      text = stripThinkTags(text);
      text = stripMarkdown(text);
      return { text: text.trim(), model: cfModel, usage: null };
    } finally {
      clearTimeout(timeout);
    }
  }

  const error = new Error("Cloudflare Workers AI không phản hồi.");
  error.model = cfModel;
  throw error;
}

async function translateWithOpenRouter(apiKey, model, prompt, generationConfig = {}) {
  const url = "https://openrouter.ai/api/v1/chat/completions";
  const openRouterModel = model && model.includes("/") ? model : OPENROUTER_MODEL;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const dynamicMaxTokens = Math.min(4096, Math.max(1024, Math.ceil(prompt.length * 1.8)));
      const maxTokens = generationConfig.maxTokens || dynamicMaxTokens;

      const bodyPayload = {
        model: openRouterModel,
        messages: [
          {
            role: "system",
            content: "Bạn là dịch giả văn học tiểu thuyết mạng Trung - Việt xuất sắc nhất (Tiên hiệp, Huyền huyễn, Đô thị, Mạt thế). Hãy dịch toàn bộ sang tiếng Việt tự nhiên, văn phong mượt mà, thuần Việt và chuẩn Hán-Việt 100% cho tên riêng/thuật ngữ. Xưng hô chuẩn mực (ta-ngươi, huynh-đệ, sư phụ-đồ nhi). TUYỆT ĐỐI KHÔNG để sót bất kỳ chữ Hán nào trong bản dịch, mọi từ đều phải chuyển sang tiếng Việt hoặc âm Hán-Việt chuẩn xác. Chỉ trả về duy nhất nội dung đã dịch, không kèm suy nghĩ, lời giải thích hay ghi chú."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: generationConfig.temperature ?? 0.3,
        max_tokens: maxTokens
      };

      if (generationConfig.responseFormat === "json") {
        bodyPayload.response_format = { type: "json_object" };
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://tram-chu.online",
          "X-Title": "Tram Chu Translator"
        },
        signal: controller.signal,
        body: JSON.stringify(bodyPayload)
      });

      const data = await response.json();

      if (!response.ok) {
        const retryable = response.status >= 500;
        if (retryable && attempt < 1) {
          await wait(500 * (attempt + 1));
          continue;
        }

        const message = data?.error?.message || `OpenRouter API HTTP ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        error.model = openRouterModel;
        throw error;
      }

      let text = data?.choices?.[0]?.message?.content || "";
      if (!text.trim()) {
        const emptyError = new Error("OpenRouter API trả về kết quả rỗng.");
        emptyError.model = openRouterModel;
        throw emptyError;
      }

      text = stripThinkTags(text);
      text = stripMarkdown(text);
      return {
        text,
        model: openRouterModel,
        usage: data.usage || {}
      };
    } catch (err) {
      if (err.name === "AbortError") {
        const timeoutError = new Error(`Hết thời gian chờ kết nối OpenRouter (${REQUEST_TIMEOUT_MS}ms).`);
        timeoutError.status = 504;
        timeoutError.model = openRouterModel;
        throw timeoutError;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function translateWithGroq(apiKey, model, prompt, generationConfig = {}) {
  const url = "https://api.groq.com/openai/v1/chat/completions";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      // Dynamic max_tokens based on actual chapter content length to prevent Groq TPM over-reservation
      const dynamicMaxTokens = Math.min(750, Math.max(250, Math.ceil(prompt.length * 0.25)));
      const maxTokens = generationConfig.maxTokens || dynamicMaxTokens;

      const bodyPayload = {
        model,
        messages: [
          {
            role: "system",
            content: "Bạn là dịch giả văn học tiểu thuyết mạng Trung - Việt xuất sắc nhất (Tiên hiệp, Huyền huyễn, Đô thị, Mạt thế). Hãy dịch toàn bộ sang tiếng Việt tự nhiên, văn phong mượt mà, thuần Việt và chuẩn Hán-Việt 100% cho tên riêng/thuật ngữ. Xưng hô chuẩn mực (ta-ngươi, huynh-đệ, sư phụ-đồ nhi). Chỉ trả về duy nhất nội dung đã dịch, không kèm lời giải thích hay ghi chú thêm."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: generationConfig.temperature ?? 0.3,
        max_tokens: maxTokens
      };

      if (generationConfig.responseFormat === "json") {
        bodyPayload.response_format = { type: "json_object" };
      }

      const authHeader = `Bearer ${apiKey.trim()}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify(bodyPayload)
      });

      const data = await response.json();

      if (!response.ok) {
        const retryable = response.status >= 500;
        if (retryable && attempt < 1) {
          await wait(500 * (attempt + 1));
          continue;
        }

        const message = `${data?.error?.message || `Groq API HTTP ${response.status}`} [Key: ${apiKey.slice(0, 15)}...] (Status: ${response.status})`;
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

      return {
        text: text.trim(),
        model,
        usage: data?.usage || null
      };
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
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-client": "gl-node/gemini-translator"
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
          ],
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

        const message = `${data?.error?.message || "Gemini API trả về lỗi."} [Key: ${apiKey.slice(0, 10)}...] (Status: ${response.status})`;
        const error = new Error(message);
        error.status = response.status;
        error.model = model;
        throw error;
      }

      if (data?.candidates?.[0]?.finishReason === "SAFETY") {
        const error = new Error("Nội dung bị chặn bởi bộ lọc an toàn Gemini.");
        error.status = 400;
        error.isContentFilter = true;
        throw error;
      }

      let text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
      text = stripMarkdown(text);
      return { text, model, usage: data?.usageMetadata || null };
    } finally {
      clearTimeout(timeout);
    }
  }

  const error = new Error("Gemini API không phản hồi.");
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
  if (
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("tokens per day") ||
    message.includes("tokens per minute") ||
    message.includes("tpd") ||
    message.includes("tpm") ||
    message.includes("too many requests") ||
    message.includes("resource_exhausted")
  ) {
    return true;
  }
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
  parseApiKeys,
  getKeyPoolStats,
  parseGroqRetryDurationMs
};
