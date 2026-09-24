"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { selectPriorityJobs } = require("./translation-priority");
test("priority keeps current novel first, then selects requested next novel", async () => {
  const ids = ["ac-mong", "quy-the"];
  const load = async id => [{bookId:id}];
  assert.equal((await selectPriorityJobs(ids, load)).bookId, "ac-mong");
  assert.equal((await selectPriorityJobs(ids, async id => id === "ac-mong" ? [] : load(id))).bookId, "quy-the");
  assert.equal(await selectPriorityJobs(ids, async () => []), null);
});
test("invalid ids are ignored, and load failures do not silently skip priority", async () => {
  const seen = [];
  assert.equal(await selectPriorityJobs(["../bad", "a", "a"], async id => {seen.push(id);return [];}), null);
  assert.deepEqual(seen, ["a"]);
  await assert.rejects(selectPriorityJobs(["a"], async () => {throw Error("storage unavailable");}), /unavailable/);
});
