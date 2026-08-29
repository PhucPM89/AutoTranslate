"use strict";

// Deterministic object layout. Original source objects are immutable. A
// translated chapter is deliberately short-cached because semantic QA upgrades
// the reader-facing object in place after approving a private draft.
//
//   books/{bookId}/index.json                  short cache, purged on publish
//   books/{bookId}/r{rev}/ch/{n}.json          short-cache, QA-upgradable chapter
//   books/{bookId}/r{rev}/ch/{n}.original.json immutable, source chapter
//   covers/{bookId}.webp                       long cache
//   archives/{bookId}.epub                     never served to readers
const LAYOUT = {
  bookIndex: (bookId) => `books/${slug(bookId)}/index.json`,
  chapter: (bookId, rev, chapterNumber) => `books/${slug(bookId)}/r${revision(rev)}/ch/${number(chapterNumber)}.json`,
  chapterOriginal: (bookId, rev, chapterNumber) =>
    `books/${slug(bookId)}/r${revision(rev)}/ch/${number(chapterNumber)}.original.json`,
  chapterDraft: (bookId, rev, chapterNumber) =>
    `drafts/${slug(bookId)}/r${revision(rev)}/ch/${number(chapterNumber)}.json`,
  storyBible: (bookId) => `story-bible/${slug(bookId)}.json`,
  storyContext: (bookId) => `story-context/${slug(bookId)}.json`,
  bookTranslationMemory: (bookId) => `tm/books/${slug(bookId)}.json`,
  cover: (bookId, extension = ".webp") => `covers/${slug(bookId)}${extension}`,
  archive: (bookId) => `archives/${slug(bookId)}.epub`,
  catalogSnapshot: () => "catalog/latest.json"
};

// Cache policy travels with the key so the uploader cannot get it wrong.
const IMMUTABLE = "public, max-age=31536000, immutable";
const SHORT = "public, max-age=60, stale-while-revalidate=600";
const LONG = "public, max-age=604800, stale-while-revalidate=2592000";
const PRIVATE = "private, no-store";

function cacheControlFor(key) {
  if (key.startsWith("drafts/") || key.startsWith("story-bible/") || key.startsWith("story-context/") || key.startsWith("tm/books/")) return PRIVATE;
  if (/\/r\d+\/ch\/\d+\.original\.json$/.test(key)) return IMMUTABLE;
  if (/\/r\d+\/ch\/\d+\.json$/.test(key)) return SHORT;
  if (key.endsWith("/index.json")) return SHORT;
  if (key.startsWith("covers/")) return LONG;
  if (key.startsWith("catalog/")) return SHORT;
  if (key.startsWith("archives/")) return PRIVATE;
  return SHORT;
}

function contentTypeFor(key) {
  if (key.endsWith(".json")) return "application/json; charset=utf-8";
  if (key.endsWith(".epub")) return "application/epub+zip";
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

// Book ids come from the catalog (`fanqie-<digits>`) or an admin slug, so they are
// already tame. This validates rather than rewrites: silently mapping "../../etc"
// to "etc" would let two different books collide on one storage key, so a bad id
// is a loud failure at ingest time instead.
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function slug(value) {
  const id = String(value == null ? "" : value);
  if (!SAFE_ID.test(id) || id.includes("..")) {
    throw new Error(`Storage key cần bookId hợp lệ (nhận được: ${JSON.stringify(id).slice(0, 60)}).`);
  }
  return id;
}

function revision(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) throw new Error(`Revision không hợp lệ: ${value}`);
  return n;
}

function number(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) throw new Error(`Chapter number không hợp lệ: ${value}`);
  return n;
}

module.exports = { LAYOUT, cacheControlFor, contentTypeFor, slug, IMMUTABLE, SHORT, LONG, PRIVATE };
