"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchChapterComments, postComment, clearCommentsCache } = require("./comments.js");

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

test("comments: posting requires an authenticated reader token", async () => {
  await assert.rejects(
    postComment({ supabaseUrl: "https://project.supabase.co", supabaseKey: "anon", content: "hello" }),
    /đăng nhập/
  );
});
