"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createStylistRouter } = require("./stylist-router");
const { createClauseIR, createSemanticSignature } = require("./contracts");
const { STYLE_SLOTS } = require("./providers/stylist-contribution");

// Test Suite for Phase 2B Wave B: Semantic State & Environment Providers
test("Wave B - 1. Apocalypse Provider: resolves doomsday wastelands, mutant crystals, and gene unlocks", () => {
  const router = createStylistRouter();
  const clause = createClauseIR({
    id: "cl_apoc_01",
    sourceZh: "丧尸狂潮奔涌而来，他解开基因锁，觉醒异能！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { FEAR: 0.70, RESOLUTE: 0.85 },
      valence: 0.10,
      intensity: 0.85
    })
  });

  const context = {
    primaryDomain: "APOCALYPSE_SURVIVAL",
    domainWeights: { APOCALYPSE_SURVIVAL: 0.90 }
  };

  const res = router.route(clause, context);

  assert.ok(res.activeProviders.includes("apocalypse-provider"));
  const zombie = res.selectedContributions.find((c) => c.sourceSpanZh === "丧尸狂潮");
  const gene = res.selectedContributions.find((c) => c.sourceSpanZh === "基因锁");
  const ability = res.selectedContributions.find((c) => c.sourceSpanZh === "异能觉醒");

  assert.ok(zombie, "Must resolve zombie tide");
  assert.ok(gene, "Must resolve gene lock");
  assert.ok(ability, "Must resolve ability awakening");
  assert.equal(zombie.targetSlot, STYLE_SLOTS.APOCALYPSE_HORDE);
  assert.equal(gene.targetSlot, STYLE_SLOTS.GENETIC_LIMIT);
  assert.equal(ability.targetSlot, STYLE_SLOTS.ELEMENTAL_AWAKENING);
});

test("Wave B - 2. Cosmic Chess Provider: resolves metaphysical board, pawn sacrifices, and decisive moves", () => {
  const router = createStylistRouter();
  const clause = createClauseIR({
    id: "cl_chess_01",
    sourceZh: "以天地为棋盘，落子无悔！",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.90, RESOLUTE: 0.85 },
      valence: 0.20,
      intensity: 0.80
    })
  });

  const context = {
    primaryDomain: "COSMIC_CHESS",
    domainWeights: { COSMIC_CHESS: 0.90 }
  };

  const res = router.route(clause, context);

  assert.ok(res.activeProviders.includes("cosmic-chess-provider"));
  const board = res.selectedContributions.find((c) => c.sourceSpanZh === "天地为棋盘");
  const move = res.selectedContributions.find((c) => c.sourceSpanZh === "落子无悔");

  assert.ok(board, "Must resolve cosmic board");
  assert.ok(move, "Must resolve decisive move");
  assert.equal(board.targetSlot, STYLE_SLOTS.COSMIC_CHESS_BOARD);
  assert.equal(move.targetSlot, STYLE_SLOTS.CHESS_STRATEGY_MOVE);
});

test("Wave B - 3. Divine Sense Provider: resolves soul scans, domain expansions, and consciousness shock", () => {
  const router = createStylistRouter();
  const clause = createClauseIR({
    id: "cl_sense_01",
    sourceZh: "庞大威压降临，神识扫过，展开领域！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.90, RESOLUTE: 0.85 },
      valence: 0.10,
      intensity: 0.85
    })
  });

  const context = {
    primaryDomain: "DIVINE_SENSE",
    domainWeights: { DIVINE_SENSE: 0.90 }
  };

  const res = router.route(clause, context);

  assert.ok(res.activeProviders.includes("divine-sense-provider"));
  const pressure = res.selectedContributions.find((c) => c.sourceSpanZh === "威压降临");
  const scan = res.selectedContributions.find((c) => c.sourceSpanZh === "神识扫过");
  const domain = res.selectedContributions.find((c) => c.sourceSpanZh === "展开领域");

  assert.ok(pressure, "Must resolve soul pressure");
  assert.ok(scan, "Must resolve divine sense scan");
  assert.ok(domain, "Must resolve domain expansion");
  assert.equal(pressure.targetSlot, STYLE_SLOTS.SOUL_PRESSURE);
  assert.equal(scan.targetSlot, STYLE_SLOTS.DIVINE_SENSE_SCAN);
  assert.equal(domain.targetSlot, STYLE_SLOTS.DOMAIN_EXPANSION);
});

test("Wave B - 4. Eldritch Horror Provider: resolves unspeakable horrors, void whispers, and sanity collapse", () => {
  const router = createStylistRouter();
  const clause = createClauseIR({
    id: "cl_eldritch_01",
    sourceZh: "直视神明，不可名状，理智崩溃！",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { FEAR: 0.95, DESPAIR: 0.85 },
      valence: -0.70,
      intensity: 0.90
    })
  });

  const context = {
    primaryDomain: "ELDRITCH_HORROR",
    domainWeights: { ELDRITCH_HORROR: 0.90 }
  };

  const res = router.route(clause, context);

  assert.ok(res.activeProviders.includes("eldritch-provider"));
  const horror = res.selectedContributions.find((c) => c.sourceSpanZh === "不可名状");
  const sanity = res.selectedContributions.find((c) => c.sourceSpanZh === "理智崩溃");

  assert.ok(horror, "Must resolve unspeakable horror");
  assert.ok(sanity, "Must resolve sanity collapse");
  assert.equal(horror.targetSlot, STYLE_SLOTS.ELDRITCH_HORROR);
  assert.equal(sanity.targetSlot, STYLE_SLOTS.SANITY_COLLAPSE);
});

test("Wave B - 5. Elegy & Memorial Provider: resolves soul calling, nine springs, and heroic spirits", () => {
  const router = createStylistRouter();
  const clause = createClauseIR({
    id: "cl_elegy_01",
    sourceZh: "魂归来兮，英魂不灭。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.95, DESPAIR: 0.60 },
      valence: -0.10,
      intensity: 0.80
    })
  });

  const context = {
    primaryDomain: "ELEGY_LAMENT",
    domainWeights: { ELEGY_LAMENT: 0.90 }
  };

  const res = router.route(clause, context);

  assert.ok(res.activeProviders.includes("elegy-provider"));
  const soul = res.selectedContributions.find((c) => c.sourceSpanZh === "魂归来兮");
  const spirit = res.selectedContributions.find((c) => c.sourceSpanZh === "英魂不灭");

  assert.ok(soul, "Must resolve soul calling");
  assert.ok(spirit, "Must resolve immortal heroic spirit");
  assert.equal(soul.targetSlot, STYLE_SLOTS.ELEGY_SOUL_CALL);
  assert.equal(spirit.targetSlot, STYLE_SLOTS.ELEGY_HEROIC_SPIRIT);
});

test("Wave B - 6. Forensic Deduction Provider: resolves locked rooms, alibis, and truth revelation", () => {
  const router = createStylistRouter();
  const clause = createClauseIR({
    id: "cl_forensic_01",
    sourceZh: "密室杀人，真相大白！",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SURPRISE: 0.80, SOLEMN: 0.75 },
      valence: 0.10,
      intensity: 0.75
    })
  });

  const context = {
    primaryDomain: "FORENSIC_DEDUCTION",
    domainWeights: { FORENSIC_DEDUCTION: 0.90 }
  };

  const res = router.route(clause, context);

  assert.ok(res.activeProviders.includes("forensic-deduction-provider"));
  const room = res.selectedContributions.find((c) => c.sourceSpanZh === "密室杀人");
  const truth = res.selectedContributions.find((c) => c.sourceSpanZh === "真相大白");

  assert.ok(room, "Must resolve locked room mystery");
  assert.ok(truth, "Must resolve truth revelation");
  assert.equal(room.targetSlot, STYLE_SLOTS.FORENSIC_MYSTERY);
  assert.equal(truth.targetSlot, STYLE_SLOTS.FORENSIC_TRUTH);
});

test("Wave B - 7. Grimoire Magic & Imperial Decrees: resolves magic curses and royal proclamations", () => {
  const router = createStylistRouter();

  // Grimoire Test
  const magicClause = createClauseIR({
    id: "cl_magic_01",
    sourceZh: "吟唱咒语，释放魔法禁咒！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.90, RESOLUTE: 0.80 },
      valence: 0.0,
      intensity: 0.85
    })
  });

  const magicRes = router.route(magicClause, {
    primaryDomain: "GRIMOIRE_MAGIC",
    domainWeights: { GRIMOIRE_MAGIC: 0.90 }
  });

  assert.ok(magicRes.activeProviders.includes("grimoire-magic-provider"));
  const curse = magicRes.selectedContributions.find((c) => c.sourceSpanZh === "魔法禁咒");
  const chant = magicRes.selectedContributions.find((c) => c.sourceSpanZh === "吟唱咒语");
  assert.ok(curse, "Must resolve forbidden magic curse");
  assert.ok(chant, "Must resolve magic incantation chant");
  assert.equal(curse.targetSlot, STYLE_SLOTS.GRIMOIRE_CURSE);
  assert.equal(chant.targetSlot, STYLE_SLOTS.MAGIC_INCANTATION);

  // Imperial Decree Test
  const imperialClause = createClauseIR({
    id: "cl_imperial_01",
    sourceZh: "奉天承运皇帝诏曰，万岁万万岁！",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.95, JOY: 0.70 },
      valence: 0.40,
      intensity: 0.85
    })
  });

  const imperialRes = router.route(imperialClause, {
    primaryDomain: "IMPERIAL_DECREE",
    domainWeights: { IMPERIAL_DECREE: 0.90 }
  });

  assert.ok(imperialRes.activeProviders.includes("imperial-edict-provider"));
  const edict = imperialRes.selectedContributions.find((c) => c.sourceSpanZh === "奉天承运皇帝诏曰");
  const cheer = imperialRes.selectedContributions.find((c) => c.sourceSpanZh === "万岁万万岁");
  assert.ok(edict, "Must resolve imperial decree");
  assert.ok(cheer, "Must resolve imperial cheer");
  assert.equal(edict.targetSlot, STYLE_SLOTS.IMPERIAL_PROCLAMATION);
  assert.equal(cheer.targetSlot, STYLE_SLOTS.IMPERIAL_SALUTATION);
});

test("Wave B - 8. Musical Dao: strictly distinguishes peaceful performance from sonic battle attack", () => {
  const router = createStylistRouter();

  // 1. Peaceful Performance
  const sereneClause = createClauseIR({
    id: "cl_music_serene",
    sourceZh: "琴音袅袅，高山流水，令人心旷神怡。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.90, JOY: 0.70 },
      valence: 0.55,
      intensity: 0.60
    })
  });

  const sereneRes = router.route(sereneClause, {
    primaryDomain: "MUSICAL_DAO",
    domainWeights: { MUSICAL_DAO: 0.90 }
  });

  const sereneItem = sereneRes.selectedContributions.find((c) => c.sourceSpanZh === "琴音袅袅");
  assert.ok(sereneItem, "Must resolve serene melody");
  assert.equal(sereneItem.targetSlot, STYLE_SLOTS.MUSICAL_PERFORMANCE);

  // 2. Sonic Attack in Battle
  const attackClause = createClauseIR({
    id: "cl_music_attack",
    sourceZh: "音波杀敌！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.90, WRATH: 0.85 },
      valence: -0.20,
      intensity: 0.90
    })
  });

  const attackRes = router.route(attackClause, {
    primaryDomain: "MUSICAL_DAO",
    domainWeights: { MUSICAL_DAO: 0.90 }
  });

  const attackItem = attackRes.selectedContributions.find((c) => c.sourceSpanZh === "音波杀敌");
  assert.ok(attackItem, "Must resolve sonic acoustic attack");
  assert.equal(attackItem.targetSlot, STYLE_SLOTS.MUSICAL_ATTACK);
});

test("Wave B - 9. Tribulation & Warfare: resolves cosmic heavenly lightning and siege war drums", () => {
  const router = createStylistRouter();

  // Tribulation Test
  const tribClause = createClauseIR({
    id: "cl_trib_01",
    sourceZh: "紫霄神雷，天地异象，突破瓶颈！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.95, RESOLUTE: 0.90 },
      valence: 0.20,
      intensity: 0.90
    })
  });

  const tribRes = router.route(tribClause, {
    primaryDomain: "TRIBULATION_BREAKTHROUGH",
    domainWeights: { TRIBULATION_BREAKTHROUGH: 0.90 }
  });

  assert.ok(tribRes.activeProviders.includes("tribulation-provider"));
  const thunder = tribRes.selectedContributions.find((c) => c.sourceSpanZh === "紫霄神雷");
  const phenom = tribRes.selectedContributions.find((c) => c.sourceSpanZh === "天地异象");
  const breakThru = tribRes.selectedContributions.find((c) => c.sourceSpanZh === "突破瓶颈");
  assert.ok(thunder, "Must resolve purple celestial lightning");
  assert.ok(phenom, "Must resolve celestial phenomenon");
  assert.ok(breakThru, "Must resolve cultivation breakthrough");
  assert.equal(thunder.targetSlot, STYLE_SLOTS.TRIBULATION_LIGHTNING);
  assert.equal(phenom.targetSlot, STYLE_SLOTS.CELESTIAL_PHENOMENON);
  assert.equal(breakThru.targetSlot, STYLE_SLOTS.REALM_BREAKTHROUGH);

  // Warfare Test
  const warClause = createClauseIR({
    id: "cl_war_01",
    sourceZh: "擂鼓助威，千军万马冲锋，血战沙场！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.95, WRATH: 0.85 },
      valence: -0.10,
      intensity: 0.95
    })
  });

  const warRes = router.route(warClause, {
    primaryDomain: "WARFARE_SIEGE",
    domainWeights: { WARFARE_SIEGE: 0.90 }
  });

  assert.ok(warRes.activeProviders.includes("warfare-provider"));
  const drums = warRes.selectedContributions.find((c) => c.sourceSpanZh === "擂鼓助威");
  const charge = warRes.selectedContributions.find((c) => c.sourceSpanZh === "千军万马冲锋");
  const bloody = warRes.selectedContributions.find((c) => c.sourceSpanZh === "血战沙场");
  assert.ok(drums, "Must resolve war drums");
  assert.ok(charge, "Must resolve troop charge");
  assert.ok(bloody, "Must resolve bloody warfare");
  assert.equal(drums.targetSlot, STYLE_SLOTS.WAR_DRUMS);
  assert.equal(charge.targetSlot, STYLE_SLOTS.WARFARE_CHARGE);
  assert.equal(bloody.targetSlot, STYLE_SLOTS.BLOODY_BATTLEFIELD);
});

test("Wave B - 10. Multi-Domain & Adversarial: Supernatural + Warfare + Transcendence orthogonal coexistence", () => {
  const router = createStylistRouter();

  const multiClause = createClauseIR({
    id: "cl_multi_wave_b",
    sourceZh: "千军万马冲锋，阴兵借道，弹指千年！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.90, RESOLUTE: 0.85 },
      valence: -0.20,
      intensity: 0.85
    })
  });

  const context = {
    primaryDomain: "WARFARE_SIEGE",
    domainWeights: {
      WARFARE_SIEGE: 0.80,
      SUPERNATURAL_HORROR: 0.80,
      TRANSCENDENCE_TIME: 0.70
    }
  };

  const res = router.route(multiClause, context);

  // All 3 orthogonal slots must be preserved
  const warSlot = res.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.WARFARE_CHARGE);
  const horrorSlot = res.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.NETHERWORLD_PARADE);
  const timeSlot = res.selectedContributions.find((c) => c.targetSlot === STYLE_SLOTS.TRANSCENDENCE_TIME);

  assert.ok(warSlot, "Warfare charge slot must be preserved");
  assert.ok(horrorSlot, "Yin soldier slot must be preserved");
  assert.ok(timeSlot, "Transcendence time skip slot must be preserved");
});

test("Wave B - 11. Anti-Overwriting & Golden Negative: Minimal mundane text does not inflate into cosmic horrors", () => {
  const router = createStylistRouter();

  // "He listened to ordinary flute music while having dinner"
  const mundaneClause = createClauseIR({
    id: "cl_mundane_01",
    sourceZh: "他一边吃晚饭一边听普通笛声。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.90, NEUTRAL: 0.90 },
      valence: 0.20,
      intensity: 0.20
    }),
    invariants: { allowMetaphor: false, maxAdjectives: 0 }
  });

  const mundaneContext = {
    primaryDomain: "MUNDANE_DAILY",
    domainWeights: { MUNDANE_DAILY: 0.90, MUSICAL_DAO: 0.0, TRIBULATION_BREAKTHROUGH: 0.0 }
  };

  const res = router.route(mundaneClause, mundaneContext);

  assert.equal(res.selectedContributions.length, 0, "No provider should hallucinate epic cosmic phenomena on mundane daily clauses");
});
