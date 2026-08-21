"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchChapterComments, clearCommentsCache } = require("./comments.js");

test("comments: handles missing credentials cleanly without throwing", async () => {
  clearCommentsCache();
  const map = await fetchChapterComments({
    supabaseUrl: "",
    supabaseKey: "",
    bookId: "test-book",
    chapterIndex: 0
  });

  assert.equal(map.size, 0, "Returns empty Map when credentials are empty");
});
