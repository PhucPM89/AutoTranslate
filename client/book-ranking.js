"use strict";

function translationProgress(book) {
  const total = Math.max(0, Number(book?.chapterCount || book?.totalChapters || 0));
  const translated = Math.max(0, Number(book?.translatedChapters || 0));
  return {
    total,
    translated,
    percent: total > 0 ? Math.min(100, (translated / total) * 100) : 0
  };
}

function selectTranslationRanking(books, limit = 6) {
  return [...(Array.isArray(books) ? books : [])]
    .filter((book) => translationProgress(book).translated > 0)
    .sort((a, b) => {
      const pa = translationProgress(a);
      const pb = translationProgress(b);
      if (pb.translated !== pa.translated) return pb.translated - pa.translated;
      if (pb.percent !== pa.percent) return pb.percent - pa.percent;
      const updated = Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0);
      if (updated) return updated;
      return String(a.title || a.id || "").localeCompare(String(b.title || b.id || ""), "vi");
    })
    .slice(0, Math.max(0, Number(limit) || 0));
}

module.exports = { translationProgress, selectTranslationRanking };
