"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createStylistRouter } = require("./stylist-router");
const { createClauseIR, createSemanticSignature } = require("./contracts");
const { createSemanticOrchestrator } = require("./semantic-orchestrator");

test("Stylist Router & Provider Performance Benchmark", () => {
  const router = createStylistRouter();
  const orchestrator = createSemanticOrchestrator({
    baseConvertFunction: (raw) => raw
  });

  const testClauses = [
    createClauseIR({
      id: "bm_1",
      sourceZh: "叶辰一拳轰出，倒飞出去",
      role: "ACTION",
      semanticSignature: createSemanticSignature({ affectDistribution: { WRATH: 0.8 }, intensity: 0.9 })
    }),
    createClauseIR({
      id: "bm_2",
      sourceZh: "他拔剑出鞘，一剑斩出，剑气纵横",
      role: "ACTION",
      semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.9 }, intensity: 0.85 })
    }),
    createClauseIR({
      id: "bm_3",
      sourceZh: "二人烹茶论道，茶香四溢，心如止水",
      role: "DESCRIPTION",
      semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.95 }, intensity: 0.4 })
    }),
    createClauseIR({
      id: "bm_4",
      sourceZh: "他坐在战场边品茶，拔剑斩去",
      role: "ACTION",
      semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.6, TRANQUIL: 0.6 }, intensity: 0.6 })
    })
  ];

  const contexts = [
    { primaryDomain: "COMBAT", domainWeights: { COMBAT: 0.9, SWORD_DAO: 0.5 } },
    { primaryDomain: "SWORD_DAO", domainWeights: { SWORD_DAO: 0.95, COMBAT: 0.8 } },
    { primaryDomain: "ZEN_TEA", domainWeights: { ZEN_TEA: 0.9 } },
    { primaryDomain: "NEUTRAL", domainWeights: { COMBAT: 0.45, ZEN_TEA: 0.45, SWORD_DAO: 0.45 } }
  ];

  const iterations = 1000;

  // 1. Measure Router + Providers + Aggregation Latency
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    for (let k = 0; k < testClauses.length; k++) {
      router.route(testClauses[k], contexts[k]);
    }
  }
  const t1 = process.hrtime.bigint();
  const routerElapsedMs = Number(t1 - t0) / 1e6;
  const routerThroughput = Number(((iterations * testClauses.length) / (routerElapsedMs / 1000)).toFixed(1));
  const routerAvgLatencyMicros = Number(((Number(t1 - t0) / (iterations * testClauses.length)) / 1000).toFixed(2));

  // 2. Measure Shadow Mode Orchestrator Latency
  const t2 = process.hrtime.bigint();
  for (let i = 0; i < 200; i++) {
    orchestrator.translateShadow("他拔剑出鞘，一剑斩出。二人烹茶论道。");
  }
  const t3 = process.hrtime.bigint();
  const shadowElapsedMs = Number(t3 - t2) / 1e6;
  const shadowThroughput = Number(((200) / (shadowElapsedMs / 1000)).toFixed(1));

  console.log("=== STYLIST PHASE 2A BENCHMARK RESULTS ===");
  console.log(`Router + Providers + Aggregation Throughput: ${routerThroughput} clauses/sec`);
  console.log(`Router Average Latency: ${routerAvgLatencyMicros} µs`);
  console.log(`Shadow Mode Full Pipeline Throughput: ${shadowThroughput} chapters/sec`);
  console.log(`Shadow Mode Elapsed: ${shadowElapsedMs.toFixed(2)} ms for 200 chapters`);
  console.log("==========================================");

  assert.ok(routerThroughput > 10000);
  assert.ok(routerAvgLatencyMicros < 100);
});
