"use strict";

/**
 * 1-Click Reader Term Correction & Feedback Client.
 * Allows readers to highlight text and suggest translation improvements,
 * directly updating the book glossary and translation memory.
 */

async function submitTermFeedback({ bookId, originalTerm, suggestedTranslation }) {
  if (!bookId || !originalTerm || !suggestedTranslation) {
    throw new Error("Vui lòng điền đầy đủ từ gốc và bản dịch đề xuất.");
  }

  const response = await fetch("/api/reader/term-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bookId,
      originalTerm: String(originalTerm).trim(),
      suggestedTranslation: String(suggestedTranslation).trim()
    })
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Gửi góp ý thất bại, vui lòng thử lại.");
  }

  return data;
}

module.exports = {
  submitTermFeedback
};
