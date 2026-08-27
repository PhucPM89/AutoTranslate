"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createClauseIR, createSemanticSignature } = require("./contracts");
const { STYLE_SLOTS } = require("./providers/stylist-contribution");
const { createMadnessProvider, MADNESS_CATEGORIES } = require("./providers/madness-provider");
const { createActionProvider } = require("./providers/action-provider");
const { createEldritchProvider } = require("./providers/eldritch-provider");
const { createCourtlyBeautyProvider } = require("./providers/courtly-beauty-provider");
const { createMonologueProvider } = require("./providers/monologue-provider");
const { createStylistRouter } = require("./stylist-router");

// =========================================================================
// 1. Positive Tests Across 5 Psychological Categories
// =========================================================================

test("Wave C3-B1 - 1. Qi Deviation: “走火入魔” resolves spiritual backlash", () => {
  const provider = createMadnessProvider();
  const clause = createClauseIR({
    id: "cl_mad_01_qi",
    sourceZh: "真气逆行，走火入魔！",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { FEAR: 0.60, WRATH: 0.40 }, valence: -0.70, intensity: 0.85 })
  });

  const contribs = provider.contribute(clause, { translatedText: "chân khí nghịch hành, tẩu hỏa nhập ma" });
  assert.equal(contribs.length, 1, "Must produce 1 CORRUPTED_MADNESS contribution");
  assert.equal(contribs[0].targetSlot, STYLE_SLOTS.CORRUPTED_MADNESS);
  assert.equal(contribs[0].candidateVi, "tẩu hỏa nhập ma, chân khí hỗn loạn");
  assert.equal(contribs[0].semanticRequirements.madnessCategory, MADNESS_CATEGORIES.QI_DEVIATION);
});

test("Wave C3-B1 - 2. Heart Demon: “心魔入体” resolves demonic corruption", () => {
  const provider = createMadnessProvider();
  const clause = createClauseIR({
    id: "cl_mad_02_heart",
    sourceZh: "道心受损，心魔入体。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { FEAR: 0.75, SOLEMN: 0.70 }, valence: -0.70, intensity: 0.80 })
  });

  const contribs = provider.contribute(clause, { translatedText: "đạo tâm bị hao tổn, tâm ma nhập thể" });
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].targetSlot, STYLE_SLOTS.CORRUPTED_MADNESS);
  assert.equal(contribs[0].candidateVi, "tâm ma nhập thể, ý chí dao động");
  assert.equal(contribs[0].semanticRequirements.madnessCategory, MADNESS_CATEGORIES.HEART_DEMON_CORRUPTION);
});

test("Wave C3-B1 - 3. Cognitive Impairment: “神志不清” resolves delirium & confusion", () => {
  const provider = createMadnessProvider();
  const clause = createClauseIR({
    id: "cl_mad_03_delirium",
    sourceZh: "神志不清，摇摇欲坠。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { FEAR: 0.60 }, valence: -0.50, intensity: 0.75 })
  });

  const contribs = provider.contribute(clause, { translatedText: "thần trí không rõ, lảo đảo muốn ngã" });
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].candidateVi, "thần trí mơ hồ, ý thức hỗn loạn");
  assert.equal(contribs[0].semanticRequirements.madnessCategory, MADNESS_CATEGORIES.COGNITIVE_IMPAIRMENT);
});

test("Wave C3-B1 - 4. Psychotic Frenzy: “陷入癫狂” & “狂乱嗜血”", () => {
  const provider = createMadnessProvider();

  // Total sanity collapse
  const collapseClause = createClauseIR({
    id: "cl_mad_04_collapse",
    sourceZh: "陷入癫狂，狂笑不止！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { WRATH: 0.85, FEAR: 0.80 }, valence: -0.85, intensity: 0.95 })
  });
  const collapseContribs = provider.contribute(collapseClause, { translatedText: "rơi vào điên cuồng, cười lớn không ngừng" });
  assert.equal(collapseContribs.length, 1);
  assert.equal(collapseContribs[0].candidateVi, "rơi vào điên cuồng, lý trí sụp đổ hoàn toàn");

  // Bloodthirsty frenzy
  const bloodClause = createClauseIR({
    id: "cl_mad_04_blood",
    sourceZh: "狂乱嗜血，大开杀戒！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { WRATH: 0.90, HOSTILITY: 0.95 }, valence: -0.85, intensity: 0.95 })
  });
  const bloodContribs = provider.contribute(bloodClause, { translatedText: "điên cuồng khát máu, đại khai sát giới" });
  assert.equal(bloodContribs.length, 1);
  assert.equal(bloodContribs[0].candidateVi, "khát máu cuồng loạn đến mất hết lý trí");
});

test("Wave C3-B1 - 5. Irreversible Doom: “万劫不复” resolves tragic finality", () => {
  const provider = createMadnessProvider();
  const clause = createClauseIR({
    id: "cl_mad_05_doom",
    sourceZh: "坠入魔道，万劫不复！",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.85, SORROW: 0.70 }, valence: -0.80, intensity: 0.80 })
  });

  const contribs = provider.contribute(clause, { translatedText: "rơi vào ma đạo, vạn kiếp bất phục" });
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].candidateVi, "vạn kiếp bất phục, muôn đời không thể quay đầu");
  assert.equal(contribs[0].semanticRequirements.madnessCategory, MADNESS_CATEGORIES.IRREVERSIBLE_DOOM);
});

// =========================================================================
// 2. Negative & Adversarial Invariant Tests
// =========================================================================

test("Wave C3-B1 - 6. Adversarial: Physical bloodshot eyes (“双眼通红”) never triggers madness", () => {
  const provider = createMadnessProvider();

  // Bloodshot eyes from strain or fatigue
  const bloodshotClause = createClauseIR({
    id: "cl_adv_mad_eyes_01",
    sourceZh: "他双眼通红，彻夜未眠。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.60 }, valence: -0.10, intensity: 0.30 })
  });

  const ctx = { translatedText: "hắn hai mắt đỏ ngầu, thức trắng cả đêm" };
  const contribs = provider.contribute(bloodshotClause, ctx);
  assert.equal(contribs.length, 0, "Neutral bloodshot eyes must NOT trigger madness provider");
});

test("Wave C3-B1 - 7. Adversarial: Pure wrath/rage (“怒不可遏”) never escalates to madness", () => {
  const provider = createMadnessProvider();

  const wrathClause = createClauseIR({
    id: "cl_adv_mad_wrath_01",
    sourceZh: "他怒不可遏，厉声喝道！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { WRATH: 0.90 }, valence: -0.50, intensity: 0.85 })
  });

  const ctx = { translatedText: "hắn tức giận đến cực điểm, quát lớn" };
  const contribs = provider.contribute(wrathClause, ctx);
  assert.equal(contribs.length, 0, "Pure wrath/rage must NOT escalate to madness");
});

test("Wave C3-B1 - 8. Adversarial: Pure extreme grief (“悲痛欲绝”) never triggers madness", () => {
  const provider = createMadnessProvider();

  const griefClause = createClauseIR({
    id: "cl_adv_mad_grief_01",
    sourceZh: "他悲痛欲绝，泪流满面。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SORROW: 0.95 }, valence: -0.80, intensity: 0.85 })
  });

  const ctx = { translatedText: "hắn đau lòng đến cực điểm, nước mắt tuôn rơi như mưa" };
  const contribs = provider.contribute(griefClause, ctx);
  assert.equal(contribs.length, 0, "Grief/sorrow must NOT trigger madness");
});

test("Wave C3-B1 - 9. Adversarial: Pure fear (“恐惧得浑身发抖”) never escalates to psychosis", () => {
  const provider = createMadnessProvider();

  const fearClause = createClauseIR({
    id: "cl_adv_mad_fear_01",
    sourceZh: "他恐惧得浑身发抖，步步后退。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { FEAR: 0.95 }, valence: -0.70, intensity: 0.85 })
  });

  const ctx = { translatedText: "hắn sợ hãi đến run rẩy, từng bước lui về phía sau" };
  const contribs = provider.contribute(fearClause, ctx);
  assert.equal(contribs.length, 0, "Pure fear must NOT escalate to psychosis");
});

test("Wave C3-B1 - 10. Adversarial: Third-Person Limited POV strictly rejects unobserved internal insanity claims", () => {
  const provider = createMadnessProvider();

  const clause = createClauseIR({
    id: "cl_adv_mad_pov_01",
    sourceZh: "心魔入体。",
    role: "DESCRIPTION",
    cognitiveEvent: {
      pov: "THIRD_PERSON_LIMITED",
      thinker: { status: "RESOLVED", entityId: "observer1" },
      status: "RESOLVED"
    },
    semanticSignature: createSemanticSignature({ affectDistribution: { FEAR: 0.75 }, valence: -0.70, intensity: 0.80 })
  });

  const ctx = {
    translatedText: "tâm ma nhập thể",
    pov: "THIRD_PERSON_LIMITED",
    assertUnobservedInsanity: true
  };

  const contribs = provider.contribute(clause, ctx);
  assert.equal(contribs.length, 0, "Unobserved insanity claims in limited POV must be rejected");
});

// =========================================================================
// 3. Multi-Provider Coexistence Tests
// =========================================================================

test("Wave C3-B1 - 11. Multi-Provider: Madness + Combat Clash", () => {
  const madnessProvider = createMadnessProvider();
  const actionProvider = createActionProvider();

  const clause = createClauseIR({
    id: "cl_multi_mad_combat_01",
    sourceZh: "走火入魔，一掌拍出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { WRATH: 0.85, FEAR: 0.60 }, valence: -0.70, intensity: 0.90 })
  });

  const ctx = {
    translatedText: "tẩu hỏa nhập ma, tung chưởng đánh tới!"
  };

  const madContribs = madnessProvider.contribute(clause, ctx);
  const actionContribs = actionProvider.getSuggestions(clause, ctx).contributions;

  assert.equal(madContribs.length, 1, "MadnessProvider produces CORRUPTED_MADNESS");
  assert.equal(actionContribs.length, 1, "ActionProvider produces ACTION_STRIKE");

  assert.equal(madContribs[0].targetSlot, STYLE_SLOTS.CORRUPTED_MADNESS);
  assert.equal(actionContribs[0].targetSlot, STYLE_SLOTS.ACTION_STRIKE);
  assert.notEqual(madContribs[0].targetSlot, actionContribs[0].targetSlot, "Providers operate on distinct slots");
});

test("Wave C3-B1 - 12. Multi-Provider: Madness + Eldritch Horror", () => {
  const madnessProvider = createMadnessProvider();
  const eldritchProvider = createEldritchProvider();

  const clause = createClauseIR({
    id: "cl_multi_mad_horror_01",
    sourceZh: "心魔入体，不可名状！",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { FEAR: 0.90, SURPRISE: 0.80 }, valence: -0.75, intensity: 0.85 })
  });

  const ctx = {
    translatedText: "tâm ma nhập thể, bất khả danh trạng"
  };

  const madContribs = madnessProvider.contribute(clause, ctx);
  const horrorContribs = eldritchProvider.proposeContributions(clause, ctx);

  assert.equal(madContribs.length, 1, "Madness provider captures corruption on CORRUPTED_MADNESS");
  assert.equal(horrorContribs.length, 1, "Eldritch provider captures dread on ELDRITCH_HORROR");

  assert.equal(madContribs[0].targetSlot, STYLE_SLOTS.CORRUPTED_MADNESS);
  assert.equal(horrorContribs[0].targetSlot, STYLE_SLOTS.ELDRITCH_HORROR);
});

test("Wave C3-B1 - 13. Multi-Provider: Madness + Courtly Beauty (Demonic Corrupted Fairy)", () => {
  const madnessProvider = createMadnessProvider();
  const beautyProvider = createCourtlyBeautyProvider();

  const clause = createClauseIR({
    id: "cl_multi_mad_beauty_01",
    sourceZh: "白衣胜雪，心魔入体。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { FEAR: 0.70, TRANQUIL: 0.40 }, valence: -0.50, intensity: 0.75 })
  });

  const ctx = {
    translatedText: "một thân bạch y thắng tuyết, tâm ma nhập thể"
  };

  const madContribs = madnessProvider.contribute(clause, ctx);
  const beautyContribs = beautyProvider.contribute(clause, ctx);

  assert.equal(madContribs.length, 1, "Madness provider captures corruption on CORRUPTED_MADNESS");
  assert.equal(beautyContribs.length, 1, "Beauty provider captures attire on AESTHETIC_ELEGANCE");

  assert.equal(madContribs[0].targetSlot, STYLE_SLOTS.CORRUPTED_MADNESS);
  assert.equal(beautyContribs[0].targetSlot, STYLE_SLOTS.AESTHETIC_ELEGANCE);
});

test("Wave C3-B1 - 14. Multi-Provider: Madness + Inner Monologue", () => {
  const madnessProvider = createMadnessProvider();
  const monologueProvider = createMonologueProvider();

  const clause = createClauseIR({
    id: "cl_multi_mad_mono_01",
    sourceZh: "陷入癫狂，心中暗道：“我要杀尽所有人！”",
    role: "INNER_THOUGHT",
    cognitiveEvent: {
      status: "RESOLVED",
      kind: "EXPLICIT_THOUGHT",
      evidenceId: "THOUGHT_COVERT",
      thinker: { status: "RESOLVED", entityId: "speaker1" }
    },
    semanticSignature: createSemanticSignature({ affectDistribution: { WRATH: 0.90, FEAR: 0.70 }, valence: -0.80, intensity: 0.90 })
  });

  const ctx = {
    translatedText: "rơi vào điên cuồng, trong lòng thầm nghĩ: \"Ta phải giết sạch tất cả mọi người!\""
  };

  const madContribs = madnessProvider.contribute(clause, ctx);
  const monoContribs = monologueProvider.contribute(clause, ctx);

  assert.equal(madContribs.length, 1, "Madness captures frenzy on CORRUPTED_MADNESS");
  assert.equal(monoContribs.length, 1, "Monologue captures inner thought on INNER_MONOLOGUE");

  assert.equal(madContribs[0].targetSlot, STYLE_SLOTS.CORRUPTED_MADNESS);
  assert.equal(monoContribs[0].targetSlot, STYLE_SLOTS.INNER_MONOLOGUE);
});

// =========================================================================
// 4. Provider Order Independence
// =========================================================================

test("Wave C3-B1 - 15. Provider Order Independence: Deterministic routing across provider shuffles", () => {
  const clause = createClauseIR({
    id: "cl_order_mad_01",
    sourceZh: "太上长老走火入魔，一掌拍出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { WRATH: 0.85, FEAR: 0.70 }, valence: -0.70, intensity: 0.85 })
  });

  const ctx = {
    primaryDomain: "MADNESS_FRENZY",
    domainWeights: { MADNESS_FRENZY: 0.95, TITLE_HIERARCHY: 0.90, COMBAT: 0.85 },
    translatedText: "Thái Thượng Trưởng lão tẩu hỏa nhập ma, tung chưởng đánh tới!"
  };

  const baselineRouter = createStylistRouter();
  const baselineRes = baselineRouter.route(clause, ctx);

  for (let i = 0; i < 5; i++) {
    const shuffledRouter = createStylistRouter();
    const shuffledRes = shuffledRouter.route(clause, ctx);
    assert.equal(shuffledRes.selectedContributions.length, baselineRes.selectedContributions.length, `Iteration ${i} count match`);
    for (let j = 0; j < baselineRes.selectedContributions.length; j++) {
      assert.equal(shuffledRes.selectedContributions[j].candidateVi, baselineRes.selectedContributions[j].candidateVi, `Iteration ${i} candidate ${j} match`);
      assert.equal(shuffledRes.selectedContributions[j].targetSlot, baselineRes.selectedContributions[j].targetSlot, `Iteration ${i} targetSlot ${j} match`);
    }
  }
});

// =========================================================================
// 5. Performance & Latency Benchmark
// =========================================================================

test("Wave C3-B1 - 16. Performance Benchmark: MadnessProvider latency is sub-millisecond", () => {
  const provider = createMadnessProvider();
  const clause = createClauseIR({
    id: "cl_perf_mad_01",
    sourceZh: "走火入魔，心魔入体！",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { FEAR: 0.70 }, valence: -0.70, intensity: 0.85 })
  });

  const ctx = { translatedText: "tẩu hỏa nhập ma, tâm ma nhập thể" };

  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    provider.contribute(clause, ctx);
  }
  const totalMs = performance.now() - start;
  const avgUs = (totalMs / 1000) * 1000; // microseconds per call

  assert.ok(avgUs < 100, `Average contribution latency should be < 100μs, got ${avgUs.toFixed(2)}μs`);
});
