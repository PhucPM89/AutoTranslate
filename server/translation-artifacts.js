"use strict";

const TEXT_REPLACEMENTS = [
  { pattern: /sخان\s*\(kang\)/giu, replacement: "sạp", reason: "ký tự Arabic lẫn vào từ sạp" },
  { pattern: /đíو/giu, replacement: "dí", reason: "ký tự Arabic lẫn vào từ dí" },
  { pattern: /Côn Lُن/giu, replacement: "Côn Luân", reason: "ký tự Arabic lẫn vào địa danh Côn Luân" },
  { pattern: /hoàn전히/giu, replacement: "hoàn toàn", reason: "ký tự Hangul lẫn vào cụm hoàn toàn" },
  { pattern: /Tinh V역/giu, replacement: "Tinh Vực", reason: "ký tự Hangul lẫn vào cụm Tinh Vực" },
  { pattern: /con طريق/giu, replacement: "con đường", reason: "ký tự Arabic lẫn vào cụm con đường" },
  { pattern: /bọnْ họ/giu, replacement: "bọn họ", reason: "ký tự Arabic lẫn vào cụm bọn họ" },
  { pattern: /yêu đان/giu, replacement: "yêu đan", reason: "ký tự Arabic lẫn vào cụm yêu đan" },
  { pattern: /hậu tìиh/giu, replacement: "hậu thuẫn", reason: "ký tự Cyrillic lẫn vào cụm hậu thuẫn" },
  { pattern: /nuốt ngј trọn lòng/giu, replacement: "yên tâm", reason: "ký tự Cyrillic lẫn vào cụm yên tâm" },
  { pattern: /\bba ba năm năm có những âm binh\b/giu, replacement: "từng nhóm ba người năm người có những âm binh", reason: "dịch nghĩa cụm ba năm thành từng nhóm" },
  { pattern: /\bba ba ghép lại\b/giu, replacement: "hai số ba ghép lại", reason: "dịch rõ cụm số ba ba" },
  { pattern: /\bCon bé ngoan,\s*ba ba\b/gu, replacement: "Con ngoan, ba", reason: "dịch xưng hô ba ba thành ba" },
  { pattern: /\bNãi nãi ương nguyệt là bà nội tôi\b/gu, replacement: "Ương Nguyệt là bà nội tôi", reason: "dịch xưng hô nãi nãi thành bà nội theo ngữ cảnh" },
  { pattern: /\bnguyệt nãi nãi\b/giu, replacement: "bà nội Nguyệt", reason: "dịch xưng hô nãi nãi thành bà nội theo ngữ cảnh" },
  { pattern: /\bcác ngươi Tiêu gia gia nghiệp lớn lao\b/giu, replacement: "nhà họ Tiêu các ngươi gia đại nghiệp lớn", reason: "dịch nghĩa cụm gia đại nghiệp đại" },
  { pattern: /\bcô chú nhất trịch\s*\(cùng đường liều mạng\)/giu, replacement: "liều mạng một phen", reason: "gỡ gloss giải nghĩa thô trong ngoặc" },
  { pattern: /\bkhó triền\s*\(khó đối phó\)/giu, replacement: "khó đối phó", reason: "gỡ gloss giải nghĩa thô trong ngoặc" },
  { pattern: /\bchuỗi niệm châu\s*\(niệm châu\)/giu, replacement: "chuỗi niệm châu", reason: "gỡ gloss lặp trong ngoặc" },
  {
    pattern: /được bốn\s+sáu\s+phân\s*\(tức là ngang ngửa,\s*nhưng vẫn thua\)/giu,
    replacement: "ở thế bốn-sáu, tuy hơi lép vế",
    reason: "gỡ gloss giải nghĩa thô trong ngoặc"
  },
  {
    pattern: /đấu với Tố Viêm được bốn sáu phân\s*\(tức là ngang ngửa,\s*nhưng vẫn thua\)/giu,
    replacement: "đấu với Tố Viêm ở thế bốn-sáu, tuy hơi lép vế",
    reason: "gỡ gloss giải nghĩa thô trong ngoặc"
  },
  { pattern: /\bai dám xưng là ca ca\b/giu, replacement: "ai dám xưng anh", reason: "dịch xưng hô ca ca thành anh" },
  { pattern: /\bca ca chịu\b/giu, replacement: "anh chịu", reason: "dịch xưng hô ca ca thành anh" },
  { pattern: /\btheo ca ca\b/giu, replacement: "theo anh", reason: "dịch xưng hô ca ca thành anh" },
  { pattern: /\bca ca ta\b/giu, replacement: "anh trai ta", reason: "dịch xưng hô ca ca thành anh trai" },
  { pattern: /\bthái tử ca ca\b/giu, replacement: "hoàng huynh thái tử", reason: "dịch xưng hô ca ca trong cung đình" },
  { pattern: /\bcho ca ca\b/giu, replacement: "cho anh", reason: "dịch xưng hô ca ca thành anh" },
  { pattern: /\bmuội muội\b/giu, replacement: "em gái", reason: "dịch xưng hô muội muội thành em gái" },
  {
    pattern: /\b([A-ZÀ-Ỹ][\p{L}\d]*(?:\s+[A-ZÀ-Ỹ][\p{L}\d]*){0,2})\s+ca ca\b/gu,
    replacement: "anh $1",
    reason: "dịch xưng hô tên + ca ca thành anh + tên"
  },
  {
    pattern: /\bca ca\s+([A-ZÀ-Ỹ][\p{L}\d]*(?:\s+[A-ZÀ-Ỹ][\p{L}\d]*){0,2})\b/giu,
    replacement: "anh $1",
    reason: "dịch xưng hô ca ca + tên thành anh + tên"
  },
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

const RAW_HANVIET_TRANSCRIPTION_MARKERS = [
  /\bđích\b/giu,
  /\bliễu\b/giu,
  /\bngã\s+môn\b/giu,
  /\bnhĩ\s+môn\b/giu,
  /\btựu\b/giu,
  /\btòng\b/giu,
  /\bgiá\s+(?:nhất|ma|thứ)\b/giu,
  /\bna\s+(?:thiên|cái|thứ)\b/giu,
  /\btha\b/giu,
  /\bđô\b/giu,
  /\bbất\s+(?:yếu|tri|điệu|khả)\b/giu,
  /\bdĩ\s+kinh\b/giu,
  /\bkhẩn\s+tùy\b/giu,
  /\bcấp\s+đả\b/giu,
  /\bkim\s+bôi\s+xa\b/giu,
  /\bcảnh\s+xa\b/giu,
  /\bphương\s+hướng\s+bàn\b/giu,
  /\btát\s+thối\s+tựu\s+bào\b/giu
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

function detectRawHanVietTranscription(value) {
  const text = String(value || "");
  let score = 0;
  for (const marker of RAW_HANVIET_TRANSCRIPTION_MARKERS) {
    marker.lastIndex = 0;
    const matches = text.match(marker);
    if (matches) score += Math.min(matches.length, 5);
  }
  return score >= 12;
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
  detectRawHanVietTranscription,
  repairTranslationTextArtifacts,
  stripLeadingTitleArtifact
};
