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
