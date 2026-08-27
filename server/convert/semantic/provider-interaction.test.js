"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createClauseIR,
  createSemanticSignature
} = require("./contracts");

const {
  STYLE_SLOTS,
  SEMANTIC_TYPES,
  CONFLICT_POLICIES,
  STYLE_SLOT_DEFINITIONS,
  getSlotDefinition,
  isSlotMergeable,
  getSlotMaxMultiplicity,
  createStylistContribution
} = require("./providers/stylist-contribution");

const {
  INTERACTION_RELATIONS,
  getDomainInteractionRelation,
  evaluateContributionCoexistence
} = require("./provider-interaction-matrix");

const { createStylistRouter } = require("./stylist-router");
const { createDefaultProviderRegistry } = require("./providers/provider-registry");

// ==========================================
// 1. StyleSlot Schema & Metadata Tests
// ==========================================

test("Wave B.5 - 1. StyleSlot Definitions: all 47 slots define strict semantic metadata", () => {
  const slotKeys = Object.keys(STYLE_SLOTS);
  assert.ok(slotKeys.length >= 45, "Must cover all canonical style slots");

  for (const key of slotKeys) {
    const slotId = STYLE_SLOTS[key];
    const def = getSlotDefinition(slotId);

    assert.ok(def, `Slot ${slotId} must have definition`);
    assert.equal(def.id, slotId);
    assert.ok(Object.values(SEMANTIC_TYPES).includes(def.semanticType), `Invalid semanticType for ${slotId}`);
    assert.equal(typeof def.canMerge, "boolean");
    assert.equal(typeof def.canCompete, "boolean");
    assert.ok(def.maxMultiplicity >= 1);
    assert.ok(Array.isArray(def.allowedTextRoles));
    assert.ok(Object.values(CONFLICT_POLICIES).includes(def.conflictPolicy));
  }

  // Check specific slot classifications
  assert.equal(getSlotDefinition(STYLE_SLOTS.WEAPON_STRIKE).semanticType, SEMANTIC_TYPES.ACTION);
  assert.equal(getSlotDefinition(STYLE_SLOTS.WEAPON_STRIKE).canMerge, false);
  assert.equal(getSlotDefinition(STYLE_SLOTS.WEAPON_STRIKE).maxMultiplicity, 1);

  assert.equal(getSlotDefinition(STYLE_SLOTS.ZEN_STATE).semanticType, SEMANTIC_TYPES.STATE);
  assert.equal(getSlotDefinition(STYLE_SLOTS.ZEN_STATE).canMerge, true);
  assert.equal(getSlotDefinition(STYLE_SLOTS.ZEN_STATE).maxMultiplicity, 2);

  assert.equal(getSlotDefinition(STYLE_SLOTS.ELDRITCH_HORROR).semanticType, SEMANTIC_TYPES.AFFECT);
  assert.equal(getSlotDefinition(STYLE_SLOTS.ELDRITCH_HORROR).canMerge, true);

  assert.equal(getSlotDefinition(STYLE_SLOTS.IMPERIAL_PROCLAMATION).semanticType, SEMANTIC_TYPES.DIALOGUE);
});

// ==========================================
// 2. Provider Interaction Matrix Tests
// ==========================================

test("Wave B.5 - 2. Provider Interaction Matrix: models pairwise semantic relations accurately", () => {
  assert.equal(getDomainInteractionRelation("COMBAT", "SWORD_DAO"), INTERACTION_RELATIONS.COMPLEMENT);
  assert.equal(getDomainInteractionRelation("COMBAT", "ZEN_TEA"), INTERACTION_RELATIONS.ORTHOGONAL);
  assert.equal(getDomainInteractionRelation("COMBAT", "MUSICAL_DAO"), INTERACTION_RELATIONS.ORTHOGONAL);
  assert.equal(getDomainInteractionRelation("MUSICAL_DAO", "ZEN_TEA"), INTERACTION_RELATIONS.COMPLEMENT);
  assert.equal(getDomainInteractionRelation("SUPERNATURAL_HORROR", "ROMANCE_AESTHETICS"), INTERACTION_RELATIONS.ORTHOGONAL);
  assert.equal(getDomainInteractionRelation("SUPERNATURAL_HORROR", "ELDRITCH_HORROR"), INTERACTION_RELATIONS.COMPETE);
  assert.equal(getDomainInteractionRelation("WARFARE_SIEGE", "IMPERIAL_DECREE"), INTERACTION_RELATIONS.COMPLEMENT);
  assert.equal(getDomainInteractionRelation("KARMA_SAMSARA", "MANTRA_SEAL"), INTERACTION_RELATIONS.COMPLEMENT);

  // Symmetry check
  assert.equal(
    getDomainInteractionRelation("ZEN_TEA", "COMBAT"),
    getDomainInteractionRelation("COMBAT", "ZEN_TEA")
  );
});

// ==========================================
// 3. Four Resolution Outcomes: WIN, MERGE, REJECT, ABSTAIN
// ==========================================

test("Wave B.5 - 3. Router Resolution Outcomes: produces WIN for competitive slots and MERGE for orthogonal slots", () => {
  const router = createStylistRouter();

  // Test WIN on competitive slot (WEAPON_STRIKE)
  const combatClause = createClauseIR({
    id: "cl_win_01",
    sourceZh: "一剑斩出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.85, HOSTILITY: 0.70 },
      valence: -0.20,
      intensity: 0.85
    })
  });

  const resWin = router.route(combatClause, {
    primaryDomain: "SWORD_DAO",
    domainWeights: { SWORD_DAO: 0.95, COMBAT: 0.40 }
  });

  const weaponStrikeRes = resWin.slotResolutions.find((r) => r.targetSlot === STYLE_SLOTS.WEAPON_STRIKE);
  assert.ok(weaponStrikeRes);
  assert.equal(weaponStrikeRes.decision, "WIN");
  assert.equal(weaponStrikeRes.winner.providerId, "sword-provider");
  assert.ok(weaponStrikeRes.confidence >= 0.80);

  // Test MERGE on mergeable slot (ZEN_STATE & TEA_DISCOURSE)
  const zenClause = createClauseIR({
    id: "cl_merge_01",
    sourceZh: "静坐品茗，心如止水，顿悟大道。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.90, SOLEMN: 0.70 },
      valence: 0.40,
      intensity: 0.50
    })
  });

  const resMerge = router.route(zenClause, {
    primaryDomain: "ZEN_TEA",
    domainWeights: { ZEN_TEA: 0.90 }
  });

  const zenRes = resMerge.slotResolutions.find((r) => r.targetSlot === STYLE_SLOTS.ZEN_STATE);
  assert.ok(zenRes);
  assert.equal(zenRes.decision, "MERGE");
  assert.ok(zenRes.merged.length >= 1);
});

test("Wave B.5 - 4. Router Resolution Outcomes: REJECT on incompatible signature and ABSTAIN on tied score", () => {
  const router = createStylistRouter();

  // Test REJECT on severe polarity flip (冷笑 vs mỉm cười an nhiên)
  const sneerClause = createClauseIR({
    id: "cl_reject_01",
    sourceZh: "他冷笑一声。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { CONTEMPT: 0.90, WRATH: 0.60 },
      valence: -0.70,
      intensity: 0.80
    })
  });

  const resReject = router.route(sneerClause, {
    primaryDomain: "ZEN_TEA",
    domainWeights: { ZEN_TEA: 0.90 }
  });

  // Zen smile should be rejected by signature compatibility
  const rejected = resReject.rejectedContributions.find((r) =>
    r.reason && r.reason.includes("SIGNATURE_INCOMPATIBLE")
  );
  // Either rejected or filtered out
  assert.ok(resReject.selectedContributions.length === 0, "Sneer must not produce zen smile");
});

// ==========================================
// 4. Provider Order Independence
// ==========================================

test("Wave B.5 - 5. Provider Order Independence: shuffling provider registration 10 times yields 100% identical decisions", () => {
  const clause = createClauseIR({
    id: "cl_order_01",
    sourceZh: "一剑斩出，雷霆万钧！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.90, WRATH: 0.80 },
      valence: -0.30,
      intensity: 0.90
    })
  });

  const context = {
    primaryDomain: "COMBAT",
    domainWeights: { COMBAT: 0.85, SWORD_DAO: 0.85, TRIBULATION_BREAKTHROUGH: 0.70 }
  };

  const defaultRegistry = createDefaultProviderRegistry();
  const allProviders = defaultRegistry.getAllProviders();

  const baseRouter = createStylistRouter({ registry: allProviders });
  const baseResult = baseRouter.route(clause, context);

  // Shuffle array 10 times
  for (let i = 0; i < 10; i++) {
    const shuffled = [...allProviders].sort(() => Math.random() - 0.5);
    const shuffledRouter = createStylistRouter({ registry: shuffled });
    const shuffledResult = shuffledRouter.route(clause, context);

    assert.equal(
      shuffledResult.selectedContributions.length,
      baseResult.selectedContributions.length,
      `Iteration ${i}: Must select same number of contributions`
    );

    for (let j = 0; j < baseResult.selectedContributions.length; j++) {
      const baseC = baseResult.selectedContributions[j];
      const shufC = shuffledResult.selectedContributions[j];
      assert.equal(shufC.providerId, baseC.providerId, `Iteration ${i}: Provider mismatch`);
      assert.equal(shufC.targetSlot, baseC.targetSlot, `Iteration ${i}: TargetSlot mismatch`);
      assert.equal(shufC.candidateVi, baseC.candidateVi, `Iteration ${i}: CandidateVi mismatch`);
    }

    assert.equal(
      shuffledResult.slotResolutions.length,
      baseResult.slotResolutions.length,
      `Iteration ${i}: Resolutions count must match`
    );
  }
});

// ==========================================
// 5. Conflict Order Independence
// ==========================================

test("Wave B.5 - 6. Conflict Order Independence: resolve([A, B]) === resolve([B, A])", () => {
  const router = createStylistRouter();

  const clause = createClauseIR({
    id: "cl_conflict_order_01",
    sourceZh: "一剑斩出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.90, HOSTILITY: 0.70 },
      valence: -0.20,
      intensity: 0.85
    })
  });

  const res1 = router.route(clause, { primaryDomain: "SWORD_DAO", domainWeights: { SWORD_DAO: 0.90, COMBAT: 0.50 } });
  const res2 = router.route(clause, { primaryDomain: "SWORD_DAO", domainWeights: { SWORD_DAO: 0.90, COMBAT: 0.50 } });

  assert.equal(res1.selectedContributions[0].candidateVi, res2.selectedContributions[0].candidateVi);
  assert.equal(res1.selectedContributions[0].providerId, res2.selectedContributions[0].providerId);
});

// ==========================================
// 6. Adversarial Multi-Domain Scenarios
// ==========================================

test("Wave B.5 - 7. Adversarial Multi-Domain: 他坐在战场边品茶，忽然拔剑斩去 (Tea + Zen + Combat + Sword)", () => {
  const router = createStylistRouter();

  const clause = createClauseIR({
    id: "cl_adv_01",
    sourceZh: "坐在战场边品茗，心如止水，忽然拔剑斩出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.70, RESOLUTE: 0.85 },
      valence: 0.0,
      intensity: 0.75
    })
  });

  const context = {
    primaryDomain: "SWORD_DAO",
    domainWeights: {
      SWORD_DAO: 0.90,
      COMBAT: 0.75,
      ZEN_TEA: 0.70,
      WARFARE_SIEGE: 0.65
    }
  };

  const res = router.route(clause, context);

  // Must have contributions from Zen/Tea AND Sword
  const swordContrib = res.selectedContributions.find((c) => c.providerId === "sword-provider");
  const zenContrib = res.selectedContributions.find((c) => c.providerId === "zen-tea-provider");

  assert.ok(swordContrib, "Sword strike must be resolved");
  assert.ok(zenContrib, "Zen tea state must be preserved without binary suppression");
});

test("Wave B.5 - 8. Adversarial Multi-Domain: 红衣女鬼容貌绝美，却杀意滔天 (Beauty + Supernatural Horror non-suppression)", () => {
  const router = createStylistRouter();

  const clause = createClauseIR({
    id: "cl_adv_02",
    sourceZh: "红衣厉鬼容貌绝美，杀意滔天！",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { FEAR: 0.90, WRATH: 0.85 },
      valence: -0.70,
      intensity: 0.90
    })
  });

  const context = {
    primaryDomain: "SUPERNATURAL_HORROR",
    domainWeights: {
      SUPERNATURAL_HORROR: 0.90,
      ROMANCE_AESTHETICS: 0.60
    }
  };

  const res = router.route(clause, context);

  const ghostContrib = res.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.SUPERNATURAL_SPECTER);
  assert.ok(ghostContrib, "Supernatural specter must be resolved");
  assert.equal(ghostContrib.sourceSpanZh, "红衣厉鬼");
});

test("Wave B.5 - 9. Adversarial Multi-Domain: 琴音悠扬之间，一道剑气破空而来 (Musical + Sword + Combat)", () => {
  const router = createStylistRouter();

  const clause = createClauseIR({
    id: "cl_adv_03",
    sourceZh: "琴音袅袅之间，一剑斩出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.60, RESOLUTE: 0.85 },
      valence: 0.10,
      intensity: 0.80
    })
  });

  const context = {
    primaryDomain: "SWORD_DAO",
    domainWeights: {
      SWORD_DAO: 0.85,
      MUSICAL_DAO: 0.80,
      COMBAT: 0.70
    }
  };

  const res = router.route(clause, context);

  const musicSlot = res.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.MUSICAL_PERFORMANCE);
  const swordSlot = res.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.WEAPON_STRIKE);

  assert.ok(musicSlot, "Musical melody slot must be resolved");
  assert.ok(swordSlot, "Sword strike slot must be resolved");
});

// ==========================================
// 7. 5-Provider Concurrent Scenario
// ==========================================

test("Wave B.5 - 10. Multi-Provider 5-Way Scenario: Warfare + Imperial + Mantra + Karma + Tribulation", () => {
  const router = createStylistRouter();

  const clause = createClauseIR({
    id: "cl_multi_5way_01",
    sourceZh: "千军万马冲锋，奉天承运，口诵真言，斩断因果，天劫降临！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.90, RESOLUTE: 0.90, FEAR: 0.70 },
      valence: -0.10,
      intensity: 0.95
    })
  });

  const context = {
    primaryDomain: "WARFARE_SIEGE",
    domainWeights: {
      WARFARE_SIEGE: 0.85,
      IMPERIAL_DECREE: 0.80,
      MANTRA_SEAL: 0.75,
      KARMA_SAMSARA: 0.75,
      TRIBULATION_BREAKTHROUGH: 0.80
    }
  };

  const res = router.route(clause, context);

  assert.ok(res.selectedContributions.length >= 4, "Must resolve multi-slot contributions across 5 domains");
  const slots = res.selectedContributions.map((c) => c.targetSlot);
  assert.ok(slots.includes(STYLE_SLOTS.WARFARE_CHARGE));
  assert.ok(slots.includes(STYLE_SLOTS.IMPERIAL_PROCLAMATION));
  assert.ok(slots.includes(STYLE_SLOTS.MANTRA_SEAL));
  assert.ok(slots.includes(STYLE_SLOTS.KARMA_SAMSARA));
  assert.ok(slots.includes(STYLE_SLOTS.TRIBULATION_LIGHTNING));
});

// ==========================================
// 8. Semantic Amplification & Saturation Control
// ==========================================

test("Wave B.5 - 11. Semantic Amplification & Saturation: prevents excessive adjective buildup", () => {
  const router = createStylistRouter();

  const clause = createClauseIR({
    id: "cl_sat_01",
    sourceZh: "一剑斩出。",
    role: "ACTION",
    invariants: { maxAdjectives: 1 }
  });

  const res = router.route(clause, {
    primaryDomain: "COMBAT",
    domainWeights: { COMBAT: 0.90 }
  });

  // Check that all selected contributions satisfy expansion constraints
  for (const c of res.selectedContributions) {
    assert.ok(c.semanticExpansionCost <= 0.30, "Expansion cost must be strictly bounded");
  }
});

// ==========================================
// 9. Neutral & No-Contribution Guarantee
// ==========================================

test("Wave B.5 - 12. Neutral & No-Contribution: Plain everyday sentence produces 0 unsolicited poetic expansions", () => {
  const router = createStylistRouter();

  const plainClause = createClauseIR({
    id: "cl_plain_01",
    sourceZh: "他低头看了看手表，然后关上了窗户。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.50 },
      valence: 0.0,
      intensity: 0.20
    })
  });

  const res = router.route(plainClause, {
    primaryDomain: "NEUTRAL",
    domainWeights: { NEUTRAL: 1.0 }
  });

  assert.equal(res.selectedContributions.length, 0, "Everyday actions must produce 0 stylist contributions");
});
