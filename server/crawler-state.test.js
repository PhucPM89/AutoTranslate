"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { createCrawlerState, CONFIG_KEY, STATUS_KEY } = require("./crawler-state");
const { DEFAULT_CONFIG } = require("./crawler-store");

// A tiny in-memory store standing in for R2. The point of these tests is the
// state machine around the storage, not the driver, which has its own tests.
function memoryStore(initial = {}) {
  const objects = new Map(Object.entries(initial).map(([key, value]) => [key, Buffer.from(value)]));
  return {
    objects,
    async get(key) {
      if (!objects.has(key)) throw new Error(`không có ${key}`);
      return objects.get(key);
    },
    async put(key, body) {
      objects.set(key, Buffer.from(body));
    },
    async head(key) {
      return objects.has(key);
    }
  };
}

test("falls back to defaults when no config has been written yet", async () => {
  const state = createCrawlerState({ storage: memoryStore(), db: false });
  const config = await state.readConfig();
  // The old behaviour read this from Vercel Blob and silently produced
  // enabled:false, which is how the crawler ended up switched off.
  assert.equal(config.enabled, DEFAULT_CONFIG.enabled);
  assert.ok(Array.isArray(config.categories));
  const status = await state.readStatus();
  assert.equal(typeof status.state, "string");
});

test("writeConfig merges onto what is already stored", async () => {
  const store = memoryStore();
  const state = createCrawlerState({ storage: store, db: false });

  await state.writeConfig({ enabled: true, maxNewBooksPerRun: 3 });
  const first = await state.readConfig();
  assert.equal(first.enabled, true);
  assert.equal(first.maxNewBooksPerRun, 3);

  // A later patch must not reset unrelated fields.
  await state.writeConfig({ updateExisting: false });
  const second = await state.readConfig();
  assert.equal(second.enabled, true, "enabled phải giữ nguyên");
  assert.equal(second.maxNewBooksPerRun, 3, "maxNewBooksPerRun phải giữ nguyên");
  assert.equal(second.updateExisting, false);
});

test("config is sanitised on the way in, so a bad value cannot reach a run", async () => {
  const state = createCrawlerState({ storage: memoryStore(), db: false });
  const saved = await state.writeConfig({ categories: ["fantasy", "khong-ton-tai"], maxNewBooksPerRun: 9999 });
  assert.ok(!saved.categories.includes("khong-ton-tai"), "thể loại lạ phải bị bỏ");
  assert.ok(saved.maxNewBooksPerRun <= 50, `maxNewBooksPerRun phải bị kẹp, nhận ${saved.maxNewBooksPerRun}`);
});

test("a corrupt state file yields defaults rather than throwing", async () => {
  const store = memoryStore({ [CONFIG_KEY]: "{ this is not json", [STATUS_KEY]: "also not json" });
  const state = createCrawlerState({ storage: store, db: false });
  const config = await state.readConfig();
  assert.equal(config.enabled, DEFAULT_CONFIG.enabled);
  const status = await state.readStatus();
  assert.equal(typeof status.state, "string");
});

test("status round-trips through the store", async () => {
  const store = memoryStore();
  const state = createCrawlerState({ storage: store, db: false });
  await state.writeStatus({ state: "running", message: "Đang tải book 123", currentBookId: "123" });
  const status = await state.readStatus();
  assert.equal(status.state, "running");
  assert.equal(status.currentBookId, "123");
  assert.ok(store.objects.has(STATUS_KEY));
});

test("the catalogue reports source ids so the crawler can skip known books", async () => {
  const db = {
    async request() {
      return [
        { id: "fanqie-123", source: "fanqie", source_id: "123", revision: 1, total_chapters: 900, translated_chapters: 10 },
        { id: "mot-truyen", source: "admin", source_id: null, revision: 2, total_chapters: 5, translated_chapters: 5 }
      ];
    }
  };
  const state = createCrawlerState({ storage: memoryStore(), db });
  const catalog = await state.readCatalog();
  assert.equal(catalog.books.length, 2);
  assert.deepEqual(catalog.books[0], {
    id: "fanqie-123",
    source: "fanqie",
    sourceId: "123",
    revision: 1,
    chapterCount: 900,
    translatedChapters: 10
  });
  // A null source_id must become "" rather than the string "null", which would
  // otherwise be treated as a real id when de-duplicating.
  assert.equal(catalog.books[1].sourceId, "");
});

test("readControl keeps the shape the worker already destructures", async () => {
  const db = { async request() { return []; } };
  const state = createCrawlerState({ storage: memoryStore(), db });
  const control = await state.readControl();
  for (const key of ["config", "categories", "catalog", "status"]) {
    assert.ok(key in control, `thiếu ${key}`);
  }
  assert.ok(Object.keys(control.categories).length > 0, "categories phải có định nghĩa");
});

test("a Supabase failure degrades to the published snapshot", async () => {
  const db = {
    async request() {
      throw new Error("Supabase GET books lỗi HTTP 503");
    }
  };
  const snapshot = JSON.stringify({
    books: [{ id: "fanqie-777", revision: 3, chapterCount: 1200, translatedChapters: 4 }]
  });
  const state = createCrawlerState({
    storage: memoryStore(),
    readerStorage: memoryStore({ "catalog/latest.json": snapshot }),
    db
  });

  const catalog = await state.readCatalog();
  // The source id has to be recovered from the "fanqie-<id>" key, or every book
  // looks new and gets downloaded again.
  assert.deepEqual(catalog.books, [
    { id: "fanqie-777", source: "fanqie", sourceId: "777", revision: 3, chapterCount: 1200, translatedChapters: 4 }
  ]);
});

test("an empty snapshot is safe: a book gets re-checked, never silently skipped", async () => {
  const db = {
    async request() {
      throw new Error("Supabase down");
    }
  };
  const state = createCrawlerState({
    storage: memoryStore(),
    readerStorage: memoryStore({ "catalog/latest.json": JSON.stringify({ books: [] }) }),
    db
  });
  assert.deepEqual((await state.readCatalog()).books, []);
});
