"use strict";

/**
 * Dual-Pass Agentic Reflection & Self-Critique Engine.
 * Analyzes candidate translations, calculates literary quality & fluency scores,
 * audits glossary adherence, and applies targeted refinement patches to guarantee
 * publication-grade prose.
 */

// Stiff Sino-Vietnamese grammar patterns requiring reflection polishing
const STIFF_REFLECTION_RULES = [
  // Word order & preposition artifacts
  { pattern: /đối với\s+([^,.;!?]+?)\s+tới nói/gi, replacement: "đối với $1 mà nói" },
  { pattern: /trong lòng không khỏi có chút/gi, replacement: "trong lòng không khỏi" },
  { pattern: /trong lòng không khỏi có phần/gi, replacement: "trong lòng thoáng" },
  { pattern: /tại\s+trước\s+mắt/gi, replacement: "trước mắt" },
  { pattern: /tại\s+trong\s+mắt/gi, replacement: "trong mắt" },
  { pattern: /tại\s+nơi\s+này/gi, replacement: "ở nơi này" },
  { pattern: /có chút ít/gi, replacement: "có chút" },
  { pattern: /bị\s+([^,.;!?]+?)\s+cấp\s+([^,.;!?]+)/gi, replacement: "bị $1 $2" },
  { pattern: /hướng về phía\s+([^,.;!?]+)/gi, replacement: "hướng về $1" },
  { pattern: /không ngừng mà\s+/gi, replacement: "không ngừng " },
  { pattern: /liên tục mà\s+/gi, replacement: "liên tục " },
  { pattern: /tùy ý mà\s+/gi, replacement: "tùy ý " },
  { pattern: /nhẹ nhàng mà\s+/gi, replacement: "nhẹ nhàng " },
  { pattern: /chậm rãi mà\s+/gi, replacement: "chậm rãi " },
  { pattern: /trong lúc nhất thời/gi, replacement: "trong thoáng chốc" },
  { pattern: /nói không ra lời/gi, replacement: "nghẹn lời" },
  { pattern: /nghĩ không ra/gi, replacement: "không hiểu nổi" },
  { pattern: /nhìn không thấu/gi, replacement: "nhìn không thấu" },
  { pattern: /bị sợ nhảy dựng/gi, replacement: "giật nảy mình" },
  { pattern: /canh của (?:ta|tôi) (?:đã )?(?:bị )?sợ (?:mất|hết)(?: rồi)?/gi, replacement: "lá gan của tôi đã bị dọa cho bay sạch rồi" },
  { pattern: /canh của (?:ta|tôi)/gi, replacement: "lá gan của tôi" },
  { pattern: /bị sợ chết(?:\s+không được)?/gi, replacement: "sợ chết khiếp" },
  { pattern: /bị sợ mất/gi, replacement: "bị dọa cho bay mất" },
  { pattern: /bị sợ hết hồn/gi, replacement: "hồn vía lên mây" },
  { pattern: /hách phá đảm/gi, replacement: "sợ vỡ mật" },
  { pattern: /tát thối tựu bào/gi, replacement: "co giò bỏ chạy" },
  { pattern: /thử thử thân thủ/gi, replacement: "thử trổ tài" },
  { pattern: /(^|[^\p{L}])gia gia(?=$|[^\p{L}])/giu, replacement: "$1ông nội" },
  { pattern: /(^|[^\p{L}])nãi nãi(?=$|[^\p{L}])/giu, replacement: "$1bà nội" },
  { pattern: /(^|[^\p{L}])ba ba(?=$|[^\p{L}])/giu, replacement: "$1bố" },
  { pattern: /(^|[^\p{L}])mụ mụ(?=$|[^\p{L}])/giu, replacement: "$1mẹ" },
  { pattern: /(^|[^\p{L}])ca ca(?=$|[^\p{L}])/giu, replacement: "$1anh trai" },
  { pattern: /(^|[^\p{L}])tỷ tỷ(?=$|[^\p{L}])/giu, replacement: "$1chị gái" },
  { pattern: /(^|[^\p{L}])đệ đệ(?=$|[^\p{L}])/giu, replacement: "$1em trai" },
  { pattern: /(^|[^\p{L}])muội muội(?=$|[^\p{L}])/giu, replacement: "$1em gái" },
  { pattern: /(^|[^\p{L}])thúc thúc(?=$|[^\p{L}])/giu, replacement: "$1chú" },
  { pattern: /(^|[^\p{L}])a di(?=$|[^\p{L}])/giu, replacement: "$1dì" },
  { pattern: /(^|[^\p{L}])ngã(?=$|[^\p{L}])/giu, replacement: "$1tôi" },
  { pattern: /(^|[^\p{L}])nhĩ(?=$|[^\p{L}])/giu, replacement: "$1ngươi" },
  { pattern: /(^|[^\p{L}])khước(?=$|[^\p{L}])/giu, replacement: "$1lại" },
  { pattern: /(^|[^\p{L}])bang(?=\s+(?:tôi|ta|ngươi|hắn|nàng|nó|chúng|em|anh)(?:$|[^\p{L}]))/giu, replacement: "$1giúp" },
  { pattern: /(^|[^\p{L}])giáo(?=\s+(?:tôi|ta|ngươi|hắn|nàng|nó|chúng|em|anh)(?:$|[^\p{L}]))/giu, replacement: "$1dạy" }
];

/**
 * Calculates a fluency & prose quality score (0.0 to 10.0).
 * @param {string} text
 * @returns {{ score: number, issues: string[] }}
 */
function calculateFluencyScore(text) {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return { score: 0, issues: ["Văn bản rỗng"] };
  }

  let penalty = 0;
  const issues = [];

  // Check for stiff grammar patterns
  let stiffCount = 0;
  for (const rule of STIFF_REFLECTION_RULES) {
    const matches = text.match(rule.pattern);
    if (matches) {
      stiffCount += matches.length;
    }
  }
  if (stiffCount > 0) {
    penalty += Math.min(2.5, stiffCount * 0.5);
    issues.push(`Phát hiện ${stiffCount} điểm cấu trúc Hán sượng.`);
  }

  // Check for excessive repetitive 3-word pronouns in close proximity
  const words = text.toLowerCase().split(/\s+/);
  let pronounEcho = 0;
  for (let i = 0; i < words.length - 2; i++) {
    if ((words[i] === "hắn" || words[i] === "y" || words[i] === "nàng") &&
        (words[i + 1] === "hắn" || words[i + 2] === "hắn" || words[i + 1] === "nàng" || words[i + 2] === "nàng")) {
      pronounEcho++;
    }
  }
  if (pronounEcho > 2) {
    penalty += Math.min(1.5, pronounEcho * 0.3);
    issues.push(`Phát hiện ${pronounEcho} vị trí lặp đại từ quá sát nhau.`);
  }

  // Check for raw untranslated Han glyphs
  const hanMatches = text.match(/[\u4e00-\u9fa5]/g);
  if (hanMatches && hanMatches.length > 0) {
    penalty += Math.min(3.0, hanMatches.length * 1.0);
    issues.push(`Sót ${hanMatches.length} chữ Hán chưa dịch.`);
  }

  // Check for punctuation health
  if (!/[.!?…”’"]$/.test(text.trim())) {
    penalty += 0.5;
    issues.push("Đoạn văn kết thúc thiếu dấu câu chuẩn.");
  }

  const score = Math.max(0, Number((10 - penalty).toFixed(2)));
  return { score, issues };
}

/**
 * Audits whether all required glossary entities appear in the translated text.
 * @param {string} text
 * @param {Object} glossary
 * @returns {{ compliant: boolean, missingTerms: string[] }}
 */
function auditGlossaryCompliance(text, glossary = {}) {
  if (!text || !glossary || Object.keys(glossary).length === 0) {
    return { compliant: true, missingTerms: [] };
  }

  const missingTerms = [];
  for (const [zh, vi] of Object.entries(glossary)) {
    if (vi && !text.includes(vi)) {
      missingTerms.push(vi);
    }
  }

  return {
    compliant: missingTerms.length === 0,
    missingTerms
  };
}

function isLikelyDialogue(p, prevP, nextP) {
  if (!p || p.startsWith('"') || p.startsWith('–') || p.startsWith('-')) return false;

  const hasDialogueEnd = /[!?…]$/.test(p);
  const speechParticles = /\b(?:mày|tao|ngươi|ta|tôi|ông|bà|anh|chị|em|sư phụ|sư thúc|chứ|nhé|nhỉ|à|hả|sao|đấy|hử|cơ à|lắm|thế|chăng|đâu|đi|nào|thôi|mau|rồi)\b/i;
  const speechExclamations = /^(?:Á|A|A ha|Ha ha|Hừ|Hắc hắc|Úi|Ôi|Ối|Này|Nè|Nào|Được rồi|Khốn kiếp|Mẹ kiếp|Đúng thế|Không thể nào|Có gì mà|Hóa ra|Thì ra|Thế thì)\b/i;

  if (speechExclamations.test(p)) return true;
  if (hasDialogueEnd && speechParticles.test(p)) return true;

  if (prevP?.startsWith('"') && nextP?.startsWith('"') && p.length < 140 && speechParticles.test(p)) {
    return true;
  }

  return false;
}

const NARRATION_STARTERS = /^(?:Lão\s+(?:đạo|nhân|hòa\s+thượng|thực|bản|bá|đồ\s+tể|tử|gia|thầy|đầu|hán)|Hướng\s+(?:Khuyết|Dịch|Lão\s+Thực|Gia|tiên\s+sinh)|Trần\s+(?:Tam\s+Kim|Sâm\s+Kim|gia|tiên\s+sinh)|Vương\s+(?:Côn\s+Luân|Đại\s+Quân|Lâm\s+Châu|tiên\s+sinh|Huyền\s+Chân)|Lý\s+(?:Thuận|Gia|tiên\s+sinh|Đức\s+Thành)|Đỗ\s+Kim\s+Thập|Tào\s+Thanh|Tiểu\s+(?:Lượng|tam|tứ|ngũ|cửu)|Hai\s+(?:người|bên|tay|mắt|chân)|Đám\s+người|Dân\s+làng|Mọi\s+người|Người\s+(?:đàn\s+ông|phụ\s+nữ|trung\s+niên|họ|trong|nhà|khác|xung\s+quanh)|Nam\s+thanh\s+niên|Nữ\s+thanh\s+niên|Cô\s+gái|Gã\s+đàn\s+ông|Hắn|Nó|Y|Ả|Yêu\s+ma|Con\s+(?:cương\s+thi|quỷ|chó|ngựa)|Cả\s+(?:hai|nhà|thôn|đám|người)|Sau\s+(?:đó|khi|bữa|đây)|Trước\s+(?:đó|khi|mắt)|Trong\s+(?:lúc|khi|phòng|nhà|sân|viện|núi|rừng)|Vừa\s+(?:bước|dứt|nói|thấy|nghe|lúc|mới)|Khi\s+(?:đó|hắn|người|nhìn|bước)|Lúc\s+(?:này|đó|hắn|người)|Từ\s+(?:đó|sau|nhỏ|ngày|gian)|Năm\s+(?:sau|đó|thứ)|Thấy\s+(?:thế|vậy|đối\s+phương|hắn)|Nghe\s+(?:vậy|thấy|tiếng|được)|Nhìn\s+(?:thấy|sang|vào|lên|xuống)|Dứt\s+lời|Nói\s+xong|Bỗng\s+(?:nhiên|chốc)|Đột\s+nhiên|Không\s+(?:lâu|gian|khí)|Mười\s+năm|Quanh\s+đó|Phía\s+(?:trước|sau|trên|dưới)|Ánh\s+mắt|Khuôn\s+mặt|Bàn\s+tay|Cánh\s+tay|Đôi\s+mắt|Chiếc|Căn|Cửa|Toàn\s+bộ|Luồng\s+khí|Hồn\s+phách|Ngọn\s+lửa|Tiếng|Vào\s+lúc|Mãi\s+đến|Tuy\s+nhiên|Thế\s+nhưng|Nếu\s+không|Chẳng\s+mấy\s+chốc|Tại\s+một)\b/u;

function isPureNarration(text) {
  if (!text) return false;
  const clean = text.replace(/^"+|"+$/g, "").trim();
  if (/[:：]$/.test(clean)) return true;
  if (NARRATION_STARTERS.test(clean)) {
    if (/[.:：]$/.test(clean) && !/[!?]$/.test(clean)) return true;
  }
  return false;
}

function formatNovelDialogueAndQuotes(rawContent) {
  if (!rawContent) return "";
  let text = String(rawContent).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  // 1. Normalize quote symbols
  text = text.replace(/[“”„]/g, '"');
  text = text.replace(/[’‘]/g, "'");

  // 2. Remove AI prefixes / codeblocks
  text = text.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "");
  text = text.replace(/^(?:Here is the translation|Dưới đây là bản dịch|Bản dịch tiếng Việt|Gemini said|Show code|Copy code)[:\s]*/i, "");
  text = text.replace(/^\s*(?:python|py|javascript|typescript|json|markdown|text)\s*=?\s*(?=["'“]|Chương\s+\d+)/iu, "");

  // 3. Fix glued dialogue after speech intro comma/colon:
  text = text.replace(/([a-zà-ỹ0-9]),\s*"/gu, '$1:\n\n"');
  text = text.replace(/([a-zà-ỹ0-9]):\s*"/gu, '$1:\n\n"');

  // 4. Split multiple consecutive quotes: `"""` or `""`
  text = text.replace(/([.!?…])"+(?:\s*"+)*\s*([A-ZÀ-ỸÁÀẢÃẠÂẤẦẨẪẬĂẮẰẲẴẶÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ])/gu, '$1"\n\n"$2');
  text = text.replace(/"{2,}/g, '"');

  // 5. Split dialogue turns:
  text = text.replace(/([.!?…])"\s*"/g, '$1"\n\n"');

  // 6. Split closing quote followed by speech or narration:
  text = text.replace(/([.!?…])"\s*([A-ZÀ-ỸÁÀẢÃẠÂẤẦẨẪẬĂẮẰẲẴẶÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ][a-zà-ỹ0-9]+.*)/gu, (match, punc, rest) => {
    rest = rest.trim();
    if (isPureNarration(rest)) {
      return `${punc}"\n\n${rest}`;
    } else {
      return `${punc}"\n\n"${rest}`;
    }
  });

  // 7. Process paragraphs
  const rawParas = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
  const formattedParas = [];

  for (let i = 0; i < rawParas.length; i++) {
    let p = rawParas[i].trim();
    if (!p) continue;

    // Clean stray quotes at start of paragraph
    p = p.replace(/^"\s+/, "").replace(/"{2,}/g, '"');

    // Case 1: Speech intro line ending with colon `:` -> ALWAYS PURE NARRATION, NO QUOTES
    if (/[:：]$/.test(p)) {
      p = p.replace(/^"+|"+$/g, "").trim();
      formattedParas.push(p);
      continue;
    }

    // Case 2: Pure narration paragraph -> NO OUTER QUOTES
    if (isPureNarration(p)) {
      p = p.replace(/^"+|"+$/g, "").trim();
      const soundMatch = p.match(/^([A-ZÀ-Ỹ][a-zà-ỹ0-9\s,]+)"\s*(một tiếng|Một|lập tức|bỗng nhiên|ngọn lửa)/iu);
      if (soundMatch && !p.startsWith('"')) {
        p = `"${soundMatch[1]}" ` + p.slice(soundMatch[0].length - soundMatch[2].length);
      }
      formattedParas.push(p);
      continue;
    }

    // Case 3: Dialogue dash line
    if (/^"?[–—-]\s*/.test(p)) {
      p = p.replace(/^"?[–—-]\s*/, "– ").replace(/"$/, "");
      formattedParas.push(p);
      continue;
    }

    // Case 4: Dialogue paragraph
    const prevP = formattedParas[formattedParas.length - 1] || "";
    const isDirectlyAfterColon = /[:：]$/.test(prevP);

    if (isDirectlyAfterColon || p.startsWith('"') || p.endsWith('"') || /[!?]$/.test(p)) {
      const cleanContent = p.replace(/^"+|"+$/g, "").trim();
      p = `"${cleanContent}"`;
    }

    if (p === '"' || p === '""') continue;
    formattedParas.push(p);
  }

  return formattedParas.join("\n\n");
}

function normalizeDoubleQuoteSpacing(text) {
  let output = "";
  let opening = true;
  const isWord = (ch) => Boolean(ch && /[\p{L}\p{N}]/u.test(ch));

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== '"') {
      output += ch;
      continue;
    }

    while (output.endsWith(" ")) output = output.slice(0, -1);
    const prev = output[output.length - 1] || "";
    if (opening && (isWord(prev) || prev === ":")) output += " ";
    output += '"';

    let nextIndex = i + 1;
    while (text[nextIndex] === " ") nextIndex += 1;
    if (opening) {
      i = nextIndex - 1;
    } else if (isWord(text[nextIndex])) {
      output += " ";
      i = nextIndex - 1;
    }
    opening = !opening;
  }

  return output.replace(/[^\S\r\n]+/g, " ").trim();
}

function polishLiteraryProse(text) {
  if (!text || typeof text !== "string") return "";
  const clean = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/([\[])\s+/g, "$1")
    .replace(/\s+([\]])/g, "$1")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
  return normalizeDoubleQuoteSpacing(clean);
}

function titleCaseHanViet(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function convertResidualHanToHanViet(text, { maxHan = Number(process.env.RESIDUAL_HAN_LOCAL_FIX_LIMIT || 1000) } = {}) {
  if (!text || typeof text !== "string" || !/\p{Script=Han}/u.test(text)) return text || "";

  const hanMatches = text.match(/\p{Script=Han}/gu) || [];
  if (hanMatches.length === 0 || hanMatches.length > maxHan) return text;
  if (hanMatches.length / Math.max(1, text.length) >= 0.12) return text;

  try {
    const { loadBase } = require("./convert/index");
    const { hanvietChars } = loadBase();
    let converted = text.replace(/\p{Script=Han}+/gu, (match, offset, fullText) => {
      const hv = [...match]
        .map((ch) => hanvietChars[ch]?.hv || "")
        .filter(Boolean)
        .join(" ");
      if (!hv) return "";

      const prev = fullText.slice(Math.max(0, offset - 24), offset);
      const next = fullText.slice(offset + match.length, offset + match.length + 24);
      const touchesVietnameseName =
        /(?:^|[\s"'])\p{Lu}[\p{L}]*(?:\s+\p{Lu}[\p{L}]*){0,3}\s*$/u.test(prev) ||
        /^\s*(?:\p{Lu}[\p{L}]*(?:\s+\p{Lu}[\p{L}]*){0,3})/u.test(next);

      const value = touchesVietnameseName || match.length <= 3 ? titleCaseHanViet(hv) : hv.toLowerCase();
      return ` ${value} `;
    });

    converted = converted
      .replace(/\s+([,.!?;:])/g, "$1")
      .replace(/([\[(])\s+/g, "$1")
      .replace(/\s+([\])])/g, "$1")
      .replace(/[^\S\r\n]+/g, " ")
      .trim();
    return polishLiteraryProse(converted);
  } catch {
    return text;
  }
}

function adaptLiteraryIdioms(text) {
  return text || "";
}

/**
 * Dual-Pass Reflection: Evaluates candidate translation, applies targeted polishing
 * and returns enhanced literary-grade text.
 * @param {string} translation
 * @param {Object} options
 * @returns {{ text: string, initialScore: number, finalScore: number, improved: boolean }}
 */
function reflectAndPolish(translation, { sourceText = "", glossary = {}, scene = "neutral" } = {}) {
  if (!translation || typeof translation !== "string") {
    return { text: "", initialScore: 0, finalScore: 0, improved: false };
  }

  const initial = calculateFluencyScore(translation);
  let polished = translation;

  // Apply stiff grammar reflection rules
  for (const rule of STIFF_REFLECTION_RULES) {
    if (rule.pattern.test(polished)) {
      polished = polished.replace(rule.pattern, rule.replacement);
    }
  }

  // Apply prose stylistics & spacing normalization
  polished = polishLiteraryProse(polished);

  // Clear residual Han glyphs in otherwise Vietnamese output. Gemini Web often
  // leaves mixed names such as "Hải Nhược颖"; converting these locally avoids a
  // full chapter retry for a tiny deterministic cleanup.
  polished = convertResidualHanToHanViet(polished);

  const finalScore = calculateFluencyScore(polished).score;

  return {
    text: polished,
    initialScore: initial.score,
    finalScore,
    improved: polished !== translation
  };
}

module.exports = {
  calculateFluencyScore,
  auditGlossaryCompliance,
  reflectAndPolish,
  convertResidualHanToHanViet,
  formatNovelDialogueAndQuotes,
  normalizeDoubleQuoteSpacing,
  STIFF_REFLECTION_RULES
};
