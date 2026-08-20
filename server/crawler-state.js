"use strict";

// Crawler config, status and the "already crawled" list, read from the same
// infrastructure the rest of the pipeline uses.
//
// This exists because of a real outage. The crawler used to fetch all three from
// a web API backed by external blob storage; when that storage went away it could
// neither read its config - so it fell back to enabled:false - nor record its
// status, and every scheduled run failed. A worker running in GitHub Actions has
// no reason to ask a website for its own state.
//
// State lives in the PRIVATE archive bucket, not the reader bucket: the reader
// bucket is served in full over the CDN and operational state has no business
// being public.

const { createSupabase } = require("./supabase");
const {
  CATEGORY_DEFINITIONS,
  DEFAULT_CONFIG,
  DEFAULT_STATUS,
  sanitizeCrawlerConfig,
  sanitizeCrawlerStatus
} = require("./crawler-store");

const CONFIG_KEY = "crawler/config.json";
const STATUS_KEY = "crawler/status.json";

// `storage` is required rather than defaulted. Reaching for the ambient storage
// layer here would pull the filesystem driver into a Workers bundle, where fs does
// not exist - and a module that picks its own backend is harder to test besides.
// Callers running under Node build it from server/storage; the Worker passes an R2
// binding adapter.
function createCrawlerState({ storage, readerStorage = null, db = null } = {}) {
  if (!storage) throw new Error("createCrawlerState cần storage.");
  const store = storage;
  const database = db === null ? createSupabase() : db;
  const reader = readerStorage || null;

  async function readConfig() {
    const raw = await readJson(store, CONFIG_KEY);
    // sanitizeCrawlerConfig fills in every field it does not recognise, so a
    // partial or hand-edited file cannot produce an undefined option.
    return sanitizeCrawlerConfig(raw || DEFAULT_CONFIG);
  }

  async function writeConfig(patch) {
    const current = await readConfig();
    const next = sanitizeCrawlerConfig({ ...current, ...(patch || {}) });
    await store.put(CONFIG_KEY, JSON.stringify(next, null, 2));
    return next;
  }

  async function readStatus() {
    const raw = await readJson(store, STATUS_KEY);
    return sanitizeCrawlerStatus(raw || DEFAULT_STATUS);
  }

  async function writeStatus(status) {
    const next = sanitizeCrawlerStatus(status);
    await store.put(STATUS_KEY, JSON.stringify(next, null, 2));
    return next;
  }

  // The crawler only needs enough of the catalogue to avoid re-downloading a
  // book it already has, so this returns source ids and chapter counts rather
  // than full records.
  async function readCatalog() {
    if (database) {
      try {
        const rows = await database.request("books", {
          // last_crawled_at is not optional: selectWorkItems decides what needs a
          // refresh from it, and without it every book looked permanently stale,
          // so the crawler re-ingested the same books forever and never
          // discovered a new one.
          // genre travels with the book so a refresh keeps its category instead of
          // falling back to the placeholder "Fanqie".
          query:
            "?select=id,source,source_id,revision,total_chapters,translated_chapters,last_crawled_at,book_categories(categories(name))&order=updated_at.desc"
        });
        return {
          books: (rows || []).map((row) => ({
            id: row.id,
            source: row.source,
            sourceId: row.source_id ? String(row.source_id) : "",
            revision: row.revision || 1,
            chapterCount: row.total_chapters || 0,
            translatedChapters: row.translated_chapters || 0,
            lastCrawledAt: row.last_crawled_at || "",
            genre: row.book_categories?.[0]?.categories?.name || ""
          }))
        };
      } catch (error) {
        console.warn(`Không đọc được catalog từ Supabase (${error.message}); thử snapshot trên R2.`);
      }
    }
    return readCatalogSnapshot();
  }

  // Fallback for when Supabase is unreachable: the published snapshot carries the
  // same book ids, and a fanqie id is recoverable from the "fanqie-<id>" key. With
  // no reader storage there is nothing to fall back to, and an empty catalogue is
  // safe - the crawler re-checks a book rather than skipping one.
  async function readCatalogSnapshot() {
    if (!reader) return { books: [] };
    const snapshot = await readJson(reader, "catalog/latest.json");
    const books = (snapshot?.books || []).map((book) => ({
      id: book.id,
      source: /^fanqie-/.test(book.id) ? "fanqie" : "admin",
      sourceId: /^fanqie-(.+)$/.test(book.id) ? String(book.id).replace(/^fanqie-/, "") : "",
      revision: book.revision || 1,
      chapterCount: book.chapterCount || 0,
      translatedChapters: book.translatedChapters || 0,
      // The snapshot carries no crawl timestamp. Treating that as "never crawled"
      // would make every book due for refresh, which is the loop this avoids.
      lastCrawledAt: book.updatedAt || "",
      genre: book.genre || ""
    }));
    return { books };
  }

  // Shaped exactly like the old /api/crawler/control response so the worker's
  // destructuring is unchanged.
  async function readControl() {
    const [config, status, catalog] = await Promise.all([readConfig(), readStatus(), readCatalog()]);
    return { config, categories: CATEGORY_DEFINITIONS, catalog, status };
  }

  return { readConfig, writeConfig, readStatus, writeStatus, readCatalog, readControl, keys: { CONFIG_KEY, STATUS_KEY } };
}

async function readJson(store, key) {
  const buffer = await store.get(key).catch(() => null);
  if (!buffer) return null;
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    // A corrupt state file must not stop a run; the sanitisers will substitute
    // defaults and the next write repairs it.
    console.warn(`State ${key} không phải JSON hợp lệ, dùng mặc định.`);
    return null;
  }
}

module.exports = { createCrawlerState, CONFIG_KEY, STATUS_KEY };
