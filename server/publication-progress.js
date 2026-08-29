"use strict";

const { isProtectedGeminiDocument } = require("./translation-version");

function isApprovedChapter(entry) {
  return Boolean(entry && (entry.qaStatus === "approved" || isProtectedGeminiDocument(entry)));
}

function applyPublicationProgress(index, now = new Date().toISOString()) {
  if (!index || !Array.isArray(index.chapters)) return { approved: 0, total: 0, complete: false };
  const total = index.chapters.length;
  const approved = index.chapters.filter(isApprovedChapter).length;
  const complete = total > 0 && approved >= total;
  index.approvedChapters = approved;
  index.translatedChapters = approved;
  index.status = complete ? "Hoàn thành" : "Đang cập nhật";
  index.updatedAt = now;
  return { approved, total, complete };
}

module.exports = { isApprovedChapter, applyPublicationProgress };
