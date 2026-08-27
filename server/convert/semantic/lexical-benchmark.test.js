"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLexicalResolver } = require("./lexical-resolver");
const { createSemanticOrchestrator } = require("./semantic-orchestrator");

test("Lexical Resolution Benchmark: compares Fast Path vs Disambiguation Path vs Shadow Mode", () => {
  const resolver = createLexicalResolver();
  const orchestrator = createSemanticOrchestrator({
    baseConvertFunction: (raw) => raw
  });

  const fastPathCorpus = [
    "小心翼翼",
    "风卷残云",
    "万籁俱寂",
    "落落大方",
    "浩浩荡荡"
  ];

  const ambiguousCorpus = [
    "关上房门",
    "佛门清净",
    "重如泰山",
    "重整旗鼓",
    "一行人缓缓走来"
  ];

  const iterations = 500;

  // 1. Fast Path Benchmark
  const t0 = Date.now();
  for (let i = 0; i < iterations; i++) {
    for (const sent of fastPathCorpus) {
      const res = resolver.resolveText(sent);
      assert.equal(res.method, "FAST_PATH");
    }
  }
  const fastElapsed = Date.now() - t0;
  const fastThroughput = Number(((iterations * fastPathCorpus.length) / (fastElapsed / 1000)).toFixed(1));

  // 2. Disambiguation Path Benchmark
  const t1 = Date.now();
  for (let i = 0; i < iterations; i++) {
    for (const sent of ambiguousCorpus) {
      const res = resolver.resolveText(sent);
      assert.equal(res.method, "CONTEXTUAL_DISAMBIGUATION");
    }
  }
  const ambElapsed = Date.now() - t1;
  const ambThroughput = Number(((iterations * ambiguousCorpus.length) / (ambElapsed / 1000)).toFixed(1));

  // 3. Shadow Mode Benchmark (Full Pipeline with deep lexical analysis)
  const t2 = Date.now();
  for (let i = 0; i < 100; i++) {
    for (const sent of ambiguousCorpus) {
      const res = orchestrator.translateShadow(sent);
      assert.ok(res.lexicalResolutionAnalysis);
    }
  }
  const shadowElapsed = Date.now() - t2;
  const shadowThroughput = Number(((100 * ambiguousCorpus.length) / (shadowElapsed / 1000)).toFixed(1));

  console.log("=== LEXICAL BENCHMARK METRICS ===");
  console.log(`Fast Path: ${fastElapsed}ms (${fastThroughput} sentences/sec)`);
  console.log(`Disambiguation Path: ${ambElapsed}ms (${ambThroughput} sentences/sec)`);
  console.log(`Shadow Mode Pipeline: ${shadowElapsed}ms (${shadowThroughput} sentences/sec)`);
  console.log("=================================");

  assert.ok(fastElapsed < 500);
  assert.ok(ambElapsed < 1000);
  assert.ok(fastThroughput > 5000);
});
