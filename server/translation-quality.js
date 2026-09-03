"use strict";

const { detectRawHanVietTranscription } = require("./translation-artifacts");

function evaluateTranslationQuality(source, translation) {
  const original = String(source || "").trim();
  const output = String(translation || "").trim();
  const issues = [];

  if (!output) {
    return { qaRequired: true, qaIssues: ["Nội dung rỗng"], qualityScore: 0 };
  }

  const hanCount = (output.match(/[\u3400-\u9fff]/g) || []).length;
  if (hanCount) issues.push(`Sót ${hanCount} chữ Hán chưa dịch`);
  if (detectRawHanVietTranscription(output)) {
    issues.push("Còn phiên âm Hán-Việt/pinyin thô chưa dịch");
  }
  if (/__?\s*TC[ _-]*NAME/i.test(output)) {
    issues.push("Còn token khóa tên chưa được khôi phục");
  }

  if (original.length >= 250) {
    const ratio = output.length / original.length;
    if (ratio < 0.60) {
      issues.push(`Bản dịch có thể bị cụt (${Math.round(ratio * 100)}% bản gốc)`);
    } else if (ratio > 3.5) {
      issues.push(`Bản dịch dài bất thường (${Math.round(ratio * 100)}% bản gốc)`);
    }
  }

  return {
    qaRequired: issues.length > 0,
    qaIssues: issues,
    qualityScore: Math.max(0, 10 - Math.min(10, issues.length * 2.5))
  };
}

module.exports = { evaluateTranslationQuality };
