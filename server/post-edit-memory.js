"use strict";

/**
 * Context & Memory Manager
 * Handles bilingual sentence segmentation, sliding context windows,
 * and persistent Entity & Terminology memories for novels.
 */

function splitSentences(text, isChinese = false) {
  const str = String(text || "").trim();
  if (!str) return [];

  const isCN = isChinese || /[\u4e00-\u9fa5]/.test(str);
  const sentences = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    current += ch;

    // Handle quotes: Chinese quotes (“...”, ‘...’) and standard quotes ("...", '...')
    if (!inQuote) {
      if (ch === "“" || ch === "”" || ch === "‘" || ch === "’" || ch === '"') {
        inQuote = true;
        quoteChar = ch === "“" ? "”" : (ch === "‘" ? "’" : ch);
      }
    } else {
      if (ch === quoteChar || (quoteChar === "”" && ch === "”") || (quoteChar === "’" && ch === "’")) {
        inQuote = false;
      }
    }

    if (!inQuote) {
      const isEnd = isCN
        ? (ch === "。" || ch === "！" || ch === "？" || ch === "…" || ch === "\n")
        : (ch === "." || ch === "!" || ch === "?" || ch === "\n");

      if (isEnd) {
        // Look ahead to consume consecutive dots / ellipses
        while (i + 1 < str.length && (str[i + 1] === "." || str[i + 1] === "…" || str[i + 1] === "。")) {
          i++;
          current += str[i];
        }
        // Look ahead to capture trailing quotes
        while (i + 1 < str.length && (str[i + 1] === "”" || str[i + 1] === "’" || str[i + 1] === '"' || str[i + 1] === " " || str[i + 1] === "】")) {
          i++;
          current += str[i];
        }
        const trimmed = current.trim();
        if (trimmed && /[\u4e00-\u9fa5a-zA-Z0-9]/.test(trimmed)) {
          sentences.push(trimmed);
        }
        current = "";
      }
    }
  }

  const remainder = current.trim();
  if (remainder && /[\u4e00-\u9fa5a-zA-Z0-9]/.test(remainder)) {
    sentences.push(remainder);
  }
  return sentences;
}

function buildSlidingContext(sentences, index, windowSize = 3) {
  const prevStart = Math.max(0, index - windowSize);
  const prev = sentences.slice(prevStart, index);
  const current = sentences[index] || "";
  const next = sentences.slice(index + 1, index + 1 + windowSize);

  return {
    index,
    prevSentences: prev,
    currentSentence: current,
    nextSentences: next,
    surroundingContext: [...prev, current, ...next].join(" ")
  };
}

// Sino-Vietnamese / Common translation anchor dictionary for robust paragraph alignment
const ALIGNMENT_ANCHORS = [
  [/\d+/g, (m) => m],
  [/【([^】]+)】/g, (m, g1) => g1],
  [/“([^”]+)”/g, (m, g1) => g1],
  [/陈易/g, "trần dịch"],
  [/银星/g, "ngân tinh"],
  [/白良/g, "bạch lương"],
  [/白虎/g, "bạch hổ"],
  [/尼采/g, "nitz"],
  [/小鱼人/g, "tiểu ngư nhân"],
  [/刺豚/g, "xích tù"],
  [/刺豚/g, "cá nóc"],
  [/四阶/g, "tứ giai"],
  [/三阶/g, "tam giai"],
  [/二阶/g, "nhị giai"],
  [/一阶/g, "nhất giai"],
  [/五阶/g, "ngũ giai"],
  [/海妖/g, "hải yêu"],
  [/基地/g, "căn cứ"],
  [/物品栏/g, "vật phẩm"],
  [/分解/g, "phân giải"],
  [/功绩/g, "công đức"],
  [/功绩/g, "công tích"],
  [/妖丹/g, "yêu đan"],
  [/符箓/g, "bùa"],
  [/符箓/g, "phù"],
  [/神庙/g, "đền thờ"],
  [/乌龟/g, "rùa"],
  [/法阵/g, "pháp trận"],
  [/剑光/g, "kiếm quang"],
  [/毒液/g, "dịch độc"],
  [/海水/g, "biển"],
  [/大声/g, "lớn tiếng"],
  [/大声/g, "quát"],
  [/呵斥/g, "hách xích"],
  [/呵斥/g, "quát"],
  [/巨灵/g, "cự linh"],
  [/微笑/g, "mỉm cười"],
  [/叹了口气/g, "thở dài"],
  [/叹气/g, "thở dài"],
  [/摇头/g, "lắc đầu"],
  [/点头/g, "gật đầu"],
  [/皱眉/g, "nhíu mày"],
  [/皱起眉头/g, "nhíu mày"],
  [/愣/g, "ngẩn"],
  [/傻眼/g, "ngơ ngác"],
  [/张散/g, "trương tán"],
  [/李四/g, "lý tứ"],
  [/肖婉茹/g, "tiêu uyển như"],
  [/王凌/g, "vương lăng"],
  [/怪物/g, "quái vật"],
  [/宝箱/g, "rương"],
  [/钓竿/g, "cần câu"],
  [/技能/g, "kỹ năng"],
  [/天赋/g, "thiên phú"],
  [/恶梦/g, "ác mộng"],
  [/世界/g, "thế giới"]
];

function scoreParagraphPair(srcText, drfText) {
  let score = 0;
  const s = String(srcText || "").trim();
  const d = String(drfText || "").toLowerCase();

  if (!s || !drfText.trim()) return -100;

  const lenRatio = drfText.length / Math.max(1, s.length);
  if (lenRatio >= 1.0 && lenRatio <= 4.0) {
    score += 5;
  } else if (lenRatio > 0.4 && lenRatio < 6.0) {
    score += 1;
  } else {
    score -= 10;
  }

  const sHasQuote = s.startsWith("“") || s.includes("“");
  const dHasQuote = d.startsWith('"') || d.includes('"') || d.startsWith("“") || d.includes("“");
  if (sHasQuote && dHasQuote) score += 10;
  if (!sHasQuote && !dHasQuote) score += 3;
  if (sHasQuote !== dHasQuote) score -= 4;

  const sHasBracket = s.includes("【");
  const dHasBracket = d.includes("【") || d.includes("[");
  if (sHasBracket && dHasBracket) score += 15;
  if (sHasBracket !== dHasBracket) score -= 8;

  const sHasEllipsis = s.includes("......") || s.includes("……");
  const dHasEllipsis = d.includes("......") || d.includes("……");
  if (sHasEllipsis && dHasEllipsis) score += 12;

  const sNumbers = s.match(/\d+/g) || [];
  const dNumbers = d.match(/\d+/g) || [];
  for (const num of sNumbers) {
    if (dNumbers.includes(num)) score += 15;
    else score -= 5;
  }

  for (const [regex, viTarget] of ALIGNMENT_ANCHORS) {
    if (typeof regex.test === "function" && regex.test(s)) {
      if (typeof viTarget === "string" && d.includes(viTarget)) {
        score += 12;
      }
    }
  }

  return score;
}

function alignParagraphsDP(sourceParas, draftParas) {
  const N = sourceParas.length;
  const M = draftParas.length;

  if (N === 0 || M === 0 || N === M) {
    return {
      alignedSource: sourceParas,
      alignedDraft: draftParas
    };
  }

  const dp = Array.from({ length: N + 1 }, () => new Float64Array(M + 1).fill(-Infinity));
  const parent = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(null));

  dp[0][0] = 0;

  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= M; j++) {
      if (dp[i][j] === -Infinity) continue;

      // Option 1: 1 source -> 1 draft
      if (i + 1 <= N && j + 1 <= M) {
        const cost = scoreParagraphPair(sourceParas[i], draftParas[j]);
        if (dp[i][j] + cost > dp[i + 1][j + 1]) {
          dp[i + 1][j + 1] = dp[i][j] + cost;
          parent[i + 1][j + 1] = { prevI: i, prevJ: j, sFrom: i, sTo: i + 1, dFrom: j, dTo: j + 1 };
        }
      }

      // Option 2: 1 source -> 2 draft (dialogue quote split onto own line)
      if (i + 1 <= N && j + 2 <= M) {
        const combinedDraft = draftParas[j] + "\n" + draftParas[j + 1];
        const cost = scoreParagraphPair(sourceParas[i], combinedDraft);
        if (dp[i][j] + cost > dp[i + 1][j + 2]) {
          dp[i + 1][j + 2] = dp[i][j] + cost;
          parent[i + 1][j + 2] = { prevI: i, prevJ: j, sFrom: i, sTo: i + 1, dFrom: j, dTo: j + 2 };
        }
      }

      // Option 3: 1 source -> 3 draft
      if (i + 1 <= N && j + 3 <= M) {
        const combinedDraft = draftParas[j] + "\n" + draftParas[j + 1] + "\n" + draftParas[j + 2];
        const cost = scoreParagraphPair(sourceParas[i], combinedDraft);
        if (dp[i][j] + cost > dp[i + 1][j + 3]) {
          dp[i + 1][j + 3] = dp[i][j] + cost;
          parent[i + 1][j + 3] = { prevI: i, prevJ: j, sFrom: i, sTo: i + 1, dFrom: j, dTo: j + 3 };
        }
      }

      // Option 4: 2 source -> 1 draft (collapsed short dialogue lines)
      if (i + 2 <= N && j + 1 <= M) {
        const combinedSource = sourceParas[i] + "\n" + sourceParas[i + 1];
        const cost = scoreParagraphPair(combinedSource, draftParas[j]);
        if (dp[i][j] + cost > dp[i + 2][j + 1]) {
          dp[i + 2][j + 1] = dp[i][j] + cost;
          parent[i + 2][j + 1] = { prevI: i, prevJ: j, sFrom: i, sTo: i + 2, dFrom: j, dTo: j + 1 };
        }
      }
    }
  }

  const alignedSource = [];
  const alignedDraft = [];
  let currI = N;
  let currJ = M;

  while (currI > 0 && currJ > 0) {
    const p = parent[currI][currJ];
    if (!p) break;
    const sMerged = sourceParas.slice(p.sFrom, p.sTo).join("\n");
    const dMerged = draftParas.slice(p.dFrom, p.dTo).join("\n");
    alignedSource.unshift(sMerged);
    alignedDraft.unshift(dMerged);
    currI = p.prevI;
    currJ = p.prevJ;
  }

  // If DP failed to reach (0, 0) completely, fall back safely
  if (currI > 0 || currJ > 0) {
    return {
      alignedSource: sourceParas,
      alignedDraft: draftParas
    };
  }

  return { alignedSource, alignedDraft };
}

function alignSourceAndDraftParagraphs(sourceContent, draftContent) {
  let sourceParagraphs = String(sourceContent || "").split(/\n+/).map((p) => p.trim()).filter(Boolean);
  let draftParagraphs = String(draftContent || "").split(/\n+/).map((p) => p.trim()).filter(Boolean);

  // Strip leading chapter title header from source if present
  if (sourceParagraphs.length > 0 && /^第?\s*\d+\s*章/i.test(sourceParagraphs[0])) {
    sourceParagraphs = sourceParagraphs.slice(1);
  }

  // Strip leading chapter title header from draft if present
  if (draftParagraphs.length > 0 && /^(?:#\s*)?(?:Chương|Tiết)\s*\d+/i.test(draftParagraphs[0])) {
    draftParagraphs = draftParagraphs.slice(1);
  }

  // Apply DP monotonic alignment when paragraph counts differ due to line splitting
  if (sourceParagraphs.length !== draftParagraphs.length) {
    const { alignedSource, alignedDraft } = alignParagraphsDP(sourceParagraphs, draftParagraphs);
    sourceParagraphs = alignedSource;
    draftParagraphs = alignedDraft;
  }

  const pairs = [];
  const maxLen = Math.max(sourceParagraphs.length, draftParagraphs.length);

  for (let i = 0; i < maxLen; i++) {
    pairs.push({
      index: i + 1,
      source: sourceParagraphs[i] || "",
      draft: draftParagraphs[i] || ""
    });
  }

  return {
    sourceParagraphs,
    draftParagraphs,
    pairs
  };
}

class EntityMemory {
  constructor(initialData = {}) {
    this.entities = new Map();
    if (initialData.entities) {
      for (const [key, val] of Object.entries(initialData.entities)) {
        this.entities.set(key, val);
      }
    }
  }

  setEntity(sourceName, details) {
    if (!sourceName) return;
    const existing = this.entities.get(sourceName) || {};
    this.entities.set(sourceName, {
      source: sourceName,
      target: details.target || details.translation || existing.target || sourceName,
      aliases: Array.from(new Set([...(existing.aliases || []), ...(details.aliases || [])])),
      gender: details.gender || existing.gender || "unspecified",
      role: details.role || existing.role || "",
      faction: details.faction || existing.faction || "",
      relationships: { ...(existing.relationships || {}), ...(details.relationships || {}) },
      notes: details.notes || existing.notes || "",
      firstSeenChapter: details.firstSeenChapter ?? existing.firstSeenChapter ?? 1,
      confidence: details.confidence ?? existing.confidence ?? 1.0
    });
  }

  getEntity(sourceName) {
    return this.entities.get(sourceName) || null;
  }

  findMatchingEntities(text) {
    if (!text) return [];
    const matches = [];
    for (const [sourceName, info] of this.entities.entries()) {
      if (text.includes(sourceName)) {
        matches.push(info);
        continue;
      }
      for (const alias of info.aliases || []) {
        if (text.includes(alias)) {
          matches.push(info);
          break;
        }
      }
    }
    return matches.sort((a, b) => b.source.length - a.source.length);
  }

  toJSON() {
    return {
      schema: 1,
      entities: Object.fromEntries(this.entities)
    };
  }
}

class TerminologyMemory {
  constructor(initialData = {}) {
    this.terms = new Map();
    if (initialData.terms) {
      for (const [key, val] of Object.entries(initialData.terms)) {
        this.terms.set(key, val);
      }
    }
  }

  setTerm(sourceTerm, config) {
    if (!sourceTerm) return;
    const existing = this.terms.get(sourceTerm) || {};
    
    // Support multi-sense architecture:
    let senses = config.senses || existing.senses || null;
    if (!senses) {
      senses = [
        {
          usage: config.category || existing.category || "general",
          preferred: config.preferred || config.target || existing.preferred || "",
          alternatives: Array.from(new Set([...(existing.alternatives || []), ...(config.alternatives || [])])),
          casing: config.casing || "as-is",
          triggerPattern: config.triggerPattern || null,
          contextCondition: config.contextCondition || existing.contextCondition || null
        }
      ];
    }

    this.terms.set(sourceTerm, {
      source: sourceTerm,
      preferred: config.preferred || config.target || existing.preferred || (senses[0]?.preferred || ""),
      senses,
      alternatives: Array.from(new Set([...(existing.alternatives || []), ...(config.alternatives || [])])),
      forbidden: Array.from(new Set([...(existing.forbidden || []), ...(config.forbidden || [])])),
      category: config.category || existing.category || "general", // realm, item, skill, concept, etc.
      notes: config.notes || existing.notes || "",
      confidence: config.confidence ?? existing.confidence ?? 1.0
    });
  }

  getTerm(sourceTerm) {
    return this.terms.get(sourceTerm) || null;
  }

  findMatchingTerms(text) {
    if (!text) return [];
    const matches = [];
    for (const [sourceTerm, info] of this.terms.entries()) {
      if (text.includes(sourceTerm)) {
        matches.push(info);
      }
    }
    return matches.sort((a, b) => b.source.length - a.source.length);
  }

  /**
   * Resolves translation sense prioritizing:
   * Contextual Sense Match > Context Condition Override > Document Context > Terminology Memory > Literal Dictionary
   */
  resolveSense(sourceTerm, sentenceContext = "", surroundingContext = "") {
    const entry = this.getTerm(sourceTerm);
    if (!entry) return null;

    // 1. If entry has multi-senses, evaluate context to select appropriate sense
    if (Array.isArray(entry.senses) && entry.senses.length > 0) {
      const fullContext = `${sentenceContext} ${surroundingContext}`;
      for (const sense of entry.senses) {
        if (sense.triggerPattern) {
          const isMatch = sense.triggerPattern instanceof RegExp
            ? sense.triggerPattern.test(fullContext)
            : fullContext.includes(sense.triggerPattern);
          if (isMatch) {
            return {
              preferred: Array.isArray(sense.preferred) ? sense.preferred[0] : sense.preferred,
              alternatives: sense.alternatives || (Array.isArray(sense.preferred) ? sense.preferred.slice(1) : []),
              usage: sense.usage,
              casing: sense.casing || "as-is"
            };
          }
        }
        if (typeof sense.contextCondition === "function") {
          const res = sense.contextCondition(sentenceContext, surroundingContext);
          if (res) {
            return {
              preferred: typeof res === "string" ? res : res.preferred,
              usage: sense.usage,
              casing: sense.casing || "as-is"
            };
          }
        }
      }

      // Default to primary sense
      const primary = entry.senses[0];
      return {
        preferred: Array.isArray(primary.preferred) ? primary.preferred[0] : primary.preferred,
        alternatives: primary.alternatives || (Array.isArray(primary.preferred) ? primary.preferred.slice(1) : []),
        usage: primary.usage,
        casing: primary.casing || "as-is"
      };
    }

    return {
      preferred: entry.preferred,
      alternatives: entry.alternatives || [],
      usage: entry.category,
      casing: "as-is"
    };
  }

  /**
   * Resolves term string for backward compatibility.
   */
  resolveTerm(sourceTerm, sentenceContext = "", surroundingContext = "") {
    const sense = this.resolveSense(sourceTerm, sentenceContext, surroundingContext);
    return sense ? sense.preferred : null;
  }

  toJSON() {
    return {
      schema: 2,
      terms: Object.fromEntries(this.terms)
    };
  }
}

/**
 * Detects Entity-Type Misclassifications (e.g. common Chinese phrase/verb hallucinated
 * into a capitalized proper noun or character name in Vietnamese).
 */
const COMMON_PHRASE_ENTITY_MAP = [
  { zh: "宁死", viCanonical: "thà chết", falseEntities: ["Ninh Tử"], type: "common_phrase -> proper_name" },
  { zh: "当真", viCanonical: "thực sự", falseEntities: ["Đương Chân"], type: "common_phrase -> proper_name" },
  { zh: "好生", viCanonical: "chu đáo", falseEntities: ["Hảo Sinh"], type: "common_phrase -> proper_name" },
  { zh: "白白", viCanonical: "uổng công", falseEntities: ["Bạch Bạch"], type: "common_phrase -> character_name" },
  { zh: "小心", viCanonical: "cẩn thận", falseEntities: ["Tiểu Tâm"], type: "common_phrase -> character_name" },
  { zh: "何必", viCanonical: "hà tất", falseEntities: ["Hà Tất"], type: "common_phrase -> proper_name" },
  { zh: "岂敢", viCanonical: "sao dám", falseEntities: ["Khởi Cảm"], type: "common_phrase -> proper_name" }
];

function detectEntityTypeMisclassification(sourceSentence, draftSentence) {
  if (!sourceSentence || !draftSentence) return null;

  for (const item of COMMON_PHRASE_ENTITY_MAP) {
    if (sourceSentence.includes(item.zh)) {
      for (const fe of item.falseEntities) {
        if (draftSentence.includes(fe)) {
          return {
            hasMismatch: true,
            sourcePhrase: item.zh,
            targetProperNoun: fe,
            expectedMeaning: item.viCanonical,
            mismatchType: item.type,
            reason: `Cụm từ thông thường '${item.zh}' bị dịch viết hoa nhầm thành danh từ riêng / tên nhân vật '${fe}'.`
          };
        }
      }
    }
  }

  // Generalized structural heuristic: Vietnamese capitalized pair without proper noun in source
  const capitalMatches = draftSentence.match(/\b([A-ZÀ-Ỹ][a-zà-ỹ]+ [A-ZÀ-Ỹ][a-zà-ỹ]+)\b/g) || [];
  for (const cap of capitalMatches) {
    if (/^(Không Thể|Cực Kỳ|Đột Nhiên|Nhanh Chóng|Hoàn Toàn|Cùng Lúc|Lúc Này|Trước Mắt|Một Trận|Một Đạo|Mấy Con|Hai Con|Năm Con)$/.test(cap)) {
      return {
        hasMismatch: true,
        sourcePhrase: cap,
        targetProperNoun: cap,
        expectedMeaning: cap.toLowerCase(),
        mismatchType: "grammatical_phrase -> proper_name",
        reason: `Cụm từ ngữ pháp '${cap}' bị viết hoa bất thường như danh từ riêng.`
      };
    }
  }

  return null;
}

module.exports = {
  splitSentences,
  buildSlidingContext,
  alignSourceAndDraftParagraphs,
  alignParagraphsDP,
  EntityMemory,
  TerminologyMemory,
  detectEntityTypeMisclassification
};

