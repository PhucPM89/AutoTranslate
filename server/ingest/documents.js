"use strict";

const { LAYOUT } = require("../storage/keys");

// Shapes of the two JSON documents the reader fetches straight from the CDN.
// Kept deliberately small: no HTML, no EPUB metadata the reader never reads.

const SCHEMA_VERSION = 1;

function buildChapterDocument({ bookId, revision, chapter, translation, translationStatus }) {
  if (!bookId) throw new Error("Chapter document cần bookId.");
  const status = translationStatus || (translation ? "completed" : "pending");
  return {
    schema: SCHEMA_VERSION,
    bookId,
    revision,
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    // `content` is always what the reader should display. When a chapter has not
    // been translated yet the reader still gets the source text plus a status, so
    // the page is never empty and never has to call an API to find out why.
    content: status === "completed" && translation ? translation : chapter.content,
    translationStatus: status,
    characters: (status === "completed" && translation ? translation : chapter.content).length,
    updatedAt: new Date().toISOString()
  };
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
      n: chapter.chapterNumber,
      title: chapter.title,
      status: chapter.translationStatus
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
