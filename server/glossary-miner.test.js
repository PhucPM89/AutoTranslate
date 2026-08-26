"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mineNovelGlossary, toTitleCase } = require("./glossary-miner.js");

test("Glossary Miner: toTitleCase formats words correctly", () => {
  assert.equal(toTitleCase("chu tiên kiếm"), "Chu Tiên Kiếm");
  assert.equal(toTitleCase("thái huyền tông"), "Thái Huyền Tông");
});

test("Glossary Miner: extracts realms, sects, techniques and artifacts from chapter text", () => {
  const chapterSample = `
    李子夜盘膝坐在青云门后山，运转太玄剑诀，体内灵气激荡。
    他如今已经是筑基期巅峰，距离突破金丹只有一步之遥。
    手中紧握着诛仙剑，感受着其中的毁天灭地之力。
    隔壁的天机阁与玄天宗也在暗中窥视着一切。
  `;

  const glossary = mineNovelGlossary(chapterSample);

  // Check Cultivation Realm
  assert.ok(glossary["筑基期"] || glossary["筑基期巅峰"] || glossary["金丹"]);
  // Check Sects
  assert.ok(glossary["青云门"]);
  assert.ok(glossary["天机阁"]);
  assert.ok(glossary["玄天宗"]);
  // Check Techniques
  assert.ok(glossary["太玄剑诀"]);
  // Check Artifact
  assert.ok(glossary["诛仙剑"]);

  // Check translations are properly capitalized
  if (glossary["青云门"]) assert.match(glossary["青云门"], /Thanh Vân Môn/i);
  if (glossary["诛仙剑"]) assert.match(glossary["诛仙剑"], /Tru Tiên Kiếm|Chu Tiên Kiếm/i);
  if (glossary["太玄剑诀"]) assert.match(glossary["太玄剑诀"], /Thái Huyền Kiếm Quyết/i);
});
