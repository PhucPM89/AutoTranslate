"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Qwen worker always performs a full rewrite before semantic verification", () => {
  const worker = fs.readFileSync(path.join(__dirname, "..", "colab", "qwen_qa_worker.py"), "utf8");

  const rewriteCall = worker.indexOf("rewritten_doc = engine.rewrite_chapter(");
  const verifyCall = worker.indexOf("final_review = engine.review_chapter(", rewriteCall);
  const publishCall = worker.indexOf("r2_put_json(chapter_key, updated_chapter", verifyCall);

  assert.ok(rewriteCall >= 0, "full rewrite call is required");
  assert.ok(verifyCall > rewriteCall, "verification must run after the rewrite");
  assert.ok(publishCall > verifyCall, "publish must run after verification");
  assert.match(worker, /"provider": "qwen-rewrite"/);
  assert.match(worker, /"translationVersion": "qwen-full-rewrite-v1"/);
  assert.match(worker, /"rewriteMode": "full"/);
  assert.match(worker, /all\(s >= 9 for s in scores\.values\(\)\)/);
});
