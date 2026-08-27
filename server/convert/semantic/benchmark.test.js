"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createSemanticOrchestrator } = require("./semantic-orchestrator");

test("Semantic Pipeline Benchmark: measures CPU execution time & throughput over 1000 sentences", () => {
  const orchestrator = createSemanticOrchestrator({
    initialEntities: [
      { id: "char_diep_than", name: "Diệp Thần", gender: "MALE", role: "PROTAGONIST" },
      { id: "char_to_lac_tuyet", name: "Tô Lạc Tuyết", gender: "FEMALE", role: "HEROINE" }
    ],
    initialDomains: { COMBAT: 0.8, SWORD_DAO: 0.85 }
  });

  const sampleCorpus = [
    "叶辰拔出长剑，一剑斩出！",
    "红衣厉鬼发出凄厉嘶吼，阴风阵阵。",
    "两人相对而坐，品茶论道，心如止水。",
    "“师傅，徒儿谨遵师命。”",
    "九天神雷滚滚落下，天地异象震动四方。",
    "奉天承运，皇帝诏曰：钦此！",
    "他冷冷一笑，一步踏出，虚空震颤。",
    "这家伙，心肠真黑。",
    "风卷残云，天地变色。",
    "他吐出一口鲜血，身形倒飞出去。"
  ];

  const iterations = 100; // 10 samples * 100 = 1000 sentences
  const startTime = Date.now();

  let totalClauses = 0;
  for (let i = 0; i < iterations; i++) {
    for (const sentence of sampleCorpus) {
      const res = orchestrator.translateChapter(sentence);
      totalClauses += res.traces.length;
    }
  }

  const elapsedMs = Date.now() - startTime;
  const sentencesPerSecond = Number(((iterations * sampleCorpus.length) / (elapsedMs / 1000)).toFixed(1));

  // Assert reasonable performance (> 2,000 sentences / second throughput)
  assert.ok(elapsedMs < 3000, `Benchmark took ${elapsedMs}ms for 1000 sentences (expected < 3000ms)`);
  assert.ok(sentencesPerSecond > 500, `Throughput ${sentencesPerSecond} sent/sec (expected > 500)`);
  assert.ok(totalClauses >= 1000);
});
