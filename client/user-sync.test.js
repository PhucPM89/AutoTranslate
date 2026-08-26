"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  readLocalBookmarks,
  writeLocalBookmarks,
  mergeBookmarks,
  createUserSync
} = require("./user-sync.js");

function fakeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
}

test("readLocalBookmarks handles empty or invalid storage", () => {
  const storage = fakeStorage();
  assert.deepEqual(readLocalBookmarks(storage), {});
  storage.setItem("tramChu.userBookmarks", "not json");
  assert.deepEqual(readLocalBookmarks(storage), {});
});

test("writeLocalBookmarks persists correctly", () => {
  const storage = fakeStorage();
  const sample = { "book-1": { bookId: "book-1", chapterIndex: 5 } };
  writeLocalBookmarks(storage, sample);
  assert.deepEqual(readLocalBookmarks(storage), sample);
});

test("mergeBookmarks combines local and remote records by latest timestamp", () => {
  const local = {
    "book-1": { bookId: "book-1", chapterIndex: 2, updatedAt: "2026-01-01T00:00:00Z" },
    "book-2": { bookId: "book-2", chapterIndex: 10, updatedAt: "2026-01-05T00:00:00Z" }
  };
  const remote = [
    { book_id: "book-1", chapter_index: 8, updated_at: "2026-01-03T00:00:00Z" },
    { book_id: "book-3", chapter_index: 1, updated_at: "2026-01-02T00:00:00Z" }
  ];

  const merged = mergeBookmarks(local, remote);
  assert.equal(merged["book-1"].chapterIndex, 8, "remote is newer so chapterIndex 8 wins");
  assert.equal(merged["book-2"].chapterIndex, 10, "local-only preserved");
  assert.equal(merged["book-3"].chapterIndex, 1, "remote-only imported");
});

test("createUserSync toggleBookmark and saveProgress updates local and emits", () => {
  const storage = fakeStorage();
  const sync = createUserSync({ storage });
  const events = [];
  sync.subscribe((data) => events.push(data));

  assert.equal(sync.isBookmarked("book-99"), false);
  const added = sync.toggleBookmark("book-99", { chapterIndex: 3, chapterTitle: "Chương 3" });
  assert.equal(added, true);
  assert.equal(sync.isBookmarked("book-99"), true);
  assert.equal(sync.getBookmark("book-99").chapterIndex, 3);

  sync.saveProgress("book-99", { chapterIndex: 4, progressPct: 50 });
  assert.equal(sync.getBookmark("book-99").chapterIndex, 4);
  assert.equal(sync.getBookmark("book-99").progressPct, 50);

  const removed = sync.toggleBookmark("book-99");
  assert.equal(removed, false);
  assert.equal(sync.isBookmarked("book-99"), false);
});

test("removing a bookmark cancels its debounced upsert and deletes the cleaned id", async () => {
  const calls = [];
  const authClient = {
    getSession: () => ({ accessToken: "reader-token", user: { id: "user-1" } })
  };
  const sync = createUserSync({
    url: "https://project.supabase.co",
    anonKey: "anon",
    authClient,
    storage: fakeStorage(),
    syncDebounceMs: 5,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method || "GET" });
      return { ok: true };
    }
  });

  sync.toggleBookmark("cdn:book-1", { chapterIndex: 3 });
  sync.toggleBookmark("cdn:book-1");
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(calls.map((call) => call.method), ["DELETE"]);
  assert.match(calls[0].url, /book_id=eq\.book-1$/);
});

test("mergeBookmarks and createUserSync normalize prefixed bookIds to prevent duplication", () => {
  const local = {
    "cdn:book-1": { bookId: "cdn:book-1", chapterIndex: 2, updatedAt: "2026-01-01T00:00:00Z" }
  };
  const remote = [
    { book_id: "book-1", chapter_index: 5, updated_at: "2026-01-02T00:00:00Z" }
  ];

  const merged = mergeBookmarks(local, remote);
  assert.deepEqual(Object.keys(merged), ["book-1"], "deduplicated to canonical bookId without prefix");
  assert.equal(merged["book-1"].chapterIndex, 5);

  const storage = fakeStorage({
    "tramChu.userBookmarks": JSON.stringify(local)
  });
  const sync = createUserSync({ storage });
  assert.equal(sync.isBookmarked("cdn:book-1"), true);
  assert.equal(sync.isBookmarked("book-1"), true);
  assert.equal(sync.getBookmark("book-1").chapterIndex, 2);

  sync.saveProgress("cdn:book-1", { chapterIndex: 6 });
  assert.equal(sync.getBookmark("book-1").chapterIndex, 6);
  assert.equal(sync.getBookmark("cdn:book-1").chapterIndex, 6);
  assert.deepEqual(Object.keys(sync.getBookmarks()), ["book-1"]);
});
