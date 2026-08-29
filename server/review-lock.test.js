"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLocalStorage } = require("./storage/local-driver");
const { acquireReviewLock, releaseReviewLock } = require("./review-lock");

test("semantic review book lock is exclusive, owner-bound and reclaimable after expiry", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-lock-"));
  const storage = createLocalStorage({ LOCAL_STORAGE_DIR: root });
  assert.ok(await acquireReviewLock(storage, "book", "one", { now: 1000, leaseMs: 100 }));
  assert.equal(await acquireReviewLock(storage, "book", "two", { now: 1050, leaseMs: 100 }), null);
  assert.equal(await releaseReviewLock(storage, "book", "two"), false);
  assert.equal(await releaseReviewLock(storage, "book", "one"), true);
  assert.ok(await acquireReviewLock(storage, "book", "two", { now: 1100, leaseMs: 100 }));
  assert.ok(await acquireReviewLock(storage, "book", "three", { now: 1300, leaseMs: 100 }));
});
