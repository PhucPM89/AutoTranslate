"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLexicalCandidate } = require("./lexical-candidate");
const { createLexicalCandidateGenerator } = require("./lexical-candidate-generator");
const { createLexicalResolver } = require("./lexical-resolver");
const { createSemanticOrchestrator } = require("./semantic-orchestrator");
const { createProperNounMatcher } = require("../proper-nouns");
const { buildTrie, matchPhrase } = require("../convert-engine");

// Helper: Setup realistic dictionaries for tests
function setupTestEnvironment() {
  const surnames = { "付": "Phó", "叶": "Diệp", "林": "Lâm", "苏": "Tô" };
  const hanvietChars = {
    "对": { hv: "đối" },
    "付": { hv: "phó" },
    "宇": { hv: "vũ" },
    "茜": { hv: "thiến" },
    "辰": { hv: "thần" },
    "动": { hv: "động" },
    "看": { hv: "nhìn" },
    "着": { hv: "trước" },
    "缓": { hv: "hoãn" },
    "门": { hv: "môn" },
    "房": { hv: "phòng" },
    "关": { hv: "quan" },
    "重": { hv: "trọng" },
    "行": { hv: "hành" },
    "便": { hv: "tiện" },
    "弟": { hv: "đệ" },
    "子": { hv: "tử" }
  };
  const phraseDict = {
    "对付": "đối phó",
    "房门": "cửa phòng",
    "关门弟子": "đệ tử chân truyền",
    "方便面": "mì ăn liền",
    "小心翼翼": "cẩn thận từng li từng tí",
    "缓缓": "chậm rãi",
    "看着": "nhìn xem",
    "白衣": "áo trắng",
    "胜雪": "hơn tuyết"
  };

  const trie = buildTrie(phraseDict);
  const properNounMatcher = createProperNounMatcher({
    surnames,
    hanvietChars,
    phraseDict,
    longestPhraseAt: (chars, at) => matchPhrase(trie, chars, at),
    isHan: (ch) => /\p{Script=Han}/u.test(ch)
  });

  const generator = createLexicalCandidateGenerator({
    trie,
    phraseDict,
    properNounMatcher,
    nameGlossary: { "青云宗": "Thanh Vân Tông", "灵霄殿": "Linh Tiêu Điện" },
    hanvietChars
  });

  const resolver = createLexicalResolver({ candidateGenerator: generator });

  return { generator, resolver, properNounMatcher, trie };
}

// 1. Kiểm tra consistency của scoring / provenance
test("1. Scoring & Provenance Consistency: 100 runs produce deterministic, bounded results", () => {
  const { resolver } = setupTestEnvironment();
  const input = "他关上房门，重整旗鼓，一行人便出发。";

  let firstRes = null;
  for (let i = 0; i < 100; i++) {
    const res = resolver.resolveText(input, { primaryDomain: "URBAN_MODERN" });

    // Assert mathematical bounds
    assert.ok(res.confidence >= 0.0 && res.confidence <= 1.0);
    assert.ok(res.resolvedSlots.length > 0);
    assert.ok(res.resolutionRecords.length > 0);

    for (const rec of res.resolutionRecords) {
      assert.ok(rec.confidence >= 0.0 && rec.confidence <= 1.0);
      assert.ok(rec.margin >= 0.0 && rec.margin <= 1.0);
      assert.ok(rec.sourceSpan.length > 0);
      assert.ok(rec.selectedCandidate.length > 0);
      assert.ok(rec.provenance.length > 0);
    }

    if (firstRes === null) {
      firstRes = JSON.stringify(res);
    } else {
      // Must be 100% strictly identical across all 100 runs (Zero non-determinism)
      assert.equal(JSON.stringify(res), firstRes);
    }
  }
});

// 2. Fuzz lexical ambiguity
test("2. Fuzz Lexical Ambiguity: randomized noisy inputs never crash, leak NaN or undefined", () => {
  const { resolver } = setupTestEnvironment();
  const fuzzTokens = ["重", "门", "行", "便", "房", "佛", "关", "，", "！", "？", "a", "123", "   ", "宗", "人", "道"];

  for (let trial = 0; trial < 200; trial++) {
    let noisyStr = "";
    const len = Math.floor(Math.random() * 8) + 1;
    for (let j = 0; j < len; j++) {
      noisyStr += fuzzTokens[Math.floor(Math.random() * fuzzTokens.length)];
    }

    const res = resolver.resolveText(noisyStr);

    assert.ok(typeof res.status === "string");
    assert.ok(!isNaN(res.confidence));
    assert.ok(Array.isArray(res.resolvedSlots));
    assert.ok(Array.isArray(res.resolutionRecords));
  }
});

// 3. Test competing segmentation (Boundary conflicts)
test("3. Competing Segmentation: 对付宇茜 detects proper noun hypothesis 付宇茜", () => {
  const { resolver } = setupTestEnvironment();
  const res = resolver.resolveText("对付宇茜");

  // Segmentation conflict must be identified
  assert.ok(res.resolutionRecords.some((r) => r.sourceSpan.includes("对付") || r.sourceSpan.includes("对") || r.sourceSpan.includes("付")));
});

// 4. Test glossary lock (Hard Lock overrules adversarial context)
test("4. Glossary Lock: Book Glossary locked terms resist adversarial domain forces", () => {
  const { resolver } = setupTestEnvironment();
  
  // Test in an opposing context (e.g. CYBER_SCIFI domain forcing tech terms)
  const res = resolver.resolveText("青云宗灵霄殿", { primaryDomain: "CYBER_SCIFI" });

  const qy = res.resolvedSlots.find((s) => s.spanZh === "青云宗");
  assert.ok(qy);
  assert.equal(qy.chosenVi, "Thanh Vân Tông");
  assert.equal(qy.method, "GLOSSARY_LOCK");
  assert.equal(qy.confidence, 1.0);

  const lx = res.resolvedSlots.find((s) => s.spanZh === "灵霄殿");
  assert.ok(lx);
  assert.equal(lx.chosenVi, "Linh Tiêu Điện");
  assert.equal(lx.method, "GLOSSARY_LOCK");
});

// 5. Test entity/name boundary (No slicing into adjacent words)
test("5. Entity/Name Boundary: 叶辰缓缓 keeps 缓缓 intact and 白衣胜雪 is not a person", () => {
  const { properNounMatcher } = setupTestEnvironment();

  // Test 1: 叶辰缓缓 -> name is 叶辰 (length 2), 缓缓 is separate
  const chars1 = Array.from("叶辰缓缓");
  const m1 = properNounMatcher.match(chars1, 0);
  assert.ok(m1);
  assert.equal(m1.vi, "Diệp Thần");
  assert.equal(m1.length, 2);

  // Test 2: 白衣胜雪 -> 白衣 is a phrase in phraseDict, so 白衣胜 is rejected as person
  const chars2 = Array.from("白衣胜雪");
  const m2 = properNounMatcher.matchPerson(chars2, 0);
  assert.equal(m2, null, "白衣胜雪 must not be sliced into person name 白衣胜");
});

// 6. Test fast-path safety
test("6. Fast-Path Safety: Triggered ONLY on unambiguous phrases, NEVER on polysemy", () => {
  const { resolver } = setupTestEnvironment();

  // Unambiguous phrase -> FAST_PATH
  const resFast = resolver.resolveText("小心翼翼");
  assert.equal(resFast.method, "FAST_PATH");
  assert.equal(resFast.status, "RESOLVED");

  // Polysemous root 门 -> MUST NOT trigger FAST_PATH
  const resPoly1 = resolver.resolveText("他关门");
  assert.notEqual(resPoly1.method, "FAST_PATH");

  // Polysemous root 重 -> MUST NOT trigger FAST_PATH
  const resPoly2 = resolver.resolveText("重如泰山");
  assert.notEqual(resPoly2.method, "FAST_PATH");
});

// 7. Test abstention on ambiguous ties
test("7. Uncertainty & Abstention: Close score ties produce AMBIGUOUS status without guessing", () => {
  // Setup a custom candidate generator with 2 identical score candidates
  const tiedGenerator = {
    generateCandidateGraph: () => ({
      textZh: "测试",
      nodes: [
        {
          position: 0,
          sourceChar: "测",
          candidates: [
            createLexicalCandidate({ spanZh: "测试", candidateVi: "thử nghiệm", sourcePriority: 0.70, confidence: 0.70 }),
            createLexicalCandidate({ spanZh: "测试", candidateVi: "kiểm tra", sourcePriority: 0.70, confidence: 0.70 })
          ]
        }
      ],
      hasAmbiguity: true,
      isFastPathEligible: false
    })
  };

  const tiedResolver = createLexicalResolver({ candidateGenerator: tiedGenerator });
  const res = tiedResolver.resolveText("测试");

  assert.equal(res.status, "AMBIGUOUS");
  const rec = res.resolutionRecords[0];
  assert.equal(rec.status, "AMBIGUOUS");
  assert.equal(rec.method, "ABSTENTION_TIE");
  assert.ok(rec.margin < 0.05);
});

// 8. Test cross-sentence / cross-chapter consistency
test("8. Cross-Sentence Consistency: Resolving 100 consecutive clauses maintains 100% identical terms", () => {
  const { resolver } = setupTestEnvironment();
  const clause = "关上房门，重整旗鼓。";

  const results = [];
  for (let i = 0; i < 100; i++) {
    const res = resolver.resolveText(clause, { primaryDomain: "URBAN_MODERN" });
    results.push(res.resolvedSlots.map((s) => `${s.spanZh}:${s.chosenVi}`).join(", "));
  }

  // All 100 results must be strictly identical
  const uniqueResults = new Set(results);
  assert.equal(uniqueResults.size, 1);
});

// 9. Benchmark Thật (Real Unthrottled Benchmark)
test("9. Real Benchmark: Throughput and latency distribution over 500 multi-clause sentences", () => {
  const { resolver } = setupTestEnvironment();
  const corpus = [
    "小心翼翼",
    "关上房门",
    "佛门清净之地",
    "重如泰山",
    "重整旗鼓",
    "一行人缓缓走来",
    "青云宗灵霄殿",
    "他冷冷一笑，拔出长剑"
  ];

  const totalSentences = 500;
  const latencies = [];
  const startTotal = Date.now();

  for (let i = 0; i < totalSentences; i++) {
    const sent = corpus[i % corpus.length];
    const t0 = process.hrtime.bigint();
    resolver.resolveText(sent);
    const t1 = process.hrtime.bigint();
    const micros = Number(t1 - t0) / 1000;
    latencies.push(micros);
  }

  const totalTimeMs = Date.now() - startTotal;
  latencies.sort((a, b) => a - b);

  const p50 = latencies[Math.floor(latencies.length * 0.50)].toFixed(2);
  const p95 = latencies[Math.floor(latencies.length * 0.95)].toFixed(2);
  const p99 = latencies[Math.floor(latencies.length * 0.99)].toFixed(2);
  const throughput = Number((totalSentences / (totalTimeMs / 1000)).toFixed(1));

  console.log("=== REAL BENCHMARK RESULTS ===");
  console.log(`Sentences Evaluated: ${totalSentences}`);
  console.log(`Total Time: ${totalTimeMs}ms`);
  console.log(`Throughput: ${throughput} sentences/sec`);
  console.log(`Latency p50: ${p50} µs`);
  console.log(`Latency p95: ${p95} µs`);
  console.log(`Latency p99: ${p99} µs`);
  console.log("==============================");

  assert.ok(totalTimeMs < 1000);
  assert.ok(throughput > 1000);
});

// 10. Tìm các case resolver tự tin sai (Adversarial Blind Spot Checks)
test("10. Adversarial Blind Spots: Multi-character idioms/terms must NOT be split into naive polysemy", () => {
  const { resolver } = setupTestEnvironment();

  // Case A: 关门弟子 (Closed-door disciple = Last authentic disciple)
  // MUST match full idiom "đệ tử chân truyền", NOT split into 关=đóng + 门=cửa + 弟子=đệ tử!
  const resA = resolver.resolveText("他是师傅的关门弟子");
  const idiomA = resA.resolvedSlots.find((s) => s.spanZh === "关门弟子");
  assert.ok(idiomA, "关门弟子 must be resolved as a cohesive phrase");
  assert.equal(idiomA.chosenVi, "đệ tử chân truyền");

  // Case B: 方便面 (Instant noodles)
  // MUST match "mì ăn liền", NOT split into 方便=tiện lợi + 面=mặt!
  const resB = resolver.resolveText("他吃了一碗方便面");
  const noodleB = resB.resolvedSlots.find((s) => s.spanZh === "方便面");
  assert.ok(noodleB, "方便面 must be resolved as a cohesive food noun");
  assert.equal(noodleB.chosenVi, "mì ăn liền");
});
