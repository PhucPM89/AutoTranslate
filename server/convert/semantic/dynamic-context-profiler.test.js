"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createContextProfiler } = require("./dynamic-context-profiler");
const { createClauseIR } = require("./contracts");

test("Dynamic Context Profiler: extracts domain weights and damps metaphoric comparisons", () => {
  const profiler = createContextProfiler();

  const directCombat = createClauseIR({
    sourceZh: "叶辰拔剑出鞘，长剑剑气纵横，一剑斩杀妖兽！",
    role: "ACTION"
  });
  const evidence1 = profiler.extractDomainEvidence(directCombat);
  assert.ok(evidence1.COMBAT > 0.5, "Direct combat action must score high on COMBAT");
  assert.ok(evidence1.SWORD_DAO > 0.5, "Direct sword action must score high on SWORD_DAO");

  const metaphorClause = createClauseIR({
    sourceZh: "她的美眸宛如秋水寒剑般清冽。",
    role: "DESCRIPTION"
  });
  const evidence2 = profiler.extractDomainEvidence(metaphorClause);
  // Metaphor damping must keep combat score low
  assert.ok(!evidence2.COMBAT || evidence2.COMBAT < 0.2);
});

test("Dynamic Context Profiler: punctual shock resets previous scene context immediately", () => {
  const profiler = createContextProfiler({
    initialDomains: { ZEN_TEA: 0.90 }
  });

  // Clause 1: Tea drinking
  const teaClause = createClauseIR({
    sourceZh: "两人相对而坐，品茶论道，心如止水。",
    role: "DESCRIPTION"
  });
  profiler.updateContext(teaClause);
  assert.equal(profiler.getContextSnapshot().primaryDomain, "ZEN_TEA");

  // Clause 2: Sudden violent ambush with acoustic shock!
  const ambushClause = createClauseIR({
    sourceZh: "轰！一道惊天剑气爆发，轰然碎裂屋顶！",
    role: "ACTION"
  });
  const snap = profiler.updateContext(ambushClause);

  assert.equal(snap.lastShockDecision.isShock, true);
  assert.equal(snap.lastShockDecision.transitionType, "PUNCTUAL_EVENT_SHOCK");
  assert.ok(snap.primaryDomain === "COMBAT" || snap.primaryDomain === "SWORD_DAO");
  assert.equal(snap.mood, "TENSE_HOSTILE");
  assert.equal(snap.pacing, "FAST_PUNCHY");
});

test("Dynamic Context Profiler: suppresses shock in quoted lore or historical recollection", () => {
  const profiler = createContextProfiler({
    initialDomains: { ZEN_TEA: 0.85 }
  });

  const quoteClause = createClauseIR({
    sourceZh: "“当年古籍记载，血光大阵爆发...”",
    role: "DIALOGUE"
  });
  const snap = profiler.updateContext(quoteClause);

  assert.equal(snap.lastShockDecision.isShock, false);
  assert.equal(snap.lastShockDecision.transitionType, "RECOLLECTION_FILTERED");
  assert.equal(snap.primaryDomain, "ZEN_TEA", "Tea context must not be poisoned by ancient scroll quote");
});
