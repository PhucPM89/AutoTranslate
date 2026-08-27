"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createSemanticOrchestrator } = require("./semantic-orchestrator");

test("Semantic Orchestrator: end-to-end translation of a complex multi-scene chapter", () => {
  const orchestrator = createSemanticOrchestrator({
    initialEntities: [
      { id: "char_diep_than", name: "Diệp Thần", gender: "MALE", role: "PROTAGONIST" },
      { id: "char_su_phu", name: "Lý Huyền Cơ", gender: "MALE", role: "MASTER" }
    ],
    initialDomains: { ZEN_TEA: 0.85 }
  });

  const rawChapter = `
两人相对而坐，品茶论道，心如止水。
“师傅，这茶真香。”
轰！一道惊天剑气爆发，轰然碎裂大门！
叶辰拔出长剑，纵身跃起，一剑斩出！
`.trim();

  const result = orchestrator.translateChapter(rawChapter);

  assert.ok(result.text.length > 0);
  assert.ok(result.traces.length >= 4);

  // Scene 1: Tea drinking should be preserved
  assert.ok(result.text.includes("thưởng trà đàm đạo") || result.text.includes("tâm tịnh tựa mặt nước hồ thu"));

  // Scene 2: Combat action should be punchy & active
  assert.ok(result.text.includes("rút trường kiếm ra") || result.text.includes("vung kiếm chém ra"));

  // Provenance traces
  assert.ok(result.traces[0].contextSnapshot);
  assert.ok(result.traces[result.traces.length - 1].stylistAudit);
});
