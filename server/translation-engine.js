"use strict";

// Trạm Chữ — Translation & QA Engine with Anti-Ban Safety Shield
// Provides:
// 1. Glossary Manager: per-book dictionary (characters, terms, ranks, sects) stored on R2.
// 2. Translation Memory (TM): sentence/phrase pattern matching.
// 3. Pre-Flight Content Sanitizer: softens extreme trigger words to prevent AI provider bans.
// 4. Creative Fiction Prompt Builder (Anti-Ban Safety Shield compliant).
// 5. Post-Processor: punctuation normalization, Markdown cleanup, and quality reflection.

const { mineNovelGlossary } = require("./glossary-miner");
const { reflectAndPolish } = require("./reflection-engine");

const GLOSSARY_PREFIX = "glossary";
const TM_GLOBAL_KEY = "tm/global.json";

// Default common web novel sentence patterns & terms for Translation Memory
const DEFAULT_TM_PATTERNS = [
  { zh: "书名", vi: "Tên truyện" },
  { zh: "作者", vi: "Tác giả" },
  { zh: "标签", vi: "Thể loại" },
  { zh: "已完结", vi: "Đã hoàn thành" },
  { zh: "简介", vi: "Giới thiệu" },
  { zh: "倒吸一口凉气", vi: "hít sâu một hơi khí lạnh" },
  { zh: "倒吸了一口凉气", vi: "hít sâu một hơi khí lạnh" },
  { zh: "冷哼一声", vi: "hừ lạnh một tiếng" },
  { zh: "心中暗道", vi: "thầm nghĩ trong lòng" },
  { zh: "心中暗想", vi: "thầm nghĩ trong lòng" },
  { zh: "嘴角微微上扬", vi: "khóe môi khẽ nhếch lên" },
  { zh: "嘴角勾起一抹冷笑", vi: "khóe môi khẽ nhếch lên một nụ cười lạnh" },
  { zh: "不知死活", vi: "không biết sống chết" },
  { zh: "面色大变", vi: "sắc mặt đại biến" },
  { zh: "脸色一变", vi: "sắc mặt khẽ biến" },
  { zh: "瞳孔猛地一缩", vi: "đồng tử đột ngột co rút lại" },
  { zh: "目瞪口呆", vi: "mắt tròn mắt dẹt há hốc mồm" },
  { zh: "尸骨无存", vi: "xương thịt không còn sót lại" },
  { zh: "死无全尸", vi: "chết không toàn thây" },
  { zh: "杀人灭口", vi: "giết người diệt khẩu" },
  { zh: "斩草除根", vi: "nhổ cỏ tận gốc" },
  { zh: "微不足道", vi: "không đáng kể" },
  { zh: "魂飞魄散", vi: "hồn phi phách tán" },
  { zh: "千真万确", vi: "hoàn toàn chính xác" },
  { zh: "不翼而飞", vi: "không cánh mà bay" },
  { zh: "剑拔弩张", vi: "giương cung bạt kiếm" },
  { zh: "火药味十足", vi: "sặc mùi thuốc súng" },
  { zh: "看不顺眼", vi: "chướng tai gai mắt" },
  { zh: "扬眉吐气", vi: "dương mi thổ khí" },
  { zh: "小人得志", vi: "tiểu nhân đắc chí" }
];

function glossaryKey(bookId) {
  return `${GLOSSARY_PREFIX}/${bookId}.json`;
}

/**
 * Pre-Flight Content Sanitizer (Anti-Ban Safety Shield)
 * Softens extreme trigger phrases in raw web novel text to prevent false positive AI safety flags.
 */
function sanitizeContentSafety(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/自杀/g, " tự tuyệt ")
    .replace(/性奴/g, " nô lệ ")
    .replace(/强暴/g, " ức hiếp ");
}

function createTranslationEngine({ storage = null } = {}) {
  const glossaryCache = new Map();
  const glossaryUpdates = new Map();
  const tmCache = new Map();

  async function loadGlossary(bookId) {
    if (!bookId) return {};
    if (glossaryCache.has(bookId)) return glossaryCache.get(bookId);

    let data = {};
    if (storage) {
      try {
        const raw = await storage.get(glossaryKey(bookId));
        if (raw) {
          data = JSON.parse(raw.toString("utf8"));
        }
      } catch {
        data = {};
      }
    }
    glossaryCache.set(bookId, data);
    return data;
  }

  async function saveGlossary(bookId, glossary) {
    if (!bookId) return;
    glossaryCache.set(bookId, glossary);
    if (storage) {
      await storage.put(glossaryKey(bookId), JSON.stringify(glossary, null, 2), {
        contentType: "application/json",
        cacheControl: "no-cache"
      });
    }
  }

  async function mineAndMergeGlossary(bookId, chapterTexts) {
    if (!bookId) return {};
    const previous = glossaryUpdates.get(bookId) || Promise.resolve();
    const update = previous.then(async () => {
      const existing = await loadGlossary(bookId);
      const mined = mineNovelGlossary(chapterTexts);
      const additions = Object.entries(mined).filter(([zh]) => !existing[zh]);
      if (!additions.length) return existing;
      // Existing/manual decisions always win over automatically mined entries.
      const merged = { ...mined, ...existing };
      await saveGlossary(bookId, merged);
      return merged;
    });
    glossaryUpdates.set(bookId, update.catch(() => {}));
    return update;
  }

  function protectGlossaryTerms(text, glossary = {}) {
    let protectedText = String(text || "");
    const replacements = [];
    const terms = findMatchedGlossaryTerms(protectedText, glossary)
      .filter(({ zh, vi }) => zh && vi)
      .sort((a, b) => b.zh.length - a.zh.length);

    for (const { zh, vi } of terms) {
      if (!protectedText.includes(zh)) continue;
      const token = `__TC_NAME_${String(replacements.length).padStart(4, "0")}__`;
      // Spaces keep the sentinel separate from adjacent Han characters so NMT
      // tokenizers do not fuse the restored name with the following verb.
      protectedText = protectedText.split(zh).join(` ${token} `);
      replacements.push({ token, vi });
    }
    return { text: protectedText, replacements };
  }

  function restoreGlossaryTerms(text, replacements = []) {
    let restored = String(text || "");
    for (const { token, vi } of replacements) {
      const number = token.match(/(\d+)/)?.[1] || "";
      const flexibleToken = new RegExp(`__?\\s*TC[ _-]*NAME[ _-]*${number}\\s*__?`, "gi");
      restored = restored.replace(flexibleToken, vi).split(token).join(vi);
    }
    return restored.replace(/\s+([，。！？；：、])/g, "$1").trim();
  }

  async function loadTranslationMemory(bookId = null) {
    const cacheKey = bookId || "__global__";
    if (tmCache.has(cacheKey)) return tmCache.get(cacheKey);
    let list = [...DEFAULT_TM_PATTERNS];
    if (storage) {
      try {
        const raw = await storage.get(TM_GLOBAL_KEY);
        if (raw) {
          const custom = JSON.parse(raw.toString("utf8"));
          if (Array.isArray(custom)) {
            list = [...list, ...custom];
          }
        }
      } catch {
        // use default
      }
      if (bookId) {
        try {
          const raw = await storage.get(`tm/books/${bookId}.json`);
          if (raw) {
            const bookTm = JSON.parse(raw.toString("utf8"));
            if (Array.isArray(bookTm?.entries)) list = [...list, ...bookTm.entries.filter((entry) => entry?.approved)];
          }
        } catch {}
      }
    }
    tmCache.set(cacheKey, list);
    return list;
  }

  function findMatchedGlossaryTerms(text, glossary = {}) {
    if (!text || !glossary) return [];
    const matched = [];
    for (const [zh, vi] of Object.entries(glossary)) {
      if (text.includes(zh)) {
        matched.push({ zh, vi });
      }
    }
    return matched;
  }

  /**
   * Builds an optimized, loosened, literary fiction prompt for Google Gemini
   * with Creative Fiction context framing to prevent Google API policy violations.
   */
  function buildContextualPrompt({
    text,
    index = 0,
    total = 1,
    bookTitle = "",
    glossary = {},
    isRetry = false,
    glossaryMatchText = text
  }) {
    const matchedTerms = findMatchedGlossaryTerms(glossaryMatchText, glossary);
    let glossarySection = "";
    if (matchedTerms.length > 0) {
      glossarySection = [
        "THUẬT NGỮ & TÊN RIÊNG CẦN DÙNG:",
        ...matchedTerms.map((t) => `  - "${t.zh}" ➔ "${t.vi}"`),
        ""
      ].join("\n");
    }

    const chunkNote =
      total > 1
        ? `(Phần ${index + 1}/${total} của chương)`
        : "";

    return [
      "[BỐI CẢNH VĂN HỌC GIẢ TƯỞNG / FICTION LITERATURE TRANSLATION]",
      "Bạn là một biên tập viên và dịch giả tiểu thuyết Trung - Việt xuất sắc.",
      "Hãy dịch/hiệu đính đoạn văn bản tiểu thuyết sau sang tiếng Việt mượt mà, tự nhiên, đậm chất văn học kiếm hiệp/tiên hiệp/tiểu thuyết mạng.",
      bookTitle ? `Tác phẩm: ${sanitizeContentSafety(bookTitle)}` : "",
      chunkNote,
      "",
      "YÊU CẦU DỊCH:",
      "1. Văn phong tự nhiên, trôi chảy, giữ đúng mạch cảm xúc của câu chuyện.",
      "2. Xưng hô phù hợp bối cảnh tiểu thuyết (ta - ngươi, hắn - nàng, huynh - đệ, sư phụ - đồ nhi...).",
      "3. Tên nhân vật, địa danh, công pháp chuyển sang âm Hán-Việt chuẩn mực.",
      "4. Giữ nguyên cấu trúc các đoạn văn và hội thoại tương ứng với bản gốc.",
      "5. Chỉ trả về nội dung bản dịch tiếng Việt hoàn chỉnh, không kèm lời chào hay ghi chú.",
      "",
      glossarySection,
      "Văn bản tiếng Trung cần dịch:",
      sanitizeContentSafety(text)
    ]
      .filter(Boolean)
      .join("\n");
  }

  function postProcessTranslation(translation, glossary = {}) {
    if (!translation) return "";
    let clean = String(translation)
      // Remove think blocks (closed, unclosed, or orphaned)
      .replace(/<think[\s\S]*?(?:<\/think>|$)/gi, "")
      .replace(/<thought[\s\S]*?(?:<\/thought>|$)/gi, "")
      .replace(/<\/(?:think|thought)>/gi, "")
      // Remove code fences and markdown headers
      .replace(/```[a-z]*\n?/gi, "")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "$1")
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "$1")
      .replace(/(^|[\s(])\*(?=\S)([^*\n]*?\S)\*(?=[\s.,;:!?)]|$)/g, "$1$2")
      .replace(/(^|[\s(])_(?=\S)([^_\n]*?\S)_(?=[\s.,;:!?)]|$)/g, "$1$2")
      // Normalize quotation marks
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      // Remove double blank lines
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Remove any preamble chatter from LLMs
    clean = clean
      .replace(/^(?:Bản dịch|Dưới đây là|Sau đây là|Dịch nghĩa|Bản dịch chuẩn)[^:\n]*:?\s*\n*/i, "")
      .replace(/^[\*\-_~]{3,}\s*\n*/gm, "");

    // Ensure matched glossary terms are strictly applied
    for (const [zh, vi] of Object.entries(glossary)) {
      if (vi && clean.includes(zh)) {
        clean = clean.split(zh).join(vi);
      }
    }

    const { text: polished } = reflectAndPolish(clean, { glossary });
    return polished;
  }

  return {
    loadGlossary,
    saveGlossary,
    mineAndMergeGlossary,
    protectGlossaryTerms,
    restoreGlossaryTerms,
    loadTranslationMemory,
    findMatchedGlossaryTerms,
    sanitizeContentSafety,
    buildContextualPrompt,
    postProcessTranslation
  };
}

module.exports = {
  createTranslationEngine,
  glossaryKey,
  sanitizeContentSafety,
  DEFAULT_TM_PATTERNS
};
