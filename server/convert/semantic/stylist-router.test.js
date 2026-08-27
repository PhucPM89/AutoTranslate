"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createStylistRouter } = require("./stylist-router");
const { createClauseIR, createSemanticSignature } = require("./contracts");

test("Stylist Router: activates providers matching active context domains", () => {
  const router = createStylistRouter();

  const clause = createClauseIR({
    id: "cl_router_01",
    sourceZh: "叶辰拔出长剑，一剑斩出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.85, HOSTILITY: 0.60 },
      valence: -0.20,
      intensity: 0.80
    })
  });

  const context = {
    primaryDomain: "SWORD_DAO",
    domainWeights: { SWORD_DAO: 0.90, COMBAT: 0.80, ZEN_TEA: 0.0 }
  };

  const decision = router.route(clause, context);

  assert.ok(decision.activeProviders.includes("sword-provider"));
  assert.ok(decision.activeProviders.includes("action-provider"));
  assert.ok(!decision.activeProviders.includes("zen-tea-provider"));

  assert.ok(decision.acceptedSuggestions.some((s) => s.slotId === "一剑斩出"));
  assert.ok(decision.acceptedSuggestions.some((s) => s.slotId === "拔出长剑"));
});

test("Stylist Router: applies mutual suppression matrix (Combat suppresses Zen Tea)", () => {
  const router = createStylistRouter();

  const clause = createClauseIR({
    id: "cl_router_02",
    sourceZh: "他一剑斩出，品茶论道",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.85, HOSTILITY: 0.70 },
      valence: -0.20,
      intensity: 0.85
    })
  });

  const context = {
    primaryDomain: "COMBAT",
    domainWeights: { COMBAT: 0.85, ZEN_TEA: 0.50 } // Combat > 0.60 triggers Zen Tea suppression
  };

  const decision = router.route(clause, context);

  assert.ok(decision.activeProviders.includes("action-provider"));
  assert.ok(!decision.activeProviders.includes("zen-tea-provider"), "Zen Tea provider must be suppressed in high combat");
});

test("Stylist Router: gates and rejects candidates with severe polarity/affect drift", () => {
  const router = createStylistRouter();

  // Source clause with dark supernatural horror signature
  const horrorClause = createClauseIR({
    id: "cl_router_03",
    sourceZh: "红衣厉鬼",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { FEAR: 0.90, HOSTILITY: 0.80 },
      valence: -0.80,
      intensity: 0.90
    })
  });

  const context = {
    primaryDomain: "SUPERNATURAL_HORROR",
    domainWeights: { SUPERNATURAL_HORROR: 0.90 }
  };

  const decision = router.route(horrorClause, context);
  const accepted = decision.acceptedSuggestions.find((s) => s.slotId === "红衣厉鬼");

  assert.ok(accepted);
  assert.equal(accepted.candidateVi, "lệ quỷ áo đỏ oán khí ngút trời");
});
