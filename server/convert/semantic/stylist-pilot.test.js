"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createStylistRouter } = require("./stylist-router");
const { createActionProvider } = require("./providers/action-provider");
const { createSwordProvider } = require("./providers/sword-provider");
const { createZenTeaProvider } = require("./providers/zen-tea-provider");
const { STYLE_SLOTS } = require("./providers/stylist-contribution");
const { createClauseIR, createSemanticSignature } = require("./contracts");
const { createSemanticOrchestrator } = require("./semantic-orchestrator");

// 1. Action Golden Tests
test("1. Action Provider: accurately generates high-impact action contributions", () => {
  const router = createStylistRouter();

  const clause1 = createClauseIR({
    id: "cl_action_01",
    sourceZh: "叶辰一拳轰出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { WRATH: 0.70, RESOLUTE: 0.85 },
      valence: -0.20,
      intensity: 0.90
    })
  });
  const context1 = { primaryDomain: "COMBAT", domainWeights: { COMBAT: 0.90 } };
  const res1 = router.route(clause1, context1);

  const strikeSlot = res1.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.ACTION_STRIKE);
  assert.ok(strikeSlot, "Must resolve ACTION_STRIKE slot");
  assert.equal(strikeSlot.candidateVi, "tung ra một quyền oanh kích");
  assert.equal(strikeSlot.providerId, "action-provider");

  const clause2 = createClauseIR({
    id: "cl_action_02",
    sourceZh: "他纵身跃起，身形一闪",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.80 },
      valence: 0.0,
      intensity: 0.75
    })
  });
  const res2 = router.route(clause2, context1);
  const moveSlot = res2.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.ACTION_MOVE);
  assert.ok(moveSlot, "Must resolve ACTION_MOVE slot");
  assert.equal(moveSlot.candidateVi, "tung người nhảy vọt lên");
});

// 2. Sword Golden Tests
test("2. Sword Provider: accurately generates sword dao & weapon intent contributions", () => {
  const router = createStylistRouter();

  const clause = createClauseIR({
    id: "cl_sword_01",
    sourceZh: "他拔剑出鞘，剑气纵横",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.75 },
      valence: -0.10,
      intensity: 0.85
    })
  });
  const context = { primaryDomain: "SWORD_DAO", domainWeights: { SWORD_DAO: 0.95, COMBAT: 0.80 } };
  const res = router.route(clause, context);

  const drawSlot = res.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.WEAPON_DRAW);
  assert.ok(drawSlot, "Must resolve WEAPON_DRAW slot");
  assert.equal(drawSlot.candidateVi, "tuốt kiếm rời vỏ");
  assert.equal(drawSlot.providerId, "sword-provider");

  const intentSlot = res.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.WEAPON_INTENT);
  assert.ok(intentSlot, "Must resolve WEAPON_INTENT slot");
  assert.equal(intentSlot.candidateVi, "kiếm khí tung hoành ngang dọc");
});

// 3. Zen Golden Tests & Anti-Overwriting Stress Test
test("3. Zen-Tea Provider: accurate zen expressions and strictly ZERO hallucination on simple actions", () => {
  const router = createStylistRouter();

  // Test A: Explicit Daoist tea discourse -> Zen discourse contribution
  const clauseA = createClauseIR({
    id: "cl_zen_01",
    sourceZh: "二人烹茶论道，心如止水",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.95, SOLEMN: 0.60 },
      valence: 0.60,
      intensity: 0.40,
      register: "CLASSICAL_LITERARY"
    })
  });
  const contextA = { primaryDomain: "ZEN_TEA", domainWeights: { ZEN_TEA: 0.90 } };
  const resA = router.route(clauseA, contextA);

  const discourseSlot = resA.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.TEA_DISCOURSE);
  assert.ok(discourseSlot);
  assert.equal(discourseSlot.candidateVi, "đun nước pha trà, cùng nhau đàm đạo");

  const zenStateSlot = resA.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.ZEN_STATE);
  assert.ok(zenStateSlot);
  assert.equal(zenStateSlot.candidateVi, "tâm tịnh tựa mặt nước hồ thu");

  // Test B: Simple physical action -> ZERO poetic expansion!
  const clauseB = createClauseIR({
    id: "cl_zen_02",
    sourceZh: "他放下了茶杯。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { NEUTRAL: 0.90, TRANQUIL: 0.30 },
      valence: 0.0,
      intensity: 0.20
    }),
    invariants: { allowMetaphor: false, maxAdjectives: 0 }
  });
  const resB = router.route(clauseB, contextA);
  const cupSlot = resB.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.TEA_PREPARATION);
  assert.ok(cupSlot);
  assert.equal(cupSlot.candidateVi, "đặt chén trà xuống");
  assert.equal(cupSlot.semanticExpansionCost, 0.0);
  assert.equal(cupSlot.introducedInformation.length, 0);
});

// 4. Slot Conflict Resolution: Multi-Provider Bidding
test("4. Slot Conflict Resolution: Action vs Sword competing for WEAPON_STRIKE resolves cleanly", () => {
  const router = createStylistRouter();

  const clause = createClauseIR({
    id: "cl_conflict_01",
    sourceZh: "一剑斩出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.85, HOSTILITY: 0.70 },
      valence: -0.20,
      intensity: 0.85
    })
  });

  // Sword DAO dominant -> Sword provider wins WEAPON_STRIKE
  const contextSword = { primaryDomain: "SWORD_DAO", domainWeights: { SWORD_DAO: 0.95, COMBAT: 0.50 } };
  const resSword = router.route(clause, contextSword);
  const strikeSword = resSword.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.WEAPON_STRIKE);
  assert.ok(strikeSword);
  assert.equal(strikeSword.providerId, "sword-provider");

  // COMBAT dominant -> Action provider wins
  const contextCombat = { primaryDomain: "COMBAT", domainWeights: { COMBAT: 0.95, SWORD_DAO: 0.30 } };
  const resCombat = router.route(clause, contextCombat);
  const strikeCombat = resCombat.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.WEAPON_STRIKE);
  assert.ok(strikeCombat);
  assert.equal(strikeCombat.providerId, "action-provider");
});

// 5. Semantic Signature Preservation: Rejects Polarity Flip
test("5. Semantic Signature Preservation: Cold sneer (冷笑) strictly rejects tranquil smile (mỉm cười an nhiên)", () => {
  const router = createStylistRouter();

  const sneerClause = createClauseIR({
    id: "cl_sneer_01",
    sourceZh: "他冷冷一笑，一拳轰出",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { CONTEMPT: 0.85, HOSTILITY: 0.60 },
      valence: -0.70,
      intensity: 0.80
    })
  });

  const context = { primaryDomain: "COMBAT", domainWeights: { COMBAT: 0.80 } };
  const res = router.route(sneerClause, context);

  // Assert that all accepted contributions align with negative/combat valence
  for (const contrib of res.selectedContributions) {
    assert.ok(contrib.semanticSignature.valence <= 0.0, "Must not introduce positive tranquil joy to a cold sneer strike");
  }
});

// 6. Anti-Overwriting: Simple sentences stay clean and uninflated
test("6. Anti-Overwriting: Simple sentences must not be inflated", () => {
  const orchestrator = createSemanticOrchestrator({
    baseConvertFunction: (raw) => raw
  });

  const simpleSentences = [
    "他放下了茶杯。",
    "他拿起了剑。",
    "他看了一眼窗外。"
  ];

  for (const sent of simpleSentences) {
    const shadowRes = orchestrator.translateShadow(sent);
    assert.ok(shadowRes.baselineOutput.length > 0);
    assert.ok(shadowRes.expressionPlanPreview.length > 0);

    // Verify expression plan does not inject heavy ungrounded metaphors
    const plan = shadowRes.expressionPlanPreview[0];
    for (const repl of plan.slotReplacements) {
      assert.ok(!repl.replacementVi.includes("vạn năm"), "Must not inflate with ancient cosmic metaphors");
      assert.ok(!repl.replacementVi.includes("huyền cơ thiên địa"), "Must not inflate with cosmic epiphanies");
    }
  }
});

// 7. Adversarial Multi-Domain: Combat + Zen in the same scene
test("7. Adversarial Multi-Domain: He drinks tea by the battlefield (orthogonal slots preserved)", () => {
  const router = createStylistRouter();

  // "He sits by the battlefield drinking tea" -> COMBAT context + ZEN_TEA action
  const clause = createClauseIR({
    id: "cl_adv_01",
    sourceZh: "他坐在战场边品茶，拔剑斩去",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.60, RESOLUTE: 0.60 },
      valence: 0.10,
      intensity: 0.60
    })
  });

  // Balanced domain weights: neither suppresses the other
  const context = {
    primaryDomain: "NEUTRAL",
    domainWeights: { COMBAT: 0.45, ZEN_TEA: 0.45, SWORD_DAO: 0.45 }
  };

  const res = router.route(clause, context);

  // Both Action (WEAPON_STRIKE) and Zen (TEA_PREPARATION / TEA_DISCOURSE) can contribute to their distinct slots!
  const hasWeaponSlot = res.selectedContributions.some((c) => c.targetSlot === STYLE_SLOTS.WEAPON_STRIKE || c.targetSlot === STYLE_SLOTS.WEAPON_DRAW);
  const hasTeaSlot = res.selectedContributions.some((c) => c.targetSlot === STYLE_SLOTS.TEA_DISCOURSE || c.targetSlot === STYLE_SLOTS.TEA_PREPARATION);

  assert.ok(hasWeaponSlot, "Must preserve weapon slot");
  assert.ok(hasTeaSlot, "Must preserve tea slot in orthogonal multi-domain scene");
});
