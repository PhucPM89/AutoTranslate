"use strict";

// Crawler config, status and the "already crawled" list, read from the same
// infrastructure the rest of the pipeline uses.
//
// This exists because of a real outage. The crawler used to fetch all three from
// /api/crawler/* on Vercel, which kept them in Vercel Blob. Once that store went
// away the crawler could neither read its config - so it fell back to
// enabled:false - nor record its status, which returned HTTP 400, and every
// scheduled run failed. A worker running in GitHub Actions has no reason to ask a
// web app for its own state.
//
// State lives in the PRIVATE archive bucket, not the reader bucket: the reader
// bucket is served in full over the CDN and operational state has no business
// being public.

const { createArchiveStorage, createStorage } = require("./storage");
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

function createCrawlerState({ storage = null, readerStorage = null, db = null } = {}) {
  // Falls back to the reader bucket only when no separate archive bucket is
  // configured, which is the local-development case.
  const store = storage || createArchiveStorage() || createStorage();
  const database = db === null ? createSupabase() : db;
  // Injectable so the snapshot fallback can be tested without depending on
  // whichever driver the ambient environment happens to select.
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
          query: "?select=id,source,source_id,revision,total_chapters,translated_chapters&order=updated_at.desc"
        });
        return {
          books: (rows || []).map((row) => ({
            id: row.id,
            source: row.source,
            sourceId: row.source_id ? String(row.source_id) : "",
            revision: row.revision || 1,
            chapterCount: row.total_chapters || 0,
            translatedChapters: row.translated_chapters || 0
          }))
        };
      } catch (error) {
        console.warn(`Không đọc được catalog từ Supabase (${error.message}); thử snapshot trên R2.`);
      }
    }
    return readCatalogSnapshot();
  }

  // Fallback for when Supabase is unreachable: the published snapshot carries the
  // same book ids, and a fanqie id is recoverable from the "fanqie-<id>" key.
  async function readCatalogSnapshot() {
    const snapshot = await readJson(reader || createStorage(), "catalog/latest.json");
    const books = (snapshot?.books || []).map((book) => ({
      id: book.id,
      source: /^fanqie-/.test(book.id) ? "fanqie" : "admin",
      sourceId: /^fanqie-(.+)$/.test(book.id) ? String(book.id).replace(/^fanqie-/, "") : "",
      revision: book.revision || 1,
      chapterCount: book.chapterCount || 0,
      translatedChapters: book.translatedChapters || 0
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
