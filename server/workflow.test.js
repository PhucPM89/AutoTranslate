"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const WORKFLOWS = path.join(__dirname, "..", ".github", "workflows");

test("all R2 pipeline writers share one GitHub Actions concurrency group", () => {
  for (const name of ["fanqie-crawler.yml", "ingest-book.yml", "translate-worker.yml"]) {
    const yaml = fs.readFileSync(path.join(WORKFLOWS, name), "utf8");
    assert.match(yaml, /group:\s*novel-pipeline-storage-writes/, name);
    if (name !== "translate-worker.yml") assert.match(yaml, /cancel-in-progress:\s*false/, name);
  }
});

test("an admin focus dispatch is the only translation run allowed to replace active work", () => {
  const workflow = fs.readFileSync(path.join(WORKFLOWS, "translate-worker.yml"), "utf8");
  assert.match(workflow, /replace_current:/);
  assert.match(workflow, /cancel-in-progress:\s*\$\{\{[^\n]*inputs\.replace_current == 'true'/);
});

test("ingest workflow leaves translation to the dedicated worker", () => {
  const yaml = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ingest-book.yml"), "utf8");
  assert.doesNotMatch(yaml, /node scripts\/translate-worker\.js/);
});
