"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  splitIntoSentences,
  splitSentenceIntoClauses,
  classifyClauseRole,
  analyzeClauseStructure,
  segmentParagraphToClauseIRs
} = require("./clause-segmenter");

test("Clause Segmenter: splits paragraph into sentences while protecting dialogue quotes", () => {
  const paragraph = `叶辰冷冷一笑：“今日便是你的死期！”言罢，他一步踏出。虚空震颤！`;
  const sentences = splitIntoSentences(paragraph);

  assert.equal(sentences.length, 3);
  assert.equal(sentences[0], `叶辰冷冷一笑：“今日便是你的死期！”`);
  assert.equal(sentences[1], `言罢，他一步踏出。`);
  assert.equal(sentences[2], `虚空震颤！`);
});

test("Clause Segmenter: splits sentence into semantic clauses", () => {
  const sentence = `叶辰拔出长剑，纵身跃起，一剑劈下！`;
  const clauses = splitSentenceIntoClauses(sentence);

  assert.equal(clauses.length, 3);
  assert.equal(clauses[0].text, "叶辰拔出长剑");
  assert.equal(clauses[1].text, "纵身跃起");
  assert.equal(clauses[2].text, "一剑劈下！");
});

test("Clause Segmenter: detects DIALOGUE role in quotes", () => {
  const quote = `“师傅，徒儿知错了。”`;
  const role = classifyClauseRole(quote);

  assert.equal(role, "DIALOGUE");
});

test("Clause Segmenter: detects INNER_THOUGHT role with mental verbs", () => {
  const thought = `他心中暗道：此人实力深不可测。`;
  const role = classifyClauseRole(thought);

  assert.equal(role, "INNER_THOUGHT");
});

test("Clause Segmenter: detects INCANTATION role for mantras", () => {
  const mantra = `急急如律令，九天雷动！`;
  const role = classifyClauseRole(mantra);

  assert.equal(role, "INCANTATION");
});

test("Clause Segmenter: detects Pro-Drop (Implicit Subject) in combat actions", () => {
  const structure = analyzeClauseStructure("纵身跃起一剑斩出", "ACTION");

  assert.equal(structure.tier, "SERIAL_ACTION");
  assert.equal(structure.isImplicitSubject, true);
  assert.equal(structure.hasSerialVerbs, true);
  assert.equal(structure.serialActions.length >= 2, true);
});

test("Clause Segmenter: detects Topic-Comment frames (话题-说明)", () => {
  const structure = analyzeClauseStructure("这家伙，心肠真黑", "EXPOSITION");

  assert.equal(structure.tier, "TOPIC_COMMENT");
  assert.equal(structure.isTopicComment, true);
  assert.equal(structure.topic, "这家伙");
  assert.equal(structure.comment, "心肠真黑");
});

test("Clause Segmenter: detects 4-character Idiomatic Units (四字成语)", () => {
  const structure = analyzeClauseStructure("风卷残云", "ACTION");

  assert.equal(structure.tier, "IDIOMATIC_CHUNK");
});

test("Clause Segmenter: full paragraph to ClauseIR conversion", () => {
  const para = `叶辰冷冷一笑：“今日你必死。”说完，拔剑纵身一斩。`;
  const irList = segmentParagraphToClauseIRs(para, { paraIndex: 1 });

  assert.ok(irList.length >= 3);
  assert.equal(irList[0].sourceZh, "叶辰冷冷一笑");
  assert.equal(irList[1].role, "DIALOGUE");
  assert.equal(irList[1].sourceZh, "“今日你必死。”");
  assert.ok(irList[irList.length - 1].actionSequence.length >= 2);
});
