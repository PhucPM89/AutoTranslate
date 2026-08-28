"use strict";

const { LAYOUT } = require("../storage/keys");

// Shapes of the two JSON documents the reader fetches straight from the CDN.
// Kept deliberately small: no HTML, no EPUB metadata the reader never reads.

const SCHEMA_VERSION = 1;

// translationStatus values, weakest to strongest content:
//   pending   — not yet processed; reader sees the raw source text.
//   convert   — offline Hán-Việt convert; readable Vietnamese, exact terminology,
//               produced instantly at ingest so no chapter is ever unreadable.
//   completed — LLM translation; the fluent tier that upgrades convert on demand.
// `convert` and `completed` both supply a `translation`; `pending` does not.
function buildChapterDocument({
  bookId,
  revision,
  chapter,
  translation,
  translationStatus,
  convertVersion,
  provider,
  model,
  qaReviewed,
  qaIssuesFixed
}) {
  if (!bookId) throw new Error("Chapter document cần bookId.");
  const status = translationStatus || (translation ? "completed" : "pending");
  const hasRendered = translation && (status === "completed" || status === "convert");
  const content = hasRendered ? translation : chapter.content;
  const doc = {
    schema: SCHEMA_VERSION,
    bookId,
    revision,
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    // `content` is always what the reader should display. A not-yet-translated
    // chapter still gets readable text (source or convert) plus a status, so the
    // page is never empty and never has to call an API to find out why.
    content,
    translationStatus: status,
    characters: content ? content.length : 0,
    updatedAt: new Date().toISOString()
  };
  if (provider) doc.provider = provider;
  if (model) doc.model = model;
  if (qaReviewed !== undefined) doc.qaReviewed = qaReviewed;
  if (qaIssuesFixed) doc.qaIssuesFixed = qaIssuesFixed;
  // Stamp convert output with the engine version, so a later backfill can tell a
  // stale convert from a current one and re-render only what changed.
  if (status === "convert" && convertVersion != null) doc.convertVersion = convertVersion;
  return doc;
}

function buildOriginalDocument({ bookId, revision, chapter }) {
  return {
    schema: SCHEMA_VERSION,
    bookId,
    revision,
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    content: chapter.content,
    characters: chapter.content.length
  };
}

// The index is the only mutable reader-facing document, so it stays small and is
// purged on publish. It carries just enough for the table of contents and for the
// reader to build a chapter URL without another round trip.
function buildBookIndex({ book, revision, chapters, publicUrlFor }) {
  // A per-chapter URL string would dominate this file (about 40% of it for a
  // 1,400-chapter novel) and it is fully derivable, so the index ships one
  // template and the reader substitutes the chapter number.
  const template = publicUrlFor
    ? publicUrlFor(LAYOUT.chapter(book.id, revision, 1)).replace(/\/1\.json$/, "/{n}.json")
    : LAYOUT.chapter(book.id, revision, 1).replace(/\/1\.json$/, "/{n}.json");
  return {
    schema: SCHEMA_VERSION,
    bookId: book.id,
    revision,
    chapterUrlTemplate: template,
    title: book.title,
    author: book.author || "",
    genre: book.genre || "",
    status: book.status || "",
    description: book.description || "",
    cover: book.cover || "",
    // Provenance travels with the index because index.json is the canonical
    // per-book document. Leaving it out meant anything rebuilding a database row
    // from the index - the translation worker's safety net, the storage fallback -
    // recreated the book as an admin upload with no source id, and the crawler
    // then stopped recognising its own novels.
    source: book.source || "admin",
    sourceId: book.sourceId ? String(book.sourceId) : "",
    sourceUrl: book.sourceUrl || "",
    totalChapters: chapters.length,
    translatedChapters: chapters.filter((c) => c.translationStatus === "completed").length,
    updatedAt: new Date().toISOString(),
    chapters: chapters.map((chapter) => ({
      n: chapter.chapterNumber != null ? chapter.chapterNumber : chapter.n,
      title: chapter.title,
      status: chapter.translationStatus || chapter.status || "pending",
      ...(chapter.provider ? { provider: chapter.provider } : {}),
      ...(chapter.model ? { model: chapter.model } : {}),
      ...(chapter.qaReviewed !== undefined ? { qaReviewed: chapter.qaReviewed } : {})
    }))
  };
}

function chapterKey(bookId, revision, chapterNumber) {
  return LAYOUT.chapter(bookId, revision, chapterNumber);
}

function originalKey(bookId, revision, chapterNumber) {
  return LAYOUT.chapterOriginal(bookId, revision, chapterNumber);
}

function indexKey(bookId) {
  return LAYOUT.bookIndex(bookId);
}

// Mirrors chapterUrlTemplate so the reader and the ingest agree on one rule.
function chapterUrlFromTemplate(template, chapterNumber) {
  return String(template || "").replace("{n}", String(chapterNumber));
}

module.exports = {
  SCHEMA_VERSION,
  buildChapterDocument,
  buildOriginalDocument,
  buildBookIndex,
  chapterKey,
  originalKey,
  indexKey,
  chapterUrlFromTemplate
};
