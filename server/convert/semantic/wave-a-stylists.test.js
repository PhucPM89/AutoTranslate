"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createStylistRouter } = require("./stylist-router");
const { STYLE_SLOTS } = require("./providers/stylist-contribution");
const { createClauseIR, createSemanticSignature } = require("./contracts");
const { createSemanticOrchestrator } = require("./semantic-orchestrator");

// 1. Alchemy Provider Golden Tests
test("Wave A - 1. Alchemy Provider: resolves aromas, cauldron dynamics, and pill manifestation", () => {
  const router = createStylistRouter();

  const clause = createClauseIR({
    id: "cl_alc_01",
    sourceZh: "丹香四溢，成丹出世，引动丹劫！",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { JOY: 0.80, SOLEMN: 0.70 },
      valence: 0.60,
      intensity: 0.75
    })
  });

  const context = {
    primaryDomain: "ALCHEMY",
    domainWeights: { ALCHEMY: 0.95, COMBAT: 0.20 }
  };

  const res = router.route(clause, context);
  const aromaSlot = res.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.ALCHEMY_AROMA);
  const potencySlot = res.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.ALCHEMY_POTENCY);
  const flameSlot = res.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.ALCHEMY_FLAME);

  assert.ok(aromaSlot, "Must resolve ALCHEMY_AROMA slot");
  assert.equal(aromaSlot.candidateVi, "đan hương ngào ngạt lan tỏa khắp bốn phía");

  assert.ok(potencySlot, "Must resolve ALCHEMY_POTENCY slot");
  assert.equal(potencySlot.candidateVi, "đan thành viên mãn, ngưng đan xuất thế");

  assert.ok(flameSlot, "Must resolve ALCHEMY_FLAME slot");
  assert.equal(flameSlot.candidateVi, "đan kiếp ầm ầm giáng lâm");
});

// 2. Beast Contract & Bestiary Golden Tests
test("Wave A - 2. Beast Contract & Bestiary: resolves soul bonds and beast roars", () => {
  const router = createStylistRouter();

  const clause1 = createClauseIR({
    id: "cl_beast_01",
    sourceZh: "契约法阵亮起，平等契约成立！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.85, TRANQUIL: 0.60 },
      valence: 0.60,
      intensity: 0.75
    })
  });
  const res1 = router.route(clause1, { primaryDomain: "BEAST_TAMING", domainWeights: { BEAST_TAMING: 0.90 } });
  const contractSlot = res1.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.BEAST_CONTRACT);
  assert.ok(contractSlot);

  const clause2 = createClauseIR({
    id: "cl_beast_02",
    sourceZh: "妖气冲天，凶兽咆哮，利爪撕裂空间！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { FEAR: 0.85, WRATH: 0.80 },
      valence: -0.50,
      intensity: 0.90
    })
  });
  const res2 = router.route(clause2, { primaryDomain: "BESTIARY_DEMONIC", domainWeights: { BESTIARY_DEMONIC: 0.95 } });
  const roarSlot = res2.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.BEAST_ROAR);
  const evoSlot = res2.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.BEAST_EVOLUTION);
  assert.ok(roarSlot);
  assert.ok(evoSlot);
  assert.equal(evoSlot.candidateVi, "móng vuốt sắc lẹm xé toạc hư không");
});

// 3. Culinary & Immortal Banquet Golden Tests
test("Wave A - 3. Culinary Provider: resolves immortal wine and taste sensations", () => {
  const router = createStylistRouter();

  const clause = createClauseIR({
    id: "cl_cul_01",
    sourceZh: "琼浆玉液入口即化，推杯换盏",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { JOY: 0.90, TRANQUIL: 0.70 },
      valence: 0.80,
      intensity: 0.60
    })
  });

  const res = router.route(clause, { primaryDomain: "CULINARY", domainWeights: { CULINARY: 0.90 } });
  const delSlot = res.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.CULINARY_DELICACY);
  const sensSlot = res.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.CULINARY_SENSATION);

  assert.ok(delSlot);
  assert.equal(delSlot.candidateVi, "mỹ tửu quỳnh tương ngọc dịch thơm nồng ngất ngây");
  assert.ok(sensSlot);
});

// 4. Cyberpunk Scifi Golden Tests
test("Wave A - 4. Cyber Scifi Provider: resolves neural link and mecha deployment", () => {
  const router = createStylistRouter();

  const clause = createClauseIR({
    id: "cl_cyber_01",
    sourceZh: "脑机接口同步，机甲充能，全息投影亮起",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.85, SOLEMN: 0.75 },
      valence: 0.40,
      intensity: 0.80
    })
  });

  const res = router.route(clause, { primaryDomain: "CYBER_SCIFI", domainWeights: { CYBER_SCIFI: 0.95 } });
  const ifaceSlot = res.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.CYBER_INTERFACE);
  const mechaSlot = res.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.CYBER_MECHA);

  assert.ok(ifaceSlot);
  assert.equal(ifaceSlot.candidateVi, "giao diện thần kinh não bộ đồng bộ 100%");
  assert.ok(mechaSlot);
});

// 5. Daoist Array & Inscription Golden Tests
test("Wave A - 5. Daoist Array & Inscription: resolves array nodes and ancient steles", () => {
  const router = createStylistRouter();

  const clause1 = createClauseIR({
    id: "cl_array_01",
    sourceZh: "阵眼启动大阵，八卦运转，符箓自燃！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.85, RESOLUTE: 0.80 },
      valence: 0.30,
      intensity: 0.80
    })
  });
  const res1 = router.route(clause1, { primaryDomain: "DAOIST_ARRAY", domainWeights: { DAOIST_ARRAY: 0.95 } });
  const nodeSlot = res1.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.ARRAY_NODE);
  const talSlot = res1.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.TALISMAN_ACTIVATION);
  assert.ok(nodeSlot);
  assert.ok(talSlot);

  const clause2 = createClauseIR({
    id: "cl_inscript_01",
    sourceZh: "玉简记载着石碑文字与传承印记",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.85, TRANQUIL: 0.70 },
      valence: 0.50,
      intensity: 0.65
    })
  });
  const res2 = router.route(clause2, { primaryDomain: "ANCIENT_INSCRIPTIONS", domainWeights: { ANCIENT_INSCRIPTIONS: 0.95 } });
  const inscSlot = res2.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.INSCRIPTION_LEGACY);
  assert.ok(inscSlot);
});

// 6. Meridian Healing & Necropolis Golden Tests
test("Wave A - 6. Meridian Healing & Necropolis: resolves acupuncture and tomb miasma", () => {
  const router = createStylistRouter();

  const clause1 = createClauseIR({
    id: "cl_heal_01",
    sourceZh: "银针封穴，疏通经脉，逼出毒素",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.85, RESOLUTE: 0.80 },
      valence: 0.50,
      intensity: 0.75
    })
  });
  const res1 = router.route(clause1, { primaryDomain: "MEDICAL_HEALING", domainWeights: { MEDICAL_HEALING: 0.90 } });
  const acuSlot = res1.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.MERIDIAN_ACUPOINT);
  const purgeSlot = res1.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.HEALING_PURGE);
  assert.ok(acuSlot);
  assert.ok(purgeSlot);

  const clause2 = createClauseIR({
    id: "cl_necro_01",
    sourceZh: "古墓之中棺椁散发死气与尸气",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { FEAR: 0.85, SOLEMN: 0.80 },
      valence: -0.65,
      intensity: 0.85
    })
  });
  const res2 = router.route(clause2, { primaryDomain: "NECROPOLIS_TOMB", domainWeights: { NECROPOLIS_TOMB: 0.90 } });
  const necroSlot = res2.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.NECROPOLIS_ATMOSPHERE);
  assert.ok(necroSlot);
});

// 7. Soul Token, Spatial Void & Auction Golden Tests
test("Wave A - 7. Soul Token, Spatial Void & Auction: resolves token shattering and auction bids", () => {
  const router = createStylistRouter();

  const clause1 = createClauseIR({
    id: "cl_soul_01",
    sourceZh: "命牌碎裂，祖庙震动，魂灯熄灭！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { FEAR: 0.85, SURPRISE: 0.90 },
      valence: -0.70,
      intensity: 0.90
    })
  });
  const res1 = router.route(clause1, { primaryDomain: "SOUL_TOKEN", domainWeights: { SOUL_TOKEN: 0.95 } });
  const soulSlot = res1.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.SOUL_TOKEN_STATE);
  assert.ok(soulSlot);
  assert.equal(soulSlot.candidateVi, "mệnh bài bản mệnh răng rắc vỡ vụn thành từng mảnh vụn");

  const clause2 = createClauseIR({
    id: "cl_spatial_01",
    sourceZh: "空间撕裂，虚空坍塌，开启秘境！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.85, FEAR: 0.80 },
      valence: -0.40,
      intensity: 0.85
    })
  });
  const res2 = router.route(clause2, { primaryDomain: "SPATIAL_VOID", domainWeights: { SPATIAL_VOID: 0.95 } });
  const spatSlot = res2.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.SPATIAL_VOID);
  assert.ok(spatSlot);

  const clause3 = createClauseIR({
    id: "cl_auc_01",
    sourceZh: "全场寂静，一锤定音，喊出天价！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SURPRISE: 0.90, SOLEMN: 0.80 },
      valence: 0.30,
      intensity: 0.85
    })
  });
  const res3 = router.route(clause3, { primaryDomain: "AUCTION", domainWeights: { AUCTION: 0.95 } });
  const aucSlot = res3.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.AUCTION_EVENT);
  assert.ok(aucSlot);
});

// 8. Adversarial Multi-Domain Orthogonal Collision
test("Wave A - 8. Adversarial Multi-Domain: Alchemy + Combat + Array coexisting orthogonally", () => {
  const router = createStylistRouter();

  // "He activates the array to protect the pill while striking the enemy"
  const clause = createClauseIR({
    id: "cl_multi_01",
    sourceZh: "启动大阵，成丹出世，一拳轰出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.85, SOLEMN: 0.70 },
      valence: 0.05,
      intensity: 0.85
    })
  });

  const context = {
    primaryDomain: "COMBAT",
    domainWeights: { COMBAT: 0.80, ALCHEMY: 0.80, DAOIST_ARRAY: 0.80 }
  };

  const res = router.route(clause, context);

  const hasArray = res.selectedContributions.some((c) => c.targetSlot === STYLE_SLOTS.ARRAY_NODE);
  const hasAlchemy = res.selectedContributions.some((c) => c.targetSlot === STYLE_SLOTS.ALCHEMY_POTENCY);
  const hasCombat = res.selectedContributions.some((c) => c.targetSlot === STYLE_SLOTS.ACTION_STRIKE);

  assert.ok(hasArray, "Array slot must be preserved");
  assert.ok(hasAlchemy, "Alchemy slot must be preserved");
  assert.ok(hasCombat, "Combat strike slot must be preserved");
});

// 9. Anti-Overwriting & Minimal Source Tests
test("Wave A - 9. Anti-Overwriting: Simple sentences stay compact without ungrounded hallucinations", () => {
  const orchestrator = createSemanticOrchestrator({
    baseConvertFunction: (raw) => raw
  });

  const simpleSentences = [
    "他拿出了玉简。",
    "他吃了一口菜。",
    "他收起了灵兽。",
    "他走进房间。"
  ];

  for (const sent of simpleSentences) {
    const shadow = orchestrator.translateShadow(sent);
    assert.ok(shadow.baselineOutput.length > 0);
    assert.ok(shadow.expressionPlanPreview.length > 0);

    const plan = shadow.expressionPlanPreview[0];
    for (const repl of plan.slotReplacements) {
      assert.ok(!repl.replacementVi.includes("ngàn năm rực sáng"), "Must not hallucinate ancient millennia legacy");
      assert.ok(!repl.replacementVi.includes("cao lương mỹ vị"), "Must not hallucinate imperial grand feasts");
    }
  }
});
