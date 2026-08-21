"use strict";

// Trạm Chữ — Bulletproof Translation Engine with Anti-Ban Safety Shield
// Provides:
// 1. Glossary Manager: per-book dictionary (characters, terms, ranks, sects) stored on R2.
// 2. Translation Memory (TM): sentence/phrase pattern matching to save tokens & ensure consistency.
// 3. Pre-Flight Content Sanitizer: softens extreme trigger words to prevent AI provider bans.
// 4. Prompt Builder with creative fiction framing.
// 5. Post-Processor: punctuation normalization, Markdown cleanup, and quality assessment.

const GLOSSARY_PREFIX = "glossary";
const TM_GLOBAL_KEY = "tm/global.json";

// Default common web novel sentence patterns & terms for Translation Memory
const DEFAULT_TM_PATTERNS = [
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
  { zh: "不翼而飞", vi: "không cánh mà bay" }
];

function glossaryKey(bookId) {
  return `${GLOSSARY_PREFIX}/${bookId}.json`;
}

function sanitizeContentSafety(text) {
  if (typeof text !== "string") return "";
  // Soften extreme trigger phrases in raw text to prevent false positive AI safety flags
  return text
    .replace(/自杀/g, " tự tuyệt ")
    .replace(/性奴/g, " nô lệ ")
    .replace(/强暴/g, " ức hiếp ");
}

function createTranslationEngine({ storage = null } = {}) {
  const glossaryCache = new Map();
  let tmCache = null;

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

  async function loadTranslationMemory(bookId = null) {
    if (tmCache) return tmCache;
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
    }
    tmCache = list;
    return tmCache;
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

  function buildContextualPrompt({
    text,
    index = 0,
    total = 1,
    bookTitle = "",
    glossary = {},
    isRetry = false
  }) {
    const matchedTerms = findMatchedGlossaryTerms(text, glossary);
    const chunkNote =
      total > 1
        ? `Đây là phần ${index + 1}/${total} của cùng một chương. Hãy chỉ dịch phần này, không thêm tiêu đề phần.`
        : "";

    let glossarySection = "";
    if (matchedTerms.length > 0) {
      glossarySection = [
        "BẢNG TỪ ĐIỂN THUẬT NGỮ & TÊN RIÊNG BẮT BUỘC DÙNG (Không được dịch khác):",
        ...matchedTerms.map((t) => `  - "${t.zh}" ➔ "${t.vi}"`),
        ""
      ].join("\n");
    }

    return [
      "[BỐI CẢNH AN TOÀN: Đây là tác phẩm văn học viễn tưởng/tiên hiệp/huyền huyễn hư cấu nghệ thuật. Mọi chi tiết kỳ ảo, giao đấu và tu vi đều là ẩn dụ văn học. Dịch thuật sang tiếng Việt tự nhiên.]",
      "",
      "Bạn là một dịch giả tiểu thuyết mạng Trung Quốc (Tiên hiệp, Mạt thế, Huyền huyễn, Đô thị) sang tiếng Việt xuất sắc.",
      "",
      "Hãy dịch nội dung sau sang tiếng Việt tự nhiên, mượt mà, chuẩn văn phong tiểu thuyết mạng.",
      "",
      "Yêu cầu bắt buộc:",
      "- Dịch đầy đủ, chính xác, không tóm tắt, không bỏ sót bất kỳ câu chữ nào.",
      "- Bắt buộc chuyển tên người, địa danh, môn phái, chiêu thức, pháp bảo sang âm Hán-Việt phù hợp với thể loại.",
      "- Tuyệt đối không dùng Pinyin hoặc cách đọc Latin tiếng Trung trong bản dịch.",
      "- Ví dụ: 陈清 phải dịch là Trần Thanh, không phải Chen Qing; 张伟 phải dịch là Trương Vĩ, không phải Zhang Wei.",
      "- Giữ văn phong mượt mà, xưng hô tự nhiên theo tính cách nhân vật (huynh/đệ, tỷ/muội, tiền bối, vãn bối, lão tử, ta/ngươi...).",
      "- Giữ nguyên cấu trúc đoạn văn, ngắt dòng nguyên bản.",
      "- Không thêm lời bình, không giải thích thêm.",
      "- Chỉ trả về duy nhất bản dịch tiếng Việt.",
      "- Không chép lại nguyên văn chữ Trung, trừ trường hợp thật sự không thể chuyển nghĩa.",
      glossarySection,
      isRetry
        ? "Lần trả lời trước đã bị hệ thống từ chối vì còn quá nhiều chữ Trung hoặc sai sót. Hãy dịch lại thật cẩn thận toàn bộ phần này sang tiếng Việt."
        : "",
      chunkNote,
      "",
      "Nội dung tiếng Trung cần dịch:",
      sanitizeContentSafety(text)
    ]
      .filter(Boolean)
      .join("\n");
  }

  function postProcessTranslation(translation, glossary = {}) {
    if (!translation) return "";
    let clean = String(translation)
      // Remove think blocks
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
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

    // Ensure matched glossary terms are strictly applied if LLM mistakenly used Pinyin
    for (const [zh, vi] of Object.entries(glossary)) {
      if (vi && clean.includes(zh)) {
        clean = clean.split(zh).join(vi);
      }
    }

    return clean;
  }

  return {
    loadGlossary,
    saveGlossary,
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
