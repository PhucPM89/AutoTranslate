"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createR2Storage } = require("./r2-driver");
test("HEAD requests an uncompressed representation for conditional-write ETags", async t => {
  let captured;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    captured = options;
    return new Response(null, {status:200,headers:{etag:'"strong-etag"', 'content-length':'42'}});
  });
  const storage = createR2Storage({ R2_ACCOUNT_ID:"test",R2_BUCKET:"test",R2_ACCESS_KEY_ID:"test",R2_SECRET_ACCESS_KEY:"test" });
  const result = await storage.head("books/test/r1/ch/1.json");
  assert.equal(new Headers(captured.headers).get("accept-encoding"), "identity");
  assert.equal(result.etag, '"strong-etag"');
  assert.equal(result.size, 42);
});
