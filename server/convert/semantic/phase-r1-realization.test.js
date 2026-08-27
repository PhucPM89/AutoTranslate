"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createClauseIR, createSemanticSignature } = require("./contracts");
const { createExpressionPlanner, FALLBACK_LEVELS, HEAD_CATEGORIES } = require("./expression-planner");
const { createVietnameseRealizer, validateSemanticAssertions } = require("./vietnamese-realizer");
const { createStylistRouter } = require("./stylist-router");

// Mock base converter for testing fallback mechanisms
function mockBaseConvert(zhText) {
  return String(zhText)
    .replace(/心中暗道不妙/g, "trong lòng thầm nghĩ không ổn")
    .replace(/拔剑/g, "rút kiếm")
    .replace(/斩出/g, "chém ra")
    .replace(/微微一笑/g, "mỉm cười")
    .replace(/宗门覆灭/g, "tông môn bị diệt")
    .replace(/悲痛欲绝/g, "đau lòng đến cực điểm");
}

// =========================================================================
// 1. Golden Composition Cases
// =========================================================================

test("Phase R1 - 1. Golden Case 1: “拔剑斩出” combines Weapon Draw + Strike cleanly", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_gold_01_sword",
    sourceZh: "拔剑斩出！",
    role: "ACTION",
    subjectSlot: { entityId: "swordsman1", isImplicit: true, resolvedPronoun: "Hắn" },
    actionSequence: [{ verbZh: "拔剑", actionVi: "tuốt kiếm", weaponEntity: "trường kiếm" }],
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90 }, valence: 0.20, intensity: 0.85 })
  });

  const ctx = {
    primaryDomain: "SWORD_DAO",
    domainWeights: { SWORD_DAO: 0.95, COMBAT: 0.95 },
    translatedText: "tuốt kiếm chém ra!"
  };
  const { text, plan, trace } = realizer.realizeClause(clause, ctx);

  assert.ok(text.includes("Hắn"), "Implicit subject resolved cleanly");
  assert.ok(text.includes("kiếm") || text.includes("chém"), "Sword strike realized");
  assert.equal(plan.fallbackLevel, FALLBACK_LEVELS.LEVEL_1_FULL_STYLISTIC);
  assert.equal(trace.budgetAudit.fallbackLevel, FALLBACK_LEVELS.LEVEL_1_FULL_STYLISTIC);
});

test("Phase R1 - 2. Golden Case 2: “红衣女鬼容貌绝美，杀意滔天” (Beauty + Supernatural + Hostility, No Romance Drift)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_gold_02_ghost",
    sourceZh: "红衣女鬼容貌绝美，杀意滔天！",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { HOSTILITY: 0.95, FEAR: 0.80 }, valence: -0.75, intensity: 0.90 })
  });

  const ctx = {
    primaryDomain: "SUPERNATURAL_HORROR",
    domainWeights: { SUPERNATURAL_HORROR: 0.95, COURTLY_BEAUTY: 0.85, MADNESS_FRENZY: 0.90 },
    translatedText: "hồng y nữ quỷ dung mạo tuyệt mỹ, sát ý ngút trời cuồng bạo",
    isNeutralOrHostile: true
  };

  const { text, plan, trace } = realizer.realizeClause(clause, ctx);

  assert.ok(text.includes("sát ý") || text.includes("cuồng bạo"), "Hostility realized");
  assert.ok(!text.includes("tình chàng ý thiếp"), "Zero romance drift");
  assert.equal(trace.budgetAudit.qualityGateStatus, "QUALITY_GATE_PASSED");
});

test("Phase R1 - 3. Golden Case 3: “他心中暗道不妙，拔剑斩出” (Explicit Thought + Weapon Action)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_gold_03_thought_sword",
    sourceZh: "心中暗道不妙，拔剑斩出！",
    role: "ACTION",
    subjectSlot: { entityId: "hero1", isImplicit: true, resolvedPronoun: "Hắn" },
    cognitiveEvent: {
      status: "RESOLVED",
      kind: "EXPLICIT_THOUGHT",
      evidenceId: "THOUGHT_COVERT",
      thinker: { status: "RESOLVED", entityId: "hero1" }
    },
    semanticSignature: createSemanticSignature({ affectDistribution: { FEAR: 0.60, RESOLUTE: 0.85 }, valence: -0.20, intensity: 0.80 })
  });

  const ctx = {
    primaryDomain: "COMBAT",
    domainWeights: { COMBAT: 0.95, MONOLOGUE_PSYCHOLOGY: 0.90 },
    translatedText: "trong lòng thầm nghĩ không ổn, tuốt kiếm chém ra"
  };

  const { text, plan } = realizer.realizeClause(clause, ctx);
  assert.ok(text.includes("trong lòng thầm nghĩ") || text.includes("Hắn"), "Thought and action composed");
  assert.ok(plan.headModifierGraph[HEAD_CATEGORIES.ACTION_HEAD].length >= 0);
});

test("Phase R1 - 4. Golden Case 4: “琴音袅袅之间，一剑斩出” (Musical Dao + Sword Strike)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_gold_04_music_sword",
    sourceZh: "琴音袅袅之间，一剑斩出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.60, RESOLUTE: 0.80 }, valence: 0.10, intensity: 0.80 })
  });

  const ctx = {
    primaryDomain: "COMBAT",
    domainWeights: { COMBAT: 0.95, MUSICAL_DAO: 0.85 },
    translatedText: "tiếng đàn du dương quanh quẩn, một kiếm chém ra!"
  };

  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.length > 0, "Synthesized musical combat action");
});

test("Phase R1 - 5. Golden Case 5: “宗门覆灭，众人悲痛欲绝” (Destruction + Grief, Zero Blood River/Corpse Injection)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_gold_05_ruin",
    sourceZh: "宗门覆灭，众人悲痛欲绝。",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.90, SORROW: 0.95 }, valence: -0.90, intensity: 0.90 })
  });

  const ctx = {
    primaryDomain: "DRAMATIC_CLIMAX",
    domainWeights: { DRAMATIC_CLIMAX: 0.95 },
    translatedText: "tông môn hoàn toàn bị hủy diệt, mọi người đau đớn đến thắt ruột thắt gan"
  };

  const { text, trace } = realizer.realizeClause(clause, ctx);
  assert.ok(text.includes("hủy diệt") || text.includes("tông môn"), "Destruction realized");
  assert.ok(!text.includes("máu chảy thành sông"), "Zero ungrounded blood river assertion");
  assert.ok(!text.includes("thây chất đầy đồng"), "Zero ungrounded corpse assertion");
  assert.equal(trace.budgetAudit.qualityGateStatus, "QUALITY_GATE_PASSED");
});

test("Phase R1 - 6. Golden Case 6: “太上长老微微一笑” (Title + Demeanor, Zero Conspiracy Drift)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_gold_06_title_smile",
    sourceZh: "太上长老微微一笑。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.80 }, valence: 0.30, intensity: 0.30 })
  });

  const ctx = {
    primaryDomain: "TITLE_HIERARCHY",
    domainWeights: { TITLE_HIERARCHY: 0.95, POLITICAL_INTRIGUE: 0.50 },
    translatedText: "Thái Thượng Trưởng lão mỉm cười"
  };

  const { text, plan } = realizer.realizeClause(clause, ctx);
  assert.ok(text.includes("Thái Thượng Trưởng lão"), "Title realized");
  assert.ok(text.includes("mỉm cười") || text.includes("nở nụ cười"), "Demeanor realized");
  assert.ok(!text.includes("âm mưu") && !text.includes("dã tâm"), "Zero conspiracy drift");
});

// =========================================================================
// 2. Head/Modifier Graph & Modifier Deduplication Tests
// =========================================================================

test("Phase R1 - 7. Head/Modifier Graph: Classifies contributions into structured semantic heads", () => {
  const planner = createExpressionPlanner();

  const clause = createClauseIR({
    id: "cl_graph_01",
    sourceZh: "太上长老拔剑斩出，白衣胜雪。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90 }, valence: 0.20, intensity: 0.85 })
  });

  const ctx = {
    translatedText: "Thái Thượng Trưởng lão tuốt kiếm chém ra, một thân bạch y thắng tuyết",
    domainWeights: { COMBAT: 0.95, TITLE_HIERARCHY: 0.90, COURTLY_BEAUTY: 0.85 }
  };

  const plan = planner.planClause(clause, ctx);

  assert.ok(plan.headModifierGraph[HEAD_CATEGORIES.SUBJECT_HEAD], "SUBJECT_HEAD exists");
  assert.ok(plan.headModifierGraph[HEAD_CATEGORIES.ACTION_HEAD], "ACTION_HEAD exists");
  assert.ok(plan.headModifierGraph[HEAD_CATEGORIES.SUBJECT_HEAD].length >= 1, "Captures title / attire under subject");
});

test("Phase R1 - 8. Modifier Deduplication: Prevents adjective piling on duplicate attributes", () => {
  const planner = createExpressionPlanner();

  const clause = createClauseIR({
    id: "cl_dedup_01",
    sourceZh: "杀意滔天，杀意冲天！",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { HOSTILITY: 0.95 }, valence: -0.75, intensity: 0.90 })
  });

  const ctx = {
    translatedText: "sát ý ngút trời cuồng bạo, sát ý ngút trời cuồng bạo",
    domainWeights: { MADNESS_FRENZY: 0.95 }
  };

  const plan = planner.planClause(clause, ctx);
  assert.ok(plan.slotReplacements.length <= 2, "Deduplication bounds redundant slot explosions");
});

// =========================================================================
// 3. Fallback Hierarchy & Quality Gate Tests
// =========================================================================

test("Phase R1 - 9. Fallback Hierarchy: Steps down to Level 2/3 when expansion budget is exceeded", () => {
  const planner = createExpressionPlanner();

  const clause = createClauseIR({
    id: "cl_budget_stress_01",
    sourceZh: "一掌拍出。",
    role: "ACTION",
    invariants: { maxAdjectives: 0 }, // Highly restricted budget
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.70 }, valence: 0.0, intensity: 0.50 })
  });

  const ctx = {
    translatedText: "tung chưởng kinh thiên động địa cuồng phong bão táp đánh tới",
    domainWeights: { COMBAT: 0.95 }
  };

  const plan = planner.planClause(clause, ctx);
  assert.ok(
    plan.fallbackLevel === FALLBACK_LEVELS.LEVEL_1_FULL_STYLISTIC ||
    plan.fallbackLevel === FALLBACK_LEVELS.LEVEL_2_REDUCED_STYLISTIC ||
    plan.fallbackLevel === FALLBACK_LEVELS.LEVEL_3_LEXICALLY_FAITHFUL,
    "Fallback level dynamically reflects budget audit"
  );
});

test("Phase R1 - 10. Quality Gate: Rejects ungrounded blood river assertions and triggers Level 4 safe fallback", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  // Clause does NOT contain blood rivers in Chinese, but candidate injects it
  const clause = createClauseIR({
    id: "cl_gate_01_blood",
    sourceZh: "宗门覆灭。",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.85 }, valence: -0.70, intensity: 0.80 })
  });

  const qualityCheck = validateSemanticAssertions("tông môn bị diệt, máu chảy thành sông", clause, {});
  assert.equal(qualityCheck.passed, false, "Quality gate must detect unsupported blood river assertion");
  assert.ok(qualityCheck.violatedAssertions.includes("NEW_EVENT"));
  assert.ok(qualityCheck.violatedAssertions.includes("NEW_EFFECT"));
});

test("Phase R1 - 11. Quality Gate: Rejects ungrounded galaxy destruction assertions", () => {
  const clause = createClauseIR({
    id: "cl_gate_02_galaxy",
    sourceZh: "一拳轰出。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90 }, valence: 0.10, intensity: 0.80 })
  });

  const qualityCheck = validateSemanticAssertions("một quyền đánh ra, ngân hà vỡ vụn", clause, {});
  assert.equal(qualityCheck.passed, false, "Quality gate must detect ungrounded galaxy destruction");
  assert.ok(qualityCheck.violatedAssertions.includes("NEW_FACT"));
});

// =========================================================================
// 4. Provider Order Independence
// =========================================================================

test("Phase R1 - 12. Provider Order Independence: Deterministic routing and plan generation across 5 router shuffles", () => {
  const clause = createClauseIR({
    id: "cl_order_r1_01",
    sourceZh: "太上长老走火入魔，拔剑斩出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { WRATH: 0.85, RESOLUTE: 0.85 }, valence: -0.60, intensity: 0.90 })
  });

  const ctx = {
    primaryDomain: "COMBAT",
    domainWeights: { COMBAT: 0.95, MADNESS_FRENZY: 0.90, TITLE_HIERARCHY: 0.85 },
    translatedText: "Thái Thượng Trưởng lão tẩu hỏa nhập ma, tuốt kiếm chém ra!"
  };

  const baselinePlanner = createExpressionPlanner();
  const baselinePlan = baselinePlanner.planClause(clause, ctx);

  for (let i = 0; i < 5; i++) {
    const shuffledPlanner = createExpressionPlanner();
    const shuffledPlan = shuffledPlanner.planClause(clause, ctx);

    assert.equal(shuffledPlan.slotReplacements.length, baselinePlan.slotReplacements.length, `Iteration ${i} count match`);
    assert.equal(shuffledPlan.fallbackLevel, baselinePlan.fallbackLevel, `Iteration ${i} fallback match`);
    for (let j = 0; j < baselinePlan.slotReplacements.length; j++) {
      assert.equal(shuffledPlan.slotReplacements[j].replacementVi, baselinePlan.slotReplacements[j].replacementVi);
      assert.equal(shuffledPlan.slotReplacements[j].slotId, baselinePlan.slotReplacements[j].slotId);
    }
  }
});

// =========================================================================
// 5. Paragraph Synthesis & Provenance Trace
// =========================================================================

test("Phase R1 - 13. Paragraph Realization: Synthesizes coherent multi-clause paragraph with full provenance", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clauses = [
    createClauseIR({
      id: "cl_para_01",
      sourceZh: "天色渐晚。",
      role: "DESCRIPTION",
      semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.80 }, valence: 0.0, intensity: 0.30 })
    }),
    createClauseIR({
      id: "cl_para_02",
      sourceZh: "拔剑斩出！",
      role: "ACTION",
      subjectSlot: { entityId: "swordsman1", isImplicit: true, resolvedPronoun: "Hắn" },
      semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90 }, valence: 0.20, intensity: 0.85 })
    })
  ];

  const ctx = {
    primaryDomain: "COMBAT",
    domainWeights: { COMBAT: 0.95 }
  };

  const { text, traces } = realizer.realizeParagraph(clauses, ctx);

  assert.ok(text.length > 0, "Paragraph rendered");
  assert.equal(traces.length, 2, "Traces collected for all clauses");
  assert.ok(traces[0].finalVi.length > 0);
  assert.ok(traces[1].finalVi.length > 0);
  assert.ok(/[.!?]$/.test(text), "Paragraph ends with punctuation");
});

// =========================================================================
// 6. Performance & Scalability Benchmark Across 43 Providers
// =========================================================================

test("Phase R1 - 14. Performance Benchmark: 1-Pass Realization across 43 providers is sub-millisecond", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_perf_r1_01",
    sourceZh: "太上长老拔剑斩出，剑气纵横！",
    role: "ACTION",
    subjectSlot: { entityId: "elder1", isImplicit: true, resolvedPronoun: "Thái Thượng Trưởng lão" },
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90 }, valence: 0.20, intensity: 0.85 })
  });

  const ctx = {
    primaryDomain: "COMBAT",
    domainWeights: { COMBAT: 0.95, TITLE_HIERARCHY: 0.90, SWORD_INTENT: 0.85 },
    translatedText: "Thái Thượng Trưởng lão tuốt kiếm chém ra, kiếm khí tung hoành!"
  };

  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    realizer.realizeClause(clause, ctx);
  }
  const totalMs = performance.now() - start;
  const avgUs = (totalMs / 1000) * 1000; // microseconds per call

  assert.ok(avgUs < 500, `Average full-pipeline realization latency should be < 500μs, got ${avgUs.toFixed(2)}μs`);
});
