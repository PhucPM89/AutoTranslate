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

function hasHan(str) {
  return /\p{Script=Han}/u.test(String(str || ""));
}

function resolveCoverUrl(bookId, coverUrl, env = process.env) {
  if (coverUrl && typeof coverUrl === "string") {
    if (coverUrl.startsWith("/covers/")) return coverUrl;
    const match = coverUrl.match(/\/covers\/[^/?#]+/);
    if (match) return match[0];
  }
  return bookId ? `/covers/${bookId}.jpg` : "";
}

async function buildSnapshotFromSupabase(env = process.env, storage = null) {
  const db = createSupabase(env);
  if (!db) return null;
  const rows = await db.listBooks({ limit: 1000, order: "updated_at.desc" });
  if (!Array.isArray(rows)) return null;
  const filtered = rows.filter((row) => row && row.id && row.title && !hasHan(row.title) && !hasHan(row.author));
  
  return Promise.all(
    filtered.map(async (row) => {
      let totalChapters = row.total_chapters || 0;
      let translatedChapters = row.translated_chapters || 0;

      if (totalChapters <= 0 && storage) {
        try {
          const raw = await storage.get(`books/${row.id}/index.json`);
          if (raw) {
            const idx = JSON.parse(raw.toString("utf8"));
            totalChapters = Number(idx.totalChapters || idx.chapters?.length || 0);
            translatedChapters = Number(idx.translatedChapters || translatedChapters || 0);
          }
        } catch {}
      }

      return {
        id: row.id,
        title: row.title,
        author: row.author || "",
        description: row.description || "",
        cover: resolveCoverUrl(row.id, row.cover_url, env),
        status: row.status || "",
        // Flattened from the embedded join; "" when a book has no category yet, which
        // the client treats as uncategorised rather than inventing a label.
        genre: row.book_categories?.[0]?.categories?.name || "",
        chapterCount: totalChapters,
        translatedChapters,
        revision: row.revision || 1,
        featured: Boolean(row.featured),
        updatedAt: row.updated_at || "",
        createdAt: row.created_at || ""
      };
    })
  );
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
      if (!index || !index.title || hasHan(index.title) || hasHan(index.author)) continue;
      books.push({
        id: index.bookId,
        title: index.title,
        author: index.author || "",
        description: index.description || "",
        cover: resolveCoverUrl(index.bookId, index.cover, process.env),
        status: index.status || "",
        chapterCount: index.totalChapters || 0,
        translatedChapters: index.translatedChapters || 0,
        revision: index.revision || 1,
        featured: false,
        updatedAt: index.updatedAt || "",
        createdAt: index.createdAt || ""
      });
    } catch {
      // A malformed index should not take the whole catalogue down.
    }
  }
  return books.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

async function publishCatalogSnapshot({ storage, site = {}, env = process.env, log = () => {} }) {
  let books = null;
  let source = "supabase";
  try {
    books = await buildSnapshotFromSupabase(env, storage);
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
