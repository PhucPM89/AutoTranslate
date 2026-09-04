"use strict";

const dns = require("dns");
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

const crypto = require("crypto");
const { createTranslationEngine } = require("./translation-engine");
const { detectRawHanVietTranscription } = require("./translation-artifacts");

const TRANSLATE_CHUNK_SIZE = Number(process.env.GEMINI_CHUNK_SIZE || 1800);
const TRANSLATE_CONCURRENCY = Number(process.env.GEMINI_TRANSLATE_CONCURRENCY || 2);
const MAX_KEYS_PER_CHUNK = Math.max(1, Number(process.env.TRANSLATE_MAX_KEYS_PER_CHUNK || 3));
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 90000);
const MINUTE_QUOTA_RECOVERY_MS = Math.max(10_000, Number(process.env.TRANSLATE_MINUTE_QUOTA_RECOVERY_MS || 60_000));
const DAILY_QUOTA_RECOVERY_MS = Math.max(60 * 60_000, Number(process.env.TRANSLATE_DAILY_QUOTA_RECOVERY_MS || 24 * 60 * 60_000));
const QUOTA_SAFETY_MS = Math.max(10_000, Number(process.env.TRANSLATE_QUOTA_SAFETY_MS || 5 * 60_000));

const defaultEngine = createTranslationEngine();

function getModelsForApiKey(apiKey) {
  const isGroq = String(apiKey || "").startsWith("gsk_");
  const primary = isGroq
    ? (process.env.GROQ_MODEL || "qwen/qwen3.8-27b")
    : (process.env.GEMINI_MODEL || "gemini-3.6-flash");
  // Keep a genuinely different fallback. Repeating the primary model made a
  // quality rejection terminal even though this loop is designed to retry the
  // same key with another model.
  const fallbacks = parseCsv(isGroq
    ? (process.env.GROQ_FALLBACK_MODELS || "")
    : (process.env.GEMINI_FALLBACK_MODELS || "gemini-flash-latest"));
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
    if (token.startsWith("gsk_") || token.startsWith("AQ.") || token.startsWith("AIza") || result.length === 0) {
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

function providerPriority(apiKey) {
  const value = String(apiKey || "");
  if (value.startsWith("gsk_")) return 1;
  return 0;
}

function prioritizeProviderFallback(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const priority = providerPriority(entry.key);
    if (!groups.has(priority)) groups.set(priority, []);
    groups.get(priority).push(entry);
  }
  const priorities = [...groups.keys()].sort((a, b) => a - b);
  return priorities.flatMap((priority) => groups.get(priority));
}

function getActiveKeys(apiKeys) {
  const parsed = parseApiKeys(apiKeys);
  if (parsed.length) return parsed;

  const fromEnv = [
    process.env.GROQ_API_KEYS,
    process.env.GROQ_API_KEY,
    process.env.GEMINI_API_KEYS,
    process.env.GEMINI_API_KEY
  ].filter(Boolean).join(",");
  return parseApiKeys(fromEnv);
}

const { translateTextWithHachimi } = require("./hachimi");

async function translateText(text, apiKeys, options = {}) {
  const forceCloud = options.provider === "cloud" || options.forceCloud || options.forceGemini;
  const isGeminiWeb = !forceCloud && (options.provider === "gemini-web" || process.env.TRANSLATION_PROVIDER === "gemini-web");
  const isHachimi =
    !isGeminiWeb && !forceCloud && options.provider !== "gemini" &&
    (options.provider === "hachimi" ||
      (process.env.TRANSLATION_PROVIDER === "hachimi" && !options.forceGemini && options.provider !== "gemini") ||
      (Boolean(process.env.HACHIMI_API_URL) && !apiKeys && !process.env.GEMINI_API_KEY));

  if (isHachimi) {
    const res = await translateTextWithHachimi(text, {
      apiUrl: options.apiUrl || process.env.HACHIMI_API_URL,
      glossary: options.glossary
    });
    return {
      translation: res.translation,
      chunkCount: 1,
      modelsUsed: [res.model || "HachimiMT"],
      tokensUsed: 0,
      startedAt: Date.now() - (res.latencyMs || 0),
      durationMs: res.latencyMs || 0
    };
  }

  const structuralStub = translateStructuralStub(text);
  if (structuralStub) {
    return {
      translation: structuralStub,
      chunkCount: 1,
      modelsUsed: ["local-structure"],
      providersUsed: ["local"],
      tokensUsed: 0,
      elapsedMs: 0
    };
  }

  let bookGlossary = options.glossary || {};
  const bookTitle = options.bookTitle || "";
  const engine = options.engine || defaultEngine;
  if (options.bookId && !options.glossary) {
    bookGlossary = await engine.mineAndMergeGlossary(options.bookId, [text]);
  }
  const translationMemory = options.translationMemory || await engine.loadTranslationMemory(options.bookId || null);
  const glossary = {
    ...Object.fromEntries(
      (translationMemory || [])
        .filter((entry) => entry?.zh && entry?.vi && String(text).includes(entry.zh))
        .map((entry) => [entry.zh, entry.vi])
    ),
    // Per-book decisions always win over global conventions.
    ...bookGlossary
  };

  const chunks = splitTextIntoChunks(text, TRANSLATE_CHUNK_SIZE);
  const startedAt = Date.now();

  let chunkResults;
  if (isGeminiWeb) {
    const webConcurrency = 1;
    chunkResults = await mapWithConcurrency(
      chunks,
      webConcurrency,
      (chunk, index) =>
        translateChunkWithGeminiWeb(chunk, index, chunks.length, {
          glossary,
          bookTitle,
          engine,
          profileSlotId: options.profileSlotId || options.slotId
        })
    );
  } else {
    const keyList = getActiveKeys(apiKeys);
    if (!keyList.length) throw new Error("Thiếu GROQ_API_KEY / GEMINI_API_KEY (hoặc HACHIMI_API_URL).");
    chunkResults = await mapWithConcurrency(
      chunks,
      Math.max(1, TRANSLATE_CONCURRENCY),
      (chunk, index) =>
        translateChunkWithKeyPool(keyList, chunk, index, chunks.length, {
          glossary,
          bookTitle,
          engine
        })
    );
  }

  const translatedChunks = chunkResults.map((result) => result.text);
  const rawTranslation = translatedChunks.join("\n\n").trim();
  const translation = engine.postProcessTranslation(rawTranslation, glossary);
  const modelsUsed = Array.from(new Set(chunkResults.map((result) => result.model)));
  const providersUsed = Array.from(new Set(chunkResults.map((result) => result.provider).filter(Boolean)));
  const totalTokens = chunkResults.reduce((sum, result) => sum + (result.usage?.total_tokens || 0), 0);

  return {
    translation,
    chunkCount: chunks.length,
    modelsUsed,
    providersUsed,
    tokensUsed: totalTokens,
    elapsedMs: Date.now() - startedAt
  };
}

function translateStructuralStub(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  const direct = {
    "目录": "Mục lục",
    "全部章节": "Toàn bộ chương",
    "正文": "Chính văn",
    "序章": "Chương mở đầu",
    "楔子": "Lời dẫn"
  };
  if (direct[compact]) return direct[compact];
  const volume = compact.match(/^第([一二三四五六七八九十百千万\d]+)卷$/u);
  if (volume) return `Quyển thứ ${translateOrdinalNumber(volume[1])}`;
  return "";
}

function translateOrdinalNumber(value) {
  const raw = String(value || "");
  const direct = {
    "一": "nhất",
    "二": "hai",
    "三": "ba",
    "四": "tư",
    "五": "năm",
    "六": "sáu",
    "七": "bảy",
    "八": "tám",
    "九": "chín",
    "十": "mười"
  };
  return direct[raw] || raw;
}

async function translateChunkWithGeminiWeb(text, index, total, { glossary = {}, bookTitle = "", engine = defaultEngine, profileSlotId = null } = {}) {
  let lastError = null;
  let draftCandidate = "";
  let qualityReason = "";
  const locked = engine.protectGlossaryTerms(text, glossary);
  const maxAttempts = Math.max(1, Number(process.env.GEMINI_WEB_MAX_ATTEMPTS || 2));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const prompt = draftCandidate
      ? buildTargetedRepairPrompt({
          sourceText: text,
          draftTranslation: draftCandidate,
          issueReason: qualityReason,
          glossary,
          bookTitle,
          index,
          total,
          repairAttempt: attempt
        })
      : engine.buildContextualPrompt({
          text,
          index,
          total,
          bookTitle,
          glossary,
          glossaryMatchText: text,
          isRetry: Boolean(lastError) || attempt > 0
        });

    try {
      if (typeof process === "undefined" || !process.versions?.node) {
        throw new Error("Gemini Web chỉ chạy trong Node local, không chạy trong Worker runtime.");
      }
      const dynamicRequire = eval("require");
      const { translateWithGeminiWeb } = dynamicRequire("./gemini-web");
      const result = await translateWithGeminiWeb(prompt, { profileSlotId });
      const processedText = engine.restoreGlossaryTerms(
        engine.postProcessTranslation(result.text, glossary),
        locked.replacements
      );
      const normalizedText = rebalanceCollapsedParagraphs(text, processedText);
      const quality = assessTranslation(text, normalizedText);
      if (quality.acceptable) {
        return { text: normalizedText, model: result.model, provider: result.provider, usage: result.usage };
      }

      lastError = new Error(`Bản dịch Gemini Web chưa đạt yêu cầu (${quality.reason}).`);
      lastError.status = 502;
      lastError.code = "translation_rejected";
      lastError.qualityRejected = true;
      lastError.qualityReason = quality.reason;
      draftCandidate = normalizedText || processedText || result.text || "";
      qualityReason = quality.reason || "";
    } catch (error) {
      lastError = error;
      if (isGeminiWebTimeoutError(error) || error?.code === "gemini_web_failed") {
        console.warn(`[Gemini Web] chunk ${index + 1}/${total} attempt ${attempt + 1}/${maxAttempts} failed: ${String(error.message || error).slice(0, 220)}`);
      }
      if (isGeminiWebTimeoutError(error) && !draftCandidate) break;
    }
  }

  const err = new Error(lastError ? String(lastError.message || lastError) : "Gemini Web không trả bản dịch đạt yêu cầu.");
  err.code = lastError?.qualityRejected ? "translation_rejected" : "gemini_web_failed";
  err.qualityRejected = Boolean(lastError?.qualityRejected);
  if (lastError?.qualityReason) err.qualityReason = lastError.qualityReason;
  err.status = lastError?.status || 502;
  throw err;
}

function isGeminiWebTimeoutError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "");
  return code.includes("timeout") || /quá thời gian|timeout/i.test(message);
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
  parts.push("Bạn là một tiểu thuyết gia kiêm biên dịch viên Trung - Việt xuất sắc.");
  parts.push("Hãy chuyển ngữ trọn vẹn các chương truyện sau sang tiếng Việt thuần thục, mượt mà, đúng chất văn học mạng.");
  parts.push("Yêu cầu bắt buộc:");
  parts.push("- Diễn đạt thuần Việt 100%, tự nhiên, không dịch bám từ hay giữ nguyên cấu trúc ngữ pháp tiếng Trung.");
  parts.push("- Chỉ chuyển âm Hán-Việt cho tên người, địa danh, môn phái, cảnh giới, công pháp và thuật ngữ thực sự.");
  parts.push("- Đại từ, động từ, liên từ và khẩu ngữ đời thường phải dịch nghĩa thuần Việt (ví dụ: 'trán của mình' thay vì 'tự kỷ đích ấn đường', 'sải bước' thay vì 'mai bộ', 'mở cửa' thay vì 'đả khai môn', 'ngón tay' thay vì 'thủ chỉ', 'lá gan của tôi đã bị dọa cho bay sạch rồi' thay vì 'đảm tử bị hách một liễu / canh của ta...').");
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
  const original = String(title || "").trim();
  const cleaned = original
    .replace(/[\-_|·].*(bản hoàn chỉnh|đọc miễn phí|trực tuyến|tiểu thuyết|toàn bộ|toàn văn).*$/i, "")
    .replace(/\s*(toàn bộ|toàn văn|hoàn chỉnh|bản toàn thể)?\s*trực tuyến miễn phí đọc\s*$/i, "")
    .replace(/\s*toàn văn đọc miễn phí\s*$/i, "")
    .replace(/\s*bản hoàn chỉnh\s*$/i, "")
    .replace(/\s*bản toàn thể\s*$/i, "")
    .replace(/\s*tiểu thuyết\s*$/i, "")
    .trim();
  return cleaned || original;
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
      const formats = ["json", "text"];
      for (const format of formats) {
        try {
          const result = await translateChunkWithModel(key, model, prompt, { responseFormat: format, temperature: 0.2 });
          const translated = parseMetadataJson(result.text);
          validateTranslatedMetadata(source, translated);
          return {
            title: cleanTranslatedTitle(cleanMetadataField(translated.title, 120)),
            author: cleanMetadataField(translated.author, 100),
            description: cleanMetadataField(translated.description, 3000),
            model: result.model,
            provider: result.provider
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
      lastErrorMsg: "",
      quotaClass: "",
      recoveryPolicy: ""
    });
  }
  return keyHealthMap.get(key);
}

function parseGroqRetryDurationMs(errorMsg) {
  if (!errorMsg || typeof errorMsg !== "string") return 60000;
  // Match "Please retry in 58.09s" (Gemini) or "Please try again in 3m50.688s" (Groq)
  const match = errorMsg.match(/(?:try again in|retry in)\s+(?:(\d+)h)?(?:(\d+)m)?(\d+(?:\.\d+)?)s/i);
  if (match) {
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
    return Math.max(2000, totalMs + 1000); // 1s safety cushion
  }
  if (errorMsg.includes("TPD") || errorMsg.includes("tokens per day")) {
    return 300000; // 5 mins default for TPD
  }
  if (errorMsg.includes("TPM") || errorMsg.includes("tokens per minute")) {
    return 20000; // 20s default for TPM
  }
  if (errorMsg.includes("generativelanguage.googleapis") || errorMsg.toLowerCase().includes("current quota")) {
    return 15 * 60 * 1000;
  }
  return 60000;
}

function classifyQuotaError(errorMsg) {
  const message = String(errorMsg || "").toLowerCase();
  // Day/minute limits are matched first, by their explicit dimension words
  if (/\b(tpd|rpd|qpd)\b|tokens? per day|requests? per day|queries per day|per-day|daily (?:free )?(?:allocation|quota|limit)|neurons/.test(message)) {
    return "daily";
  }
  if (/\b(tpm|rpm|itpm|otpm|qpm)\b|queries per minute|tokens? per minute|requests? per minute|per-minute|limit.*minute/i.test(message)) {
    return "minute";
  }
  // Transient server-side hiccups (503/500, "high demand", overloaded) are NOT
  // quota exhaustion — the model is momentarily busy and recovers in seconds.
  if (/high demand|overloaded|temporarily unavailable|service unavailable|internal error|\b50[03]\b/.test(message)) {
    return "transient";
  }
  return "quota";
}

function parseRateLimitHeaders(headers) {
  if (!headers || typeof headers.get !== "function") return {};
  const retryAfter = Number(headers.get("retry-after"));
  return {
    retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0
  };
}

function nextPacificMidnightMs(now = Date.now()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23"
  });
  const current = Object.fromEntries(formatter.formatToParts(new Date(now)).map((part) => [part.type, Number(part.value)]));
  const tomorrow = new Date(Date.UTC(current.year, current.month - 1, current.day + 1));
  let candidate = Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 8);
  const local = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, Number(part.value)]));
  if (local.year === tomorrow.getUTCFullYear() && local.month === tomorrow.getUTCMonth() + 1 && local.day === tomorrow.getUTCDate()) {
    candidate -= local.hour * 60 * 60_000;
  }
  return candidate;
}

function computeQuotaRecovery(error, apiKey, now = Date.now()) {
  const message = String(error?.message || error || "");
  const quotaClass = classifyQuotaError(message);
  const providerWait = Math.max(0, Number(error?.retryAfterMs || 0), parseGroqRetryDurationMs(message));
  const isGemini = !String(apiKey || "").startsWith("gsk_");

  if (quotaClass === "daily") {
    const fullResetWait = isGemini
      ? Math.max(60_000, nextPacificMidnightMs(now) - now)
      : DAILY_QUOTA_RECOVERY_MS;
    return { quotaClass, durationMs: Math.max(providerWait, fullResetWait) + QUOTA_SAFETY_MS, policy: "wait_full_daily_reset" };
  }
  if (quotaClass === "minute") {
    return { quotaClass, durationMs: Math.max(providerWait, MINUTE_QUOTA_RECOVERY_MS) + 30_000, policy: "wait_full_minute_window" };
  }
  if (quotaClass === "transient") {
    // A busy model, not an exhausted key: back off briefly and try again, so one
    // 503 does not sideline the key for a day.
    return { quotaClass, durationMs: Math.max(providerWait, 45_000), policy: "retry_after_transient" };
  }

  // If the provider omits the exhausted dimension, guessing a short window can
  // recreate the refill-drain loop. A full conservative cycle is safer.
  return { quotaClass, durationMs: Math.max(providerWait, DAILY_QUOTA_RECOVERY_MS) + QUOTA_SAFETY_MS, policy: "wait_conservative_full_cycle" };
}

function markKeyCooldown(key, durationMs = 60000, errorMsg = "", details = {}) {
  const health = getKeyHealth(key);
  health.cooldownUntil = Date.now() + durationMs;
  health.consecutiveErrors += 1;
  if (errorMsg) health.lastErrorMsg = errorMsg;
  health.quotaClass = String(details.quotaClass || "");
  health.recoveryPolicy = String(details.policy || "");
}

function markKeySuccess(key, tokens = 0) {
  const health = getKeyHealth(key);
  health.consecutiveErrors = 0;
  health.lastUsed = Date.now();
  health.tokensUsedSession = (health.tokensUsedSession || 0) + tokens;
  health.quotaClass = "";
  health.recoveryPolicy = "";
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
      lastUsed: health.lastUsed ? new Date(health.lastUsed).toISOString() : null,
      quotaClass: health.quotaClass || "",
      recoveryPolicy: health.recoveryPolicy || "",
      resumesAt: onCooldown ? new Date(health.cooldownUntil).toISOString() : null
    };
  });
}

function keyFingerprint(key) {
  const value = String(key || "");
  const hash = crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
  return `k_${hash}`;
}

function exportKeyPoolState(keyList = []) {
  return {
    schema: 2,
    updatedAt: new Date().toISOString(),
    cursor: globalKeyIndex,
    keys: keyList.map((key) => {
      const health = getKeyHealth(key);
      return {
        id: keyFingerprint(key),
        cooldownUntil: Number(health.cooldownUntil || 0),
        consecutiveErrors: Number(health.consecutiveErrors || 0),
        lastUsed: Number(health.lastUsed || 0),
        tokensUsedSession: Number(health.tokensUsedSession || 0),
        lastErrorMsg: String(health.lastErrorMsg || "").slice(0, 300),
        quotaClass: String(health.quotaClass || ""),
        recoveryPolicy: String(health.recoveryPolicy || "")
      };
    })
  };
}

function importKeyPoolState(snapshot, keyList = []) {
  if (!snapshot || !Array.isArray(snapshot.keys)) return;
  const byId = new Map(snapshot.keys.map((entry) => [entry.id, entry]));
  const cursor = Number(snapshot?.cursor);
  globalKeyIndex = Number.isFinite(cursor) && cursor >= 0 ? cursor : 0;
  for (const key of keyList) {
    const saved = byId.get(keyFingerprint(key)) || byId.get(`${key.slice(0, 8)}...${key.slice(-6)}`);
    if (!saved) continue;
    const health = getKeyHealth(key);
    health.cooldownUntil = Math.max(0, Number(saved.cooldownUntil || 0));
    health.consecutiveErrors = Math.max(0, Number(saved.consecutiveErrors || 0));
    health.lastUsed = Math.max(0, Number(saved.lastUsed || 0));
    health.tokensUsedSession = Math.max(0, Number(saved.tokensUsedSession || 0));
    health.lastErrorMsg = String(saved.lastErrorMsg || "").slice(0, 300);
    health.quotaClass = String(saved.quotaClass || "");
    health.recoveryPolicy = String(saved.recoveryPolicy || "");
    // Schema 1 used the provider's "next request" delay. Upgrade an existing
    // quota lock before this process can call the provider again.
    const needsQuotaUpgrade = Number(snapshot.schema || 1) < 2 || health.recoveryPolicy === "exponential_quota_circuit";
    if (needsQuotaUpgrade && /quota|rate limit|\b(tpd|tpm|rpd|rpm)\b|tokens? per|requests? per|retry in|try again in/i.test(health.lastErrorMsg)) {
      const recovery = computeQuotaRecovery({
        message: health.lastErrorMsg,
        consecutiveErrors: health.consecutiveErrors
      }, key);
      health.cooldownUntil = Math.max(health.cooldownUntil, Date.now() + recovery.durationMs);
      health.quotaClass = recovery.quotaClass;
      health.recoveryPolicy = recovery.policy;
    }
  }
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
  let draftCandidate = "";
  let qualityReason = "";
  const locked = engine.protectGlossaryTerms(text, glossary);

  // Build candidate order starting from globalKeyIndex in strict round-robin fashion
  // Reserve the starting key synchronously. Concurrent chunks used to read the
  // same pointer before any response arrived, then stampede every key in the
  // same order instead of spreading work across the pool.
  const keyOrder = reserveKeyOrder(keyList);

  // Separate keys into: ready (not on cooldown) vs on cooldown
  const readyKeys = prioritizeProviderFallback(
    keyOrder.filter(({ key }) => getKeyHealth(key).cooldownUntil <= now)
  );
  const cooldownKeys = keyOrder.filter(({ key }) => getKeyHealth(key).cooldownUntil > now);

  // Chain ready keys first, followed by cooldown keys in order of earliest cooldown
  const sortedCooldownKeys = [...cooldownKeys].sort((a, b) => getKeyHealth(a.key).cooldownUntil - getKeyHealth(b.key).cooldownUntil);
  const prioritizedKeys = [...readyKeys, ...sortedCooldownKeys];

  let triedKeys = 0;
  for (const { key: apiKey } of prioritizedKeys) {
    const health = getKeyHealth(apiKey);
    const timeUntilReady = health.cooldownUntil - Date.now();
    if (timeUntilReady > 5000) {
      continue;
    }
    if (timeUntilReady > 0) {
      await wait(timeUntilReady + 100);
    }
    if (triedKeys >= MAX_KEYS_PER_CHUNK) break;
    triedKeys += 1;

    const models = getModelsForApiKey(apiKey);
    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
      const model = models[modelIndex];
      const prompt = draftCandidate
        ? buildTargetedRepairPrompt({
            sourceText: text,
            draftTranslation: draftCandidate,
            issueReason: qualityReason,
            glossary,
            bookTitle,
            index,
            total,
            repairAttempt: modelIndex + 1
          })
        : engine.buildContextualPrompt({
            text: text,
            index,
            total,
            bookTitle,
            glossary,
            glossaryMatchText: text,
            // A pool with one model per key still needs the corrective retry prompt
            // after another key returned incomplete or untranslated text.
            isRetry: Boolean(lastError) || modelIndex > 0
          });

      try {
        const isGroq = apiKey.startsWith("gsk_");
        const result = await translateChunkWithModel(apiKey, model, prompt, {
          maxTokens: isGroq ? outputTokenBudget(text) : 16384
        });
        const processedText = engine.restoreGlossaryTerms(
          engine.postProcessTranslation(result.text, glossary),
          locked.replacements
        );
        const quality = assessTranslation(text, processedText);
        if (quality.acceptable) {
          markKeySuccess(apiKey, result.usage?.total_tokens || 0);
          return { text: processedText, model: result.model, provider: result.provider, usage: result.usage };
        }

        const error = new Error(`Bản dịch chưa đạt yêu cầu (${quality.reason}).`);
        error.status = 502;
        error.model = model;
        lastError = error;
        draftCandidate = processedText || result.text || "";
        qualityReason = quality.reason || "";
        continue;
      } catch (error) {
        lastError = error;

        // Anti-Ban Safety Circuit Breaker:
        if (isContentSafetyRefusal(null, error)) {
          console.warn(`Model ${model} từ chối nội dung; chuyển key thay vì xuất bản nguyên văn.`);
          break;
        }

        if (error.status === 429 || error.status === 403 || error.status === 401) {
          const recovery = error.status === 429
            ? computeQuotaRecovery({
                message: error.message,
                retryAfterMs: error.retryAfterMs,
                consecutiveErrors: health.consecutiveErrors
              }, apiKey)
            : { durationMs: 24 * 60 * 60_000, quotaClass: "auth", policy: "disable_invalid_key" };
          markKeyCooldown(apiKey, recovery.durationMs, error.message, recovery);
          break; // Switch to next key in pool immediately
        }
        if (!shouldTryNextModel(error)) break;
      }
    }
  }

  // The key slice is exhausted. If the only thing wrong was a few residual Han
  // characters in an otherwise complete translation (repair could not clear a
  // rare glyph), publish that near-complete candidate rather than failing the
  // chunk — which made the chapter retry the whole pool over and over (13+
  // attempts, burning quota, never publishing).
  if (draftCandidate) {
    const stats = getScriptStats(draftCandidate);
    if (stats.han > 0 && stats.han <= 8) {
      return { text: draftCandidate, model: "residual-han-accepted", usage: {} };
    }
  }

  // If initial pass failed, check if any key is nearing cooldown reset
  const futureCooldowns = keyList
    .map((key) => getKeyHealth(key).cooldownUntil)
    .filter((until) => until > Date.now());
  const readyKeysRemaining = keyList.filter((key) => getKeyHealth(key).cooldownUntil <= Date.now()).length;
  const earliestCooldown = readyKeysRemaining > 0
    ? Date.now() + 2000
    : futureCooldowns.length ? Math.min(...futureCooldowns) : Date.now() + 30000;
  // Build a FRESH error rather than mutating lastError: a native fetch/undici
  // error can have a read-only `code` getter, and assigning to it threw
  // "Cannot set property code", masking the real cause and killing the run.
  const err = new Error(lastError ? String(lastError.message || lastError) : "Tất cả các API key đều đang trong thời gian chờ hoặc hết hạn mức.");
  err.earliestCooldown = earliestCooldown;
  // Distinguish WHY the slice was exhausted. A 502 lastError with keys still
  // ready means every key produced an UNACCEPTABLE translation (residual Han,
  // repetition, truncation) — the keys are fine, the chapter is hard. That must
  // NOT be treated as a quota/rate problem: doing so made the queue decrement
  // attempts and retry the same poison chapter forever, freezing all progress.
  // Only a genuine cooldown/rate exhaustion (no ready keys, or a 429/503
  // lastError) keeps the quota code so the queue defers instead of failing.
  const qualityRejection =
    readyKeysRemaining > 0 &&
    lastError &&
    lastError.status === 502 &&
    lastError.status !== 429 &&
    lastError.status !== 503;
  if (qualityRejection) {
    err.code = "translation_rejected";
    err.qualityRejected = true;
    err.qualityReason = String(lastError.message || "").slice(0, 200);
  } else {
    err.code = (lastError && lastError.code) || "key_pool_slice_exhausted";
  }
  if (lastError && lastError.status) err.status = lastError.status;
  throw err;
}

// Generic structured call used by semantic QA. It deliberately shares the
// translation key pool and cooldown state, so a QA daemon cannot hammer a key
// that the translation worker has already marked as exhausted.
async function generateStructuredText(prompt, apiKeys, generationConfig = {}) {
  const keyList = getActiveKeys(apiKeys);
  if (!keyList.length) throw new Error("Không có API key cloud cho semantic review.");

  const now = Date.now();
  const ordered = prioritizeProviderFallback(
    reserveKeyOrder(keyList)
      .filter(({ key }) => getKeyHealth(key).cooldownUntil <= now)
  );
  let lastError = null;
  let triedKeys = 0;

  for (const { key } of ordered) {
    const health = getKeyHealth(key);
    if (health.cooldownUntil > now) continue;
    if (triedKeys >= MAX_KEYS_PER_CHUNK) break;
    triedKeys += 1;

    for (const model of getModelsForApiKey(key)) {
      try {
        const result = await translateChunkWithModel(key, model, prompt, {
          responseFormat: generationConfig.responseFormat || "json",
          temperature: generationConfig.temperature ?? 0.1,
          thinkingBudget: generationConfig.thinkingBudget ?? 256,
          maxTokens: generationConfig.maxTokens || 16384
        });
        markKeySuccess(key, result.usage?.total_tokens || 0);
        return result;
      } catch (error) {
        lastError = error;
        if ([401, 403, 429].includes(error.status)) {
          const recovery = error.status === 429
            ? computeQuotaRecovery(error, key)
            : { durationMs: 24 * 60 * 60_000, quotaClass: "auth", policy: "disable_invalid_key" };
          markKeyCooldown(key, recovery.durationMs, error.message, recovery);
          break;
        }
        if (!shouldTryNextModel(error)) break;
      }
    }
  }

  const error = new Error(lastError?.message || "Không còn API key cloud sẵn sàng cho semantic review.");
  error.code = lastError?.code || "semantic_key_pool_exhausted";
  error.status = lastError?.status;
  throw error;
}

function sanitizeContentSafety(text) {
  if (!text || typeof text !== "string") return "";
  return text.trim();
}

function buildTargetedRepairPrompt({
  sourceText = "",
  draftTranslation = "",
  issueReason = "",
  glossary = {},
  bookTitle = "",
  index = 0,
  total = 1,
  repairAttempt = 1
} = {}) {
  const matchedTerms = defaultEngine.findMatchedGlossaryTerms(sourceText, glossary);
  let glossarySection = "";
  if (matchedTerms.length > 0) {
    glossarySection = [
      "THUẬT NGỮ & TÊN RIÊNG BẮT BUỘC TUÂN THỦ:",
      ...matchedTerms.map((t) => `  - "${t.zh}" ➔ "${t.vi}"`),
      ""
    ].join("\n");
  }

  const chunkNote = total > 1 ? `(Phần ${index + 1}/${total} của chương)` : "";

  // Actionable repair directives based on specific issues detected
  const issueDirectives = [];

  // 1. Check for residual Han glyphs
  const hanMatches = String(draftTranslation).match(/[\u4e00-\u9fa5]+/gu) || [];
  if (hanMatches.length > 0 || issueReason.includes("chữ Hán")) {
    const sampleHan = Array.from(new Set(hanMatches)).slice(0, 8).join(", ");
    issueDirectives.push(
      `- SỬA TRIỆT ĐỂ CHỮ HÁN CÒN SÓT: Bản nháp còn sót chữ Hán${sampleHan ? ` (ví dụ: ${sampleHan})` : ""}. Đối chiếu với nguyên tác tiếng Trung để chuyển ngữ toàn bộ sang tiếng Việt hoặc âm Hán-Việt chuẩn xác. Tuyệt đối KHÔNG ĐỂ LẠI BẤT KỲ CHỮ HÁN NÀO.`
    );
  }

  // 2. Check for missing / truncated content
  const sourceLen = String(sourceText).length;
  const draftLen = String(draftTranslation).length;
  if (draftLen < sourceLen * 0.65 || issueReason.includes("lược bớt") || issueReason.includes("cụt câu") || issueReason.includes("thiếu nội dung") || issueReason.includes("chỉ trả tiêu đề") || issueReason.includes("cấu trúc đoạn")) {
    issueDirectives.push(
      `- BỔ SUNG ĐẦY ĐỦ CÁC ĐOẠN/CÂU BỊ THIẾU: Bản nháp hiện tại bị ngắn hoặc thiếu chi tiết so với bản gốc (${draftLen} ký tự so với ${sourceLen} ký tự gốc). Hãy đối chiếu từng đoạn của Nguyên tác để bổ sung toàn bộ nội dung còn thiếu, không tóm tắt, giữ nguyên tình tiết và lời thoại.`
    );
    issueDirectives.push(
      `- KHÔNG GỘP ĐOẠN: Mỗi đoạn trong nguyên tác phải có một đoạn dịch tương ứng. Giữa hai đoạn dịch phải có một dòng trống. Nếu bản nháp đang dính thành một khối, hãy chia lại theo mạch câu và lời thoại.`
    );
  }

  // 3. Check for repetitive paragraphs or runaway loop
  if (issueReason.includes("lặp") || draftLen > sourceLen * 4.0) {
    issueDirectives.push(
      `- LOẠI BỎ LẶP NỘI DUNG: Bản nháp có hiện tượng lặp lại câu/đoạn. Hãy loại bỏ các phần trùng lặp và giữ mạch văn liên tục, gọn ghẽ theo đúng nguyên tác.`
    );
  }

  // 4. Strip provider UI/code artifacts that can leak from web automation.
  if (/rác giao diện|gemini said|show code|code fence|python|javascript|markdown/i.test(issueReason) || detectProviderUiGarbage(draftTranslation)) {
    issueDirectives.push(
      `- XÓA RÁC GIAO DIỆN/CODE: Bản nháp có lẫn chữ/nút của Gemini Web hoặc khối code như "Gemini said", "Show code", "Copy code", "python", dấu \`\`\`. Hãy loại bỏ toàn bộ các dòng rác đó và chỉ giữ văn bản truyện đã dịch sang tiếng Việt.`
    );
  }

  // 5. Check for stiff Han-Viet or literal grammar artifacts
  if (issueReason.includes("sượng") || issueReason.includes("Hán-Việt") || issueReason.includes("chúng tôi đích")) {
    issueDirectives.push(
      `- CHUỐT LẠI VĂN PHONG THUẦN VIỆT: Sửa các cụm từ Hán-Việt sượng, dịch máy móc (như "tự kỷ đích", "không khỏi có chút", "nói không ra lời" -> "nghẹn lời", "bị sợ nhảy dựng" -> "giật nảy mình",...) thành câu văn tiếng Việt giàu hình ảnh, biểu cảm.`
    );
  }

  // Fallback directive if no specific flag matched
  if (issueDirectives.length === 0) {
    issueDirectives.push(
      `- KIỂM TRA ĐỐI CHIẾU & HOÀN THIỆN: Rà soát bản dịch nháp đối chiếu với nguyên tác tiếng Trung, sửa các lỗi ngữ nghĩa, chính tả, sót câu hoặc sót chữ Hán còn tồn đọng.`
    );
  }

  return [
    "[CHẾ ĐỘ TỰ PHẢN TỈNH & SỬA LỖI BẢN DỊCH / REFLECTION & REPAIR MODE]",
    "Bạn là một biên tập viên tiểu thuyết kỳ cựu đang chỉnh sửa bản dịch Trung - Việt.",
    bookTitle ? `Tác phẩm: ${sanitizeContentSafety(bookTitle)}` : "",
    chunkNote,
    "",
    "Dưới đây là (1) NGUYÊN TÁC TIẾNG TRUNG và (2) BẢN DỊCH NHÁP TIẾNG VIỆT vừa tạo ra.",
    repairAttempt > 1 ? `Đây là lượt tự vá lỗi thứ ${repairAttempt}; bản trước vẫn không qua hậu kiểm, vì vậy hãy rà đối chiếu kỹ hơn trước khi trả lời.` : "",
    "Bản dịch nháp cần được bạn chỉnh sửa, bổ sung và hoàn thiện theo các chỉ dẫn sau:",
    ...issueDirectives,
    "",
    "NGUYÊN TẮC BIÊN TẬP:",
    "1. Giữ lại những đoạn tiếng Việt đã dịch tốt và mượt mà trong Bản Nháp.",
    "2. Đối chiếu với Nguyên Tác để bổ sung những câu/đoạn còn thiếu, sửa những từ dịch sai hoặc sót.",
    "3. Xưng hô chuẩn phong cách tiểu thuyết (ta - ngươi, hắn - nàng, huynh - đệ...).",
    "4. Giữ xuống dòng rõ ràng: mỗi đoạn dịch cách nhau bằng một dòng trống; không gộp toàn chương thành một khối.",
    "5. Tuyệt đối không để sót bất kỳ chữ Hán nào trong kết quả cuối cùng.",
    "6. Chỉ trả về bản dịch tiếng Việt HOÀN CHỈNH cuối cùng sau khi đã sửa xong, không kèm lời chào hay giải thích.",
    "",
    glossarySection,
    "=== 1. NGUYÊN TÁC TIẾNG TRUNG ===",
    sanitizeContentSafety(sourceText),
    "",
    "=== 2. BẢN DỊCH NHÁP CẦN SỬA ===",
    draftTranslation
  ]
    .filter(Boolean)
    .join("\n");
}

function buildResidualHanRepairPrompt(translation, sourceText = "") {
  if (sourceText) {
    return buildTargetedRepairPrompt({
      sourceText,
      draftTranslation: translation,
      issueReason: "chữ Hán"
    });
  }
  return [
    "Bạn là biên tập viên bản dịch Trung - Việt.",
    "Bản dịch tiếng Việt dưới đây đã đầy đủ nhưng còn sót một vài chữ Hán.",
    "Hãy thay TOÀN BỘ chữ Hán còn sót bằng từ tiếng Việt hoặc âm Hán-Việt phù hợp với ngữ cảnh.",
    "Trước khi trả lời, tự kiểm tra từng dòng và chỉ xuất bản khi không còn bất kỳ Hán tự/Chinese character nào.",
    "Giữ nguyên toàn bộ nội dung tiếng Việt, con số, lời thoại và cấu trúc đoạn; không tóm tắt, không giải thích.",
    "Chỉ trả về bản dịch đã sửa và tuyệt đối không còn bất kỳ chữ Hán nào.",
    "",
    translation
  ].join("\n");
}

function outputTokenBudget(sourceText) {
  // Vietnamese output is usually longer than Chinese source, but basing the
  // budget on the full prompt also charges the repeated instruction block as if
  // it were output. That inflated every reservation and exhausted shared TPD.
  // Groq Free counts the requested completion budget toward its 8K TPM gate.
  // A 16K model limit is therefore not a usable per-request budget: a normal
  // 1,800-character chunk plus a 5,400-token reservation is rejected before
  // generation starts. 4,096 remains comfortably above real Vietnamese output
  // for one chunk while keeping prompt + completion below the free-tier gate.
  return Math.min(4096, Math.max(1200, Math.ceil(String(sourceText || "").length * 2)));
}

function reserveKeyOrder(keyList) {
  const nKeys = keyList.length;
  if (!nKeys) return [];
  const startIndex = globalKeyIndex % nKeys;
  globalKeyIndex = (globalKeyIndex + Math.min(nKeys, MAX_KEYS_PER_CHUNK)) % nKeys;
  return Array.from({ length: nKeys }, (_, offset) => {
    const index = (startIndex + offset) % nKeys;
    return { key: keyList[index], index };
  });
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
      const dynamicMaxTokens = Math.min(4096, Math.max(1200, Math.ceil(prompt.length * 1.1)));
      const maxTokens = generationConfig.maxTokens || dynamicMaxTokens;

      const bodyPayload = {
        model,
        messages: [
          {
            role: "system",
            content: "Bạn là dịch giả văn học tiểu thuyết mạng Trung - Việt xuất sắc nhất (Tiên hiệp, Huyền huyễn, Đô thị, Mạt thế). Dịch nguyên văn 1:1, đầy đủ 100% từng câu từng chữ, tiếng Việt tự nhiên. Chỉ dùng âm Hán-Việt cho tên riêng, địa danh, môn phái, cảnh giới, công pháp và thuật ngữ; tuyệt đối không chuyển âm các từ thường ngày/đại từ/động từ/liên từ như ông nội, tôi, bạn, giúp, dạy, lại, đang. Xưng hô chuẩn mực theo ngữ cảnh. TUYỆT ĐỐI KHÔNG tóm tắt, KHÔNG lược bớt, giữ nguyên cấu trúc phân đoạn. Chỉ trả về duy nhất nội dung đã dịch, không kèm lời giải thích hay ghi chú."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: generationConfig.temperature ?? 0.2,
        max_tokens: maxTokens
      };

      if (generationConfig.responseFormat === "json") {
        bodyPayload.response_format = { type: "json_object" };
      } else if (model.includes("qwen")) {
        // `reasoning_format: hidden` still spends reasoning tokens; it merely
        // hides them. Translation needs non-thinking mode so the output budget
        // is reserved for the Vietnamese text itself.
        bodyPayload.reasoning_effort = "none";
      } else if (model.includes("gpt-oss")) {
        bodyPayload.reasoning_effort = "low";
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
        // Let 429 reach the pool circuit breaker immediately. Retrying here
        // consumed the tiny amount of quota that had just recovered.
        const retryable = response.status >= 500;
        if (retryable && attempt < 1) {
          await wait(800 * (attempt + 1));
          continue;
        }

        const message = `${data?.error?.message || "Groq API trả về lỗi."} (Status: ${response.status})`;
        const error = new Error(message);
        error.status = response.status;
        error.model = model;
        Object.assign(error, parseRateLimitHeaders(response.headers));
        throw error;
      }

      if (data?.choices?.[0]?.finish_reason === "length") {
        const error = new Error("Groq dừng vì chạm giới hạn output token; không xuất bản bản dịch cụt.");
        error.status = 502;
        error.model = model;
        throw error;
      }

      let text = data?.choices?.[0]?.message?.content || "";
      text = stripThinkTags(text);
      text = stripMarkdown(text);

      return {
        text: text.trim(),
        model,
        provider: "groq",
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
  const baseUrl = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const cfToken = process.env.CLOUDFLARE_API_TOKEN || "";
  const isGateway = baseUrl.includes("gateway.ai.cloudflare.com");
  const url = isGateway
    ? `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`
    : `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-api-client": "gl-node/gemini-translator"
      };
      if (isGateway && cfToken) {
        headers["cf-aig-authorization"] = `Bearer ${cfToken}`;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
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
            temperature: generationConfig.temperature ?? 0.2,
            maxOutputTokens: generationConfig.maxTokens || 16384,
            thinkingConfig: { thinkingBudget: generationConfig.thinkingBudget !== undefined ? generationConfig.thinkingBudget : 100 },
            ...(generationConfig.responseFormat === "json" ? { responseMimeType: "application/json" } : {})
          }
        })
      });
      const data = await response.json();

      if (!response.ok) {
        const retryable = response.status >= 500;
        if (retryable && attempt < 1) {
          await wait(800 * (attempt + 1));
          continue;
        }

        const message = `${data?.error?.message || "Gemini API trả về lỗi."} (Status: ${response.status})`;
        const error = new Error(message);
        error.status = response.status;
        error.model = model;
        Object.assign(error, parseRateLimitHeaders(response.headers));
        throw error;
      }

      if (data?.candidates?.[0]?.finishReason === "SAFETY") {
        const error = new Error("Nội dung bị chặn bởi bộ lọc an toàn Gemini.");
        error.status = 400;
        error.isContentFilter = true;
        throw error;
      }
      if (data?.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        const error = new Error("Gemini dừng vì chạm giới hạn output token; không xuất bản bản dịch cụt.");
        error.status = 502;
        error.model = model;
        throw error;
      }

      let text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
      text = stripMarkdown(text);
      return { text, model, provider: "gemini", usage: data?.usageMetadata || null };
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

  const providerGarbage = detectProviderUiGarbage(output);
  if (providerGarbage) {
    return { acceptable: false, reason: `bản dịch lẫn rác giao diện/code (${providerGarbage})` };
  }

  const compactSource = normalizeForComparison(source);
  const compactOutput = normalizeForComparison(output);
  if (compactSource && compactSource === compactOutput) {
    return { acceptable: false, reason: "kết quả trùng nguyên văn bản gốc" };
  }

  const sourceStats = getScriptStats(source);
  const outputStats = getScriptStats(output);
  const sourceIsChinese = sourceStats.han >= 20 && sourceStats.hanRatio >= 0.3;
  if (!sourceIsChinese) return { acceptable: true };

  const outputLines = output.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const titleOnly =
    source.length >= 500 &&
    outputLines.length <= 2 &&
    output.length <= 220 &&
    /^(?:chương|chuong|chapter|tiêu đề|tên chương)\b|^.{1,80}[:：]\s*.{0,120}$/iu.test(outputLines.join(" "));
  if (titleOnly) {
    return { acceptable: false, reason: "Gemini Web chỉ trả tiêu đề/tóm tắt ngắn, thiếu nội dung chương" };
  }

  // 1. Kiểm tra sót chữ Hán (nếu sót nhiều hơn 2 chữ Hán thì yêu cầu sửa)
  if (outputStats.han > 2) {
    return { acceptable: false, reason: `vẫn còn sót ${outputStats.han} chữ Hán chưa được chuyển ngữ` };
  }

  const literalIssue = detectLiteralEverydayHanViet(source, output);
  if (literalIssue) {
    return { acceptable: false, reason: literalIssue };
  }
  if (detectRawHanVietTranscription(output)) {
    return { acceptable: false, reason: "bản dịch còn nguyên phiên âm Hán-Việt/pinyin thô" };
  }

  // 2. Đảm bảo độ đầy đủ nội dung (chống cắt cụt hoặc lặp vô tận)
  if (source.length >= 250) {
    const ratio = output.length / Math.max(1, source.length);
    if (ratio < 0.60) {
      return { acceptable: false, reason: `bản dịch bị lược bớt/cụt câu (độ dài chỉ đạt ${Math.round(ratio * 100)}% so với bản gốc)` };
    }
    if (ratio > 4.5) {
      return { acceptable: false, reason: `bản dịch dài bất thường (${Math.round(ratio * 100)}% bản gốc), có khả năng lặp nội dung` };
    }
  }

  // 3. Đảm bảo cấu trúc số đoạn văn tương đối phù hợp (nới lỏng để không drop chương)
  const sourceParagraphs = paragraphCount(source);
  const outputParagraphs = paragraphCount(output);
  if (sourceParagraphs >= 8 && outputParagraphs < Math.max(2, Math.ceil(sourceParagraphs * 0.20))) {
    return {
      acceptable: false,
      reason: `cấu trúc đoạn bị mất (${outputParagraphs}/${sourceParagraphs} đoạn)`
    };
  }

  // Chống lặp nguyên đoạn văn dài (model failure)
  const normalizedParagraphs = output
    .split(/\n{2,}/)
    .map(normalizeForComparison)
    .filter((paragraph) => paragraph.length >= 120);
  if (new Set(normalizedParagraphs).size < normalizedParagraphs.length) {
    return { acceptable: false, reason: "bản dịch lặp nguyên đoạn dài" };
  }

  // 4. Kiểm tra bảo toàn số lượng và dữ liệu định lượng
  const outputNumbers = new Set(extractNumbers(output));
  const outputLower = output.toLowerCase();
  const numberWords = {
    "0": ["không"],
    "1": ["một", "nhất", "đầu"],
    "2": ["hai", "nhị", "đôi"],
    "3": ["ba", "tam"],
    "4": ["bốn", "tư", "tứ"],
    "5": ["năm", "ngũ"],
    "6": ["sáu", "lục"],
    "7": ["bảy", "thất"],
    "8": ["tám", "bát"],
    "9": ["chín", "cửu"],
    "10": ["mười", "thập"],
    "20": ["hai mươi", "hai chục"],
    "30": ["ba mươi", "ba chục"],
    "50": ["năm mươi"],
    "100": ["trăm", "bách", "một trăm"],
    "1000": ["nghìn", "ngàn", "thiên", "một nghìn", "một ngàn"],
    "10000": ["vạn", "mười nghìn", "mười ngàn"]
  };
  const sourceLines = String(source || "").split(/\r?\n/).filter(Boolean);
  const sourceForNumbers = (sourceLines.length > 1 && /^第\s*\d+\s*章/i.test(sourceLines[0].trim()))
    ? sourceLines.slice(1).join("\n")
    : source;
  const missingNumber = extractNumbers(sourceForNumbers).find((number) => {
    if (!number || outputNumbers.has(number) || output.includes(number)) return false;
    const words = numberWords[number] || viNumberToWords(number);
    return !(words && words.some((word) => outputLower.includes(word)));
  });
  if (missingNumber) {
    return { acceptable: false, reason: `bản dịch làm mất số ${missingNumber}` };
  }

  // 5. Kiểm tra câu cụt / đứt gãy ở cuối đoạn
  const cleanOutput = output.trim();
  const doubleQuotes = (cleanOutput.match(/"/g) || []).length;
  const smartDoubleOpen = (cleanOutput.match(/“/g) || []).length;
  const smartDoubleClose = (cleanOutput.match(/”/g) || []).length;
  const smartSingleOpen = (cleanOutput.match(/‘/g) || []).length;
  const smartSingleClose = (cleanOutput.match(/’/g) || []).length;
  const bracketOpen = (cleanOutput.match(/[【「『]/g) || []).length;
  const bracketClose = (cleanOutput.match(/[】」』]/g) || []).length;

  const hasUnclosedQuote =
    doubleQuotes % 2 !== 0 ||
    smartDoubleOpen > smartDoubleClose ||
    smartSingleOpen > smartSingleClose;
  const hasUnclosedBracket = bracketOpen > bracketClose;
  const endsWithTerminalPunctuation = /[.!?…~。！？]["'”’』」】\)）]?$/.test(cleanOutput);
  const endsWithMidSentenceSeparator = /[,\-:;、，；：—]\s*$/.test(cleanOutput);

  if (source.length > 500) {
    if (endsWithMidSentenceSeparator) {
      return { acceptable: false, reason: "câu cuối bị đứt gãy ngang chừng (kết thúc bằng dấu nối/phẩy)" };
    }
    if ((hasUnclosedQuote || hasUnclosedBracket) && !endsWithTerminalPunctuation && !/["'”’』」】]$/.test(cleanOutput)) {
      return { acceptable: false, reason: "câu cuối bị đứt gãy / cụt dấu đóng ngoặc" };
    }
  }

  return { acceptable: true };
}

function detectProviderUiGarbage(text) {
  const value = String(text || "");
  if (!value) return "";
  if (/```/.test(value)) return "code fence";
  if (/^\s*Gemini said\s*:?/im.test(value)) return "Gemini said";
  const fileTag = value.match(/\[file-tag:[^\]]+\]/iu);
  if (fileTag) return fileTag[0];
  if (/^\s*(?:your text file is ready|bản dịch tiếng việt .{0,260}?(?:sẵn sàng|hoàn thành|hoàn chỉnh)[.!?。]?)/imu.test(value)) return "response meta";

  const uiLineRe = /^(?:gemini said|show thinking|thinking|sources|drafts|show code|hide code|copy code|copy|run|share|retry|modify response|edit in gemini|more drafts|use code with caution|content_copy|thumb_up|thumb_down|more_vert|google search|xem mã|ẩn mã|sao chép mã|sao chép|chạy|chia sẻ|thử lại|sửa trong gemini)$/iu;
  const codeLanguageLineRe = /^(?:python|py|javascript|js|typescript|ts|json|html|css|bash|shell|powershell|plaintext|text|markdown|xml|yaml|yml)$/iu;
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const badLine = lines.find((line) => uiLineRe.test(line) || codeLanguageLineRe.test(line));
  return badLine || "";
}

function detectLiteralEverydayHanViet(source, translation) {
  const sourceText = String(source || "");
  const output = String(translation || "");
  const rules = [
    { zh: "爷爷", vi: /\bGia Gia\b/iu, meaning: "ông nội" },
    { zh: "奶奶", vi: /\bNãi Nãi\b/iu, meaning: "bà nội" },
    { zh: "爸爸", vi: /\bBa Ba\b/iu, meaning: "bố" },
    { zh: "妈妈", vi: /\bMụ Mụ\b/iu, meaning: "mẹ" },
    { zh: "哥哥", vi: /\bCa Ca\b/iu, meaning: "anh trai" },
    { zh: "姐姐", vi: /\bTỷ Tỷ\b/iu, meaning: "chị gái" },
    { zh: "弟弟", vi: /\bĐệ Đệ\b/iu, meaning: "em trai" },
    { zh: "妹妹", vi: /\bMuội Muội\b/iu, meaning: "em gái" },
    { zh: "叔叔", vi: /\bThúc Thúc\b/iu, meaning: "chú" },
    { zh: "阿姨", vi: /\bA Di\b/iu, meaning: "dì" },
    { zh: "我", vi: /\bNgã\b/iu, meaning: "tôi/ta" },
    { zh: "你", vi: /\bNhĩ\b/iu, meaning: "bạn/ngươi" },
    { zh: "却", vi: /\bKhước\b/iu, meaning: "lại/vậy mà" },
    { zh: "爷爷教", vi: /\bGiáo\b/iu, meaning: "dạy" },
    { zh: "帮我", vi: /\bBang\b/iu, meaning: "giúp tôi" }
  ];
  const hit = rules.find((rule) => sourceText.includes(rule.zh) && rule.vi.test(output));
  if (!hit) return "";
  return `bản dịch chuyển âm máy móc từ thường ngày; cần dịch nghĩa "${hit.meaning}" thay vì Hán-Việt hóa`;
}

function rebalanceCollapsedParagraphs(source, translation) {
  const output = String(translation || "").trim();
  if (!output) return output;

  const sourceParagraphs = paragraphCount(source);
  const outputParagraphs = paragraphCount(output);
  const requiredParagraphs = Math.max(2, Math.ceil(sourceParagraphs * 0.20));
  if (sourceParagraphs < 8 || outputParagraphs >= requiredParagraphs) return output;

  const ratio = output.length / Math.max(1, String(source || "").length);
  if (ratio < 0.75 || detectProviderUiGarbage(output)) return output;

  const sentences = output
    .replace(/\r\n?/g, "\n")
    .split(/(?<=[.!?…。！？;；:：])\s+|(?<=[.!?…。！？;；:：])(?=["'“”‘’\p{Lu}À-Ỵ])/gu)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length < requiredParagraphs) return output;

  const targetParagraphs = Math.min(sourceParagraphs, sentences.length);
  const groups = [];
  for (let i = 0; i < targetParagraphs; i += 1) {
    const start = Math.floor((i * sentences.length) / targetParagraphs);
    const end = Math.floor(((i + 1) * sentences.length) / targetParagraphs);
    const paragraph = sentences.slice(start, Math.max(start + 1, end)).join(" ").trim();
    if (paragraph) groups.push(paragraph);
  }
  return groups.length >= requiredParagraphs ? groups.join("\n\n") : output;
}

function paragraphCount(value) {
  return String(value || "").split(/\n+/).map((part) => part.trim()).filter(Boolean).length;
}

function viNumberToWords(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0 || n > 999999999) return [];
  const digits = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  if (n < 10) return [digits[n]];
  if (n === 10) return ["mười", "thập"];
  if (n < 20) return ["mười " + (n === 15 ? "lăm" : (n === 11 ? "một" : digits[n % 10]))];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const r = n % 10;
    const ten = (d === 2 ? "hai mươi" : (d === 3 ? "ba mươi" : (d === 4 ? "bốn mươi" : digits[d] + " mươi")));
    const base = [ten, ten.replace("mươi", "chục")];
    if (r === 0) return base;
    const suffixes = (r === 1 ? ["mốt", "một"] : (r === 4 ? ["tư", "bốn"] : (r === 5 ? ["lăm", "năm"] : [digits[r]])));
    const variants = base.flatMap(b => suffixes.map(s => b + " " + s));
    if (d === 2 && r === 1) variants.push("hai mốt");
    return variants;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    const hundred = digits[h] + " trăm";
    if (r === 0) return [hundred];
    const sub = viNumberToWords(r);
    const res = sub.flatMap(s => [hundred + " " + s, r < 10 ? hundred + " lẻ " + s : ""]).filter(Boolean);
    if (r === 50) res.push(hundred + " rưỡi");
    return res;
  }
  if (n < 1000000) {
    const k = Math.floor(n / 1000);
    const r = n % 1000;
    const kWords = viNumberToWords(k);
    const prefixes = kWords.flatMap(kw => [kw + " nghìn", kw + " ngàn", kw === "một" ? "nghìn" : "", kw === "một" ? "ngàn" : ""]).filter(Boolean);
    if (r === 0) return prefixes;
    if (r === 500) {
      const halves = prefixes.map(p => p + " rưỡi");
      const sub = viNumberToWords(r);
      return [...halves, ...prefixes.flatMap(p => sub.map(s => p + " " + s))];
    }
    const sub = viNumberToWords(r);
    return prefixes.flatMap(p => sub.map(s => p + " " + s));
  }
  return [];
}

function normalizeNumber(value) {
  return String(value || "").replace(/[.,](?=\d)/g, "").replace(/^0+(?=\d)/, "");
}

function extractNumbers(value) {
  return (String(value || "").match(/\d+(?:[.,]\d+)*/g) || []).map(normalizeNumber);
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
  generateStructuredText,
  assessTranslation,
  detectProviderUiGarbage,
  stripMarkdown,
  stripThinkTags,
  splitTextIntoChunks,
  parseApiKeys,
  getActiveKeys,
  getKeyPoolStats,
  parseGroqRetryDurationMs,
  classifyQuotaError,
  computeQuotaRecovery,
  nextPacificMidnightMs,
  reserveKeyOrder,
  outputTokenBudget,
  buildResidualHanRepairPrompt,
  buildTargetedRepairPrompt,
  exportKeyPoolState,
  importKeyPoolState,
  keyFingerprint,
  cleanTranslatedTitle,
  getModelsForApiKey,
  providerPriority,
  prioritizeProviderFallback,
  rebalanceCollapsedParagraphs
};
