"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateExpansionBudget } = require("./expansion-budget");
const { createRhythmProfile } = require("./rhythm-governor");
const { createAntiRepetitionTracker } = require("./anti-repetition");
const { createExpressionPlanner } = require("./expression-planner");
const { createVietnameseRealizer } = require("./vietnamese-realizer");
const { createClauseIR, createSemanticSignature } = require("./contracts");

test("Phase 3 Expansion Budget: forbids ungrounded metaphor intrusion", () => {
  const clause = createClauseIR({
    sourceZh: "他放下了茶杯",
    role: "ACTION",
    invariants: { allowMetaphor: false }
  });

  const badPlan = {
    targetVi: "Hắn đặt chén trà xuống, tâm tịnh tựa mặt nước hồ thu",
    introducedMetaphors: 1
  };

  const res = evaluateExpansionBudget(clause, badPlan);
  assert.equal(res.allowed, false);
  assert.match(res.reason, /FORBIDDEN_METAPHOR_INTRUSION/);
});

test("Phase 3 Rhythm Governor: produces FAST_PUNCHY profile for combat actions", () => {
  const clause = createClauseIR({ role: "ACTION" });
  const profile = createRhythmProfile(clause, { pacing: "FAST_PUNCHY" });

  assert.equal(profile.pacing, "FAST_PUNCHY");
  assert.equal(profile.targetVerbSyllables, 2);
  assert.equal(profile.preferShortPauses, true);
});

test("Phase 3 Anti-Repetition: rotates synonyms smoothly without changing meaning", () => {
  const tracker = createAntiRepetitionTracker();

  // Sentence 1 with "không khỏi"
  const s1 = tracker.applyRotation("Trong lòng hắn không khỏi chấn động.");
  assert.ok(s1.includes("không khỏi"));

  // Sentence 2 with "không khỏi" in close proximity -> rotates to "bất giác"
  const s2 = tracker.applyRotation("Mọi người không khỏi hít sâu một hơi.");
  assert.ok(s2.includes("bất giác"), `Expected rotation from "không khỏi" to "bất giác", got: ${s2}`);

  // Sentence 3 with "không khỏi" -> rotates to "thoáng chốc"
  const s3 = tracker.applyRotation("Nàng không khỏi lùi lại.");
  assert.ok(s3.includes("thoáng chốc"));
});

test("Phase 3 Expression Planner: integrates router suggestions, subject pronoun, and budget", () => {
  const planner = createExpressionPlanner();

  const clause = createClauseIR({
    id: "cl_plan_01",
    sourceZh: "一剑斩出",
    role: "ACTION",
    subjectSlot: { isImplicit: true, resolvedPronoun: "hắn" },
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.85, HOSTILITY: 0.70 },
      valence: -0.20,
      intensity: 0.85
    })
  });

  const context = {
    primaryDomain: "SWORD_DAO",
    domainWeights: { SWORD_DAO: 0.90, COMBAT: 0.80 }
  };

  const plan = planner.planClause(clause, context);

  assert.equal(plan.resolvedSubject, "hắn");
  assert.ok(plan.slotReplacements.some((s) => s.slotId === "一剑斩出"));
  assert.equal(plan.rejectedByBudget.length, 0);
});

test("Phase 3 1-Pass Vietnamese Realizer: synthesizes flawless prose with provenance trace", () => {
  const realizer = createVietnameseRealizer();

  const clause = createClauseIR({
    id: "cl_realize_01",
    sourceZh: "拔出长剑，一剑斩出",
    role: "ACTION",
    subjectSlot: { isImplicit: true, resolvedPronoun: "hắn" },
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.85, HOSTILITY: 0.70 },
      valence: -0.20,
      intensity: 0.85
    })
  });

  const context = {
    primaryDomain: "SWORD_DAO",
    domainWeights: { SWORD_DAO: 0.90, COMBAT: 0.80 }
  };

  const { text, trace } = realizer.realizeClause(clause, context);

  assert.ok(text.includes("rút trường kiếm ra"));
  assert.ok(text.includes("vung kiếm chém ra"));
  assert.ok(text.startsWith("hắn"));

  assert.equal(trace.clauseId, "cl_realize_01");
  assert.equal(trace.finalVi, text);
  assert.ok(trace.stylistAudit.length >= 2);
});
