"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createSemanticAnalyzer } = require("./semantic-analyzer");

test("Semantic Analyzer: end-to-end multi-paragraph chapter analysis", () => {
  const analyzer = createSemanticAnalyzer({
    initialEntities: [
      { id: "char_diep_than", name: "Diệp Thần", gender: "MALE", role: "PROTAGONIST" },
      { id: "char_su_phu", name: "Lý Huyền Cơ", gender: "MALE", role: "MASTER" }
    ],
    initialDomains: { ZEN_TEA: 0.80 }
  });

  const chapter = `
两人相对而坐，品茶论道，心如止水。
“师傅，这茶真香。”
轰！一道惊天剑气爆发，轰然碎裂大门！
叶辰拔剑纵身跃起，一剑斩出！
`.trim();

  const analyzed = analyzer.analyzeChapter(chapter);

  assert.equal(analyzed.paragraphs.length, 4);
  assert.ok(analyzed.totalClauses >= 5);

  // Para 0: Zen Tea scene clauses
  const para0 = analyzed.paragraphs[0];
  assert.equal(para0.clauses[0].sourceZh, "两人相对而坐");
  assert.ok(para0.clauses.length >= 2);

  // Para 1: Dialogue
  const para1 = analyzed.paragraphs[1];
  assert.equal(para1.clauses[0].role, "DIALOGUE");

  // Para 2: Combat shock transition
  const para2 = analyzed.paragraphs[2];
  assert.equal(para2.contextSnapshot.lastShockDecision.isShock, true);

  // Para 3: Pro-drop & Serial action
  const para3 = analyzed.paragraphs[3];
  assert.ok(para3.clauses.some((c) => c.actionSequence.length >= 2));

  // Provenance logs generated for all clauses
  const logs = analyzer.getProvenanceLog();
  assert.equal(logs.length, analyzed.totalClauses);
  assert.ok(logs[0].clauseId);
  assert.ok(logs[0].timestamp);
});
