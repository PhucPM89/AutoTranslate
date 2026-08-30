"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

test("Hachimi miner keeps evidenced names and rejects audited prose false positives", () => {
  const code = [
    "import json",
    "from colab.hachimi_text import mine_character_names_conservative as mine",
    "surnames={'李':'Lý','王':'Vương','陈':'Trần','周':'Chu','曾':'Tăng','简':'Giản','东':'Đông','厉':'Lệ','毕':'Tất','利':'Lợi','安':'An','包':'Bao','谢':'Tạ'}",
    "hanviet={**surnames,'初':'Sơ','一':'Nhất','俊':'Tuấn','辉':'Huy','雨':'Vũ'}",
    "source='我叫李初一。王俊辉说道。王俊辉问道。王俊辉喊道。全名陈雨。周围很安静。简单说道理。曾经发生。东西很多。厉害极了。毕竟如此。利用工具。安排工作。包括这些。谢谢你。'",
    "print(json.dumps(mine([source], surnames, hanviet), ensure_ascii=False))",
  ].join(";");
  const result = spawnSync("python", ["-B", "-c", code], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const glossary = JSON.parse(result.stdout);
  assert.deepEqual(glossary, {
    "李初一": "Lý Sơ Nhất",
    "陈雨": "Trần Vũ",
    "王俊辉": "Vương Tuấn Huy",
  });
  for (const falsePositive of ["周围", "简单", "曾经", "东西", "厉害", "毕竟", "利用", "安排", "包括", "谢谢"]) {
    assert.equal(glossary[falsePositive], undefined);
  }
});

test("Hachimi and Qwen share the review lock and Qwen no longer blocks on hachimi-active", () => {
  const fs = require("node:fs");
  const hachimi = fs.readFileSync(path.join(__dirname, "..", "scripts", "colab_standalone_worker.py"), "utf8");
  const qwen = fs.readFileSync(path.join(__dirname, "..", "colab", "qwen_qa_worker.py"), "utf8");
  assert.match(hachimi, /semantic-review\.lock\.json/);
  assert.match(hachimi, /latest_queue = r2_get_json\(review_queue_key\)/);
  assert.match(hachimi, /latest_index = r2_get_json\(index_key\)/);
  assert.doesNotMatch(qwen, /Hachimi đang dịch dở, chuyển sang queue tiếp theo/);
});
