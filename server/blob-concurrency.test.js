"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { updateWithRetry } = require("./blob-concurrency");

test("replays a catalog mutation after a concurrent Blob write", async () => {
  let stored = { value: { books: ["crawler-book", "keep"] }, etag: "v1" };
  let writes = 0;

  const result = await updateWithRetry({
    read: async () => stored,
    mutate: async (catalog) => ({ books: catalog.books.filter((id) => id !== "crawler-book") }),
    write: async (catalog, etag) => {
      writes += 1;
      if (writes === 1) {
        stored = { value: { books: ["crawler-book", "new-from-crawler", "keep"] }, etag: "v2" };
        const error = new Error("ETag changed");
        error.name = "BlobPreconditionFailedError";
        throw error;
      }
      assert.equal(etag, "v2");
      stored = { value: catalog, etag: "v3" };
      return catalog;
    }
  });

  assert.equal(writes, 2);
  assert.deepEqual(result.books, ["new-from-crawler", "keep"]);
});
