"use strict";

const TEXT_REPLACEMENTS = [
  { pattern: /\bthểসার\s*\(thân thể\)/giu, replacement: "nhục thân", reason: "ký tự Bengali lẫn vào cụm nhục thân" },
  { pattern: /\bBiện Sự\s*\(làm việc\)/gu, replacement: "làm việc", reason: "gloss thô Hán-Việt" },
  { pattern: /\bmảy hem\b/giu, replacement: "mảy may", reason: "lỗi chính tả mảy may" },
  { pattern: /\bkhông mớ hồi báo\b/giu, replacement: "không mong hồi báo", reason: "lỗi cụm không mong hồi báo" },
  { pattern: /\bNgồiệ sập\b/gu, replacement: "Ngồi phịch", reason: "ký tự lỗi trong cụm ngồi phịch" },
  { pattern: /\bngồiệ sập\b/gu, replacement: "ngồi phịch", reason: "ký tự lỗi trong cụm ngồi phịch" },
  {
    pattern: /(^|[^\p{L}])(?:tôi|ta)\s+(?:ngựa|mã)(?=\s*(?:[,.!?;:]|thì|rồi|đâu|mất|chết|khỏi|xuống|một|nặng|theo|là))/giu,
    replacement: "$1ngã ngựa",
    reason: "lỗi ngã ngựa bị dịch lệch thành tôi/ta ngựa/mã"
  },
  { pattern: /\btôi một vố\b/giu, replacement: "ngã một vố", reason: "vá residue từ lỗi tôi ngựa" },
  { pattern: /\bbọn họ mà tôi thì\b/giu, replacement: "bọn họ mà ngã ngựa thì", reason: "vá residue từ lỗi tôi mã" },
  { pattern: /\btôi nặng nề xuống\b/giu, replacement: "ngã nặng nề xuống", reason: "vá residue từ lỗi tôi ngựa" }
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withoutChapterPrefix(title) {
  return String(title || "").replace(/^Chương\s*\d+\s*[:：.\-]?\s*/iu, "").trim();
}

function normalizeSpaces(value) {
  return String(value || "").replace(/[ \t]+/g, " ").trim();
}

function stripLeadingTitleArtifact(content, title) {
  const original = String(content || "");
  const titleVariants = [
    String(title || "").trim(),
    withoutChapterPrefix(title)
  ].map(normalizeSpaces).filter(Boolean);

  let next = original.trimStart();
  const before = next;

  next = next.replace(/^(?:#+\s*)?Tiêu\s*đề\s*(?:bản\s*dịch|tiếng\s*Việt)?\s*[:：]\s*[^\n]{1,160}\n+\s*(?:Nội\s*dung\s*[:：]\s*)?/iu, "");
  next = next.replace(/^(?:#+\s*)?Nội\s*dung\s*[:：]\s*/iu, "");

  for (const candidate of titleVariants) {
    const pattern = new RegExp(`^(?:"|“|”|'|‘|’)?\\s*${escapeRegex(candidate)}\\s*(?:"|“|”|'|‘|’)?(?=\\s|[A-ZÀ-Ỹa-zà-ỹ"“‘])`, "iu");
    const match = next.match(pattern);
    if (!match) continue;

    const remainder = next.slice(match[0].length).trimStart();
    if (remainder.length < 80) continue;
    next = remainder;
    break;
  }

  return { text: next, changed: next !== before };
}

function repairTranslationTextArtifacts(content, { title = "" } = {}) {
  const reasons = [];
  let text = String(content || "");

  const stripped = stripLeadingTitleArtifact(text, title);
  if (stripped.changed) {
    text = stripped.text;
    reasons.push("gỡ tiêu đề bị dính ở đầu nội dung");
  }

  for (const { pattern, replacement, reason } of TEXT_REPLACEMENTS) {
    pattern.lastIndex = 0;
    if (!pattern.test(text)) continue;
    pattern.lastIndex = 0;
    text = text.replace(pattern, replacement);
    reasons.push(reason);
  }

  const normalized = text.replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (normalized !== text) {
    text = normalized;
    reasons.push("chuẩn hóa khoảng trắng");
  }

  return { text, reasons: [...new Set(reasons)] };
}

module.exports = {
  repairTranslationTextArtifacts,
  stripLeadingTitleArtifact
};
