"use strict";

const { LAYOUT } = require("../storage/keys");
const { createSupabase } = require("../supabase");

// The library page needs a list of books. Serving that from a serverless function
// puts one invocation on every visit, so the list is published to R2 as a snapshot
// and read straight from the CDN instead.
//
// Supabase stays the source of truth; the snapshot is a derived, cache-friendly
// copy that is regenerated after every ingest. When Supabase is not configured yet
// the snapshot is rebuilt from the book indexes already in R2, so the reader has a
// catalogue either way.

const SNAPSHOT_SCHEMA = 1;

async function buildSnapshotFromSupabase(env = process.env) {
  const db = createSupabase(env);
  if (!db) return null;
  const rows = await db.listBooks({ limit: 1000, order: "updated_at.desc" });
  if (!Array.isArray(rows)) return null;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    author: row.author || "",
    description: row.description || "",
    cover: row.cover_url || "",
    status: row.status || "",
    // Flattened from the embedded join; "" when a book has no category yet, which
    // the client treats as uncategorised rather than inventing a label.
    genre: row.book_categories?.[0]?.categories?.name || "",
    chapterCount: row.total_chapters || 0,
    translatedChapters: row.translated_chapters || 0,
    revision: row.revision || 1,
    featured: Boolean(row.featured),
    updatedAt: (row.updated_at || "").slice(0, 10)
  }));
}

// Fallback: every ingested book has an index.json, so the catalogue can be
// reconstructed from storage alone.
async function buildSnapshotFromStorage(storage) {
  const objects = await storage.list("books/");
  const indexKeys = objects.filter((object) => object.key.endsWith("/index.json"));
  const books = [];
  for (const object of indexKeys) {
    const raw = await storage.get(object.key);
    if (!raw) continue;
    try {
      const index = JSON.parse(raw.toString("utf8"));
      books.push({
        id: index.bookId,
        title: index.title,
        author: index.author || "",
        description: index.description || "",
        cover: index.cover || "",
        status: index.status || "",
        chapterCount: index.totalChapters || 0,
        translatedChapters: index.translatedChapters || 0,
        revision: index.revision || 1,
        featured: false,
        updatedAt: (index.updatedAt || "").slice(0, 10)
      });
    } catch {
      // A malformed index should not take the whole catalogue down.
    }
  }
  return books.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function publishCatalogSnapshot({ storage, site = {}, env = process.env, log = () => {} }) {
  let books = null;
  let source = "supabase";
  try {
    books = await buildSnapshotFromSupabase(env);
  } catch (error) {
    log({ event: "catalog.supabase_failed", message: error.message });
  }
  if (!books || !books.length) {
    books = await buildSnapshotFromStorage(storage);
    source = "storage";
  }

  const snapshot = {
    schema: SNAPSHOT_SCHEMA,
    generatedAt: new Date().toISOString(),
    source,
    site,
    books
  };
  await storage.put(LAYOUT.catalogSnapshot(), JSON.stringify(snapshot));
  log({ event: "catalog.snapshot_published", source, books: books.length });
  return snapshot;
}

module.exports = { publishCatalogSnapshot, buildSnapshotFromSupabase, buildSnapshotFromStorage, SNAPSHOT_SCHEMA };
