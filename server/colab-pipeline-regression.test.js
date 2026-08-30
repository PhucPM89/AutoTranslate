"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function runPython(lines) {
  const result = spawnSync("python", ["-B", "-c", lines.join("\n")], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("Hachimi restores Marian-mangled name tokens in source occurrence order", () => {
  const output = runPython([
    "import json",
    "from colab.hachimi_text import restore_glossary_placeholders",
    "replacements = [('__TC_NAME_0000__', 'Ly So Nhat'), ('__TC_NAME_0001__', 'Tieu Hoa')]",
    "mangled = 'Ta ten la __TC_NAME_0090%, gap _TC_NAME_00%__ hom nay.'",
    "restored = restore_glossary_placeholders(mangled, replacements, ['Ly So Nhat', 'Tieu Hoa'])",
    "print(json.dumps({'restored': restored, 'hasToken': 'TC_NAME' in restored}))",
  ]);
  assert.equal(output.restored, "Ta ten la Ly So Nhat, gap Tieu Hoa hom nay.");
  assert.equal(output.hasToken, false);
});

test("Qwen JSON parser repairs literal newlines inside JSON strings", () => {
  const output = runPython([
    "import json",
    "from colab.hachimi_text import parse_model_json",
    "raw = '{\"title\":\"Chuong 1\",\"content\":\"Dong mot\\nDong hai\"}'",
    "parsed = parse_model_json(raw)",
    "print(json.dumps(parsed))",
  ]);
  assert.equal(output.title, "Chuong 1");
  assert.equal(output.content, "Dong mot\nDong hai");
});

test("front-matter classifier separates Fanqie metadata from narrative chapters", () => {
  const output = runPython([
    "import json",
    "from colab.hachimi_text import classify_source_document",
    "front = classify_source_document('\\u7b80\\u4ecb', '\\u4e66\\u540d\\uff1aX\\n\\u4f5c\\u8005\\uff1aY\\n\\u6807\\u7b7e\\uff1aZ|\\u5df2\\u5b8c\\u7ed3')",
    "chapter = classify_source_document('\\u7b2c001\\u7ae0 \\u770b\\u76f8', '\\u6211\\u53eb\\u674e\\u521d\\u4e00\\uff0c\\u4eca\\u5e74\\u4e8c\\u5341\\u5c81\\u6574\\u3002')",
    "print(json.dumps({'front': front, 'chapter': chapter}))",
  ]);
  assert.deepEqual(output, { front: "front_matter", chapter: "chapter" });
});

test("Colab workers invalidate bad v2 drafts and perform guided Qwen refinement", () => {
  const hachimi = fs.readFileSync(path.join(root, "scripts", "colab_standalone_worker.py"), "utf8");
  const qwen = fs.readFileSync(path.join(root, "colab", "qwen_qa_worker.py"), "utf8");

  assert.match(hachimi, /TRANSLATION_VERSION = "hachimi-quality-v3"/);
  assert.match(hachimi, /broken_name_lock/);
  assert.match(hachimi, /chờ Qwen QA/);
  assert.match(hachimi, /entry\.get\("translationVersion"\) == TRANSLATION_VERSION/);
  assert.match(hachimi, /HACHIMI_CHAPTER_RETRIES/);
  assert.match(hachimi, /worker tiếp tục chương kế tiếp/);
  assert.match(hachimi, /Nghỉ 60s rồi tự quét lại để xử lý các chương còn pending/);
  assert.match(hachimi, /acquire_hachimi_book_lease/);
  assert.match(hachimi, /một Hachimi worker khác đang giữ lease/);
  assert.match(hachimi, /termCount.*len\(existing_glossary\)/s);
  assert.match(hachimi, /assert_write_generation\(job_key, expected_generation\)/);
  assert.match(hachimi, /Job đã được reset trong lúc worker đang chạy/);
  assert.match(hachimi, /TARGET_BOOK_ID/);
  assert.match(hachimi, /chỉ xử lý/);
  assert.match(qwen, /REVIEW_VERSION = "semantic-v3"/);
  assert.match(qwen, /QA_MAX_REWRITE_PASSES/);
  assert.match(qwen, /Semantic repair/);
  assert.match(qwen, /EXPECTED_DRAFT_VERSION/);
  assert.match(qwen, /"state": "superseded"/);
  assert.match(qwen, /story_bible_for_prompt/);
  assert.match(qwen, /tuyệt đối không bắt đổi thành 'Grandpa'/);
  assert.match(qwen, /parse_model_json\(raw\)/);
  assert.match(qwen, /StaleJobGenerationError/);
  assert.match(qwen, /assert_write_generation\(book_id, expected_generation\)/);
  assert.match(qwen, /RETRY_FAILED/);
  assert.match(qwen, /focused_queue_key/);
});
