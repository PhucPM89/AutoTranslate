"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("all R2 pipeline writers share one GitHub Actions concurrency group", () => {
  const root = path.join(__dirname, "..", ".github", "workflows");
  for (const name of ["fanqie-crawler.yml", "ingest-book.yml", "translate-worker.yml"]) {
    const yaml = fs.readFileSync(path.join(root, name), "utf8");
    assert.match(yaml, /group:\s*novel-pipeline-storage-writes/, name);
    assert.match(yaml, /cancel-in-progress:\s*false/, name);
  }
});

test("ingest workflow leaves translation to the dedicated worker", () => {
  const yaml = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ingest-book.yml"), "utf8");
  assert.doesNotMatch(yaml, /node scripts\/translate-worker\.js/);
});
