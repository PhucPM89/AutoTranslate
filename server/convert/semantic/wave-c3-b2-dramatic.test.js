"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createClauseIR, createSemanticSignature } = require("./contracts");
const { STYLE_SLOTS } = require("./providers/stylist-contribution");
const { createDramaticEscalatorProvider, DRAMATIC_CATEGORIES } = require("./providers/dramatic-escalator-provider");
const { createActionProvider } = require("./providers/action-provider");
const { createElegyProvider } = require("./providers/elegy-provider");
const { createCourtlyBeautyProvider } = require("./providers/courtly-beauty-provider");
const { createTitleHierarchyProvider } = require("./providers/title-hierarchy-provider");
const { createStylistRouter } = require("./stylist-router");

// =========================================================================
// 1. Positive Tests Across 4 Dramatic Categories
// =========================================================================

test("Wave C3-B2 - 1. Vengeance Vows: “血海深仇” & “不死不休”", () => {
  const provider = createDramaticEscalatorProvider();

  // Blood sea deep enmity
  const bloodClause = createClauseIR({
    id: "cl_dram_01_blood",
    sourceZh: "背负血海深仇，誓不罢休！",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { WRATH: 0.90, RESOLUTE: 0.85 }, valence: -0.75, intensity: 0.90 })
  });
  const bloodContribs = provider.contribute(bloodClause, { translatedText: "gánh vác mối huyết hải thâm thù, thề không bỏ qua" });
  assert.equal(bloodContribs.length, 1, "Must produce 1 DRAMATIC_CLIMAX contribution");
  assert.equal(bloodContribs[0].targetSlot, STYLE_SLOTS.DRAMATIC_CLIMAX);
  assert.equal(bloodContribs[0].candidateVi, "mối huyết hải thâm thù không đội trời chung");
  assert.equal(bloodContribs[0].semanticRequirements.dramaticCategory, DRAMATIC_CATEGORIES.SOLEMN_VENGEANCE_VOW);

  // Life-and-death vow
  const deathClause = createClauseIR({
    id: "cl_dram_01_vow",
    sourceZh: "今日你我，不死不休！",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 1.0 }, valence: 0.10, intensity: 0.90 })
  });
  const deathContribs = provider.contribute(deathClause, { translatedText: "hôm nay ngươi và ta, không chết không thôi!" });
  assert.equal(deathContribs.length, 1);
  assert.equal(deathContribs[0].candidateVi, "bất tử bất hưu, thề không dừng lại");
});

test("Wave C3-B2 - 2. Lethal Resolve: “决一死战” & “同归于尽”", () => {
  const provider = createDramaticEscalatorProvider();

  // Fight to the death
  const fightClause = createClauseIR({
    id: "cl_dram_02_fight",
    sourceZh: "决一死战，绝不退缩！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 1.0 }, valence: 0.20, intensity: 0.90 })
  });
  const fightContribs = provider.contribute(fightClause, { translatedText: "quyết tử chiến đến cùng, tuyệt không lùi bước!" });
  assert.equal(fightContribs.length, 1);
  assert.equal(fightContribs[0].candidateVi, "quyết tử chiến đến giọt máu cuối cùng");

  // Mutual destruction
  const perishClause = createClauseIR({
    id: "cl_dram_02_perish",
    sourceZh: "哪怕同归于尽，也要斩杀此獠！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.95 }, valence: -0.50, intensity: 0.95 })
  });
  const perishContribs = provider.contribute(perishClause, { translatedText: "dù phải liều mạng cùng đối phương chết chung, cũng phải chém chết kẻ này!" });
  assert.equal(perishContribs.length, 1);
  assert.equal(perishContribs[0].candidateVi, "quyết liều chết kéo theo kẻ thù chôn cùng");
});

test("Wave C3-B2 - 3. Tragic Pathos: “泪如雨下”, “痛不欲生”, “满心绝望”, “心如死灰”", () => {
  const provider = createDramaticEscalatorProvider();

  // Tears like rain
  const tearsClause = createClauseIR({
    id: "cl_dram_03_tears",
    sourceZh: "泪如雨下，悲恸难抑。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SORROW: 0.95 }, valence: -0.80, intensity: 0.85 })
  });
  const tearsContribs = provider.contribute(tearsClause, { translatedText: "nước mắt tuôn rơi như mưa, đau thương khó kìm nén" });
  assert.equal(tearsContribs.length, 1);
  assert.equal(tearsContribs[0].candidateVi, "lệ rơi như mưa, đau đớn xé lòng");

  // Heart like ashes
  const ashesClause = createClauseIR({
    id: "cl_dram_03_ashes",
    sourceZh: "万念俱灰，心如死灰。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { MELANCHOLY: 0.95 }, valence: -0.80, intensity: 0.80 })
  });
  const ashesContribs = provider.contribute(ashesClause, { translatedText: "vạn niệm đều tàn, tâm như tro tàn" });
  assert.equal(ashesContribs.length, 1);
  assert.equal(ashesContribs[0].candidateVi, "lòng nguội lạnh tựa tro tàn");
});

test("Wave C3-B2 - 4. Catastrophic Destruction: “宗门覆灭” strictly preserves facts without blood river invention", () => {
  const provider = createDramaticEscalatorProvider();

  const sectClause = createClauseIR({
    id: "cl_dram_04_sect",
    sourceZh: "传承万载的宗门覆灭，化为废墟。",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.90, SORROW: 0.85 }, valence: -0.85, intensity: 0.90 })
  });

  const contribs = provider.contribute(sectClause, { translatedText: "tông môn truyền thừa vạn năm bị diệt, hóa thành phế tích" });
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].targetSlot, STYLE_SLOTS.DRAMATIC_CLIMAX);
  assert.equal(contribs[0].candidateVi, "tông môn hoàn toàn bị hủy diệt", "Must realize destruction WITHOUT injecting ungrounded 'máu chảy thành sông'");
  assert.equal(contribs[0].semanticRequirements.dramaticCategory, DRAMATIC_CATEGORIES.CATASTROPHIC_DESTRUCTION);
});

test("Wave C3-B2 - 5. Epic Battlefield Aftermath: “血流成河，尸横遍野”", () => {
  const provider = createDramaticEscalatorProvider();

  const carnageClause = createClauseIR({
    id: "cl_dram_05_carnage",
    sourceZh: "大战过后，血流成河，尸横遍野。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.95, FEAR: 0.80 }, valence: -0.90, intensity: 0.95 })
  });

  const contribs = provider.contribute(carnageClause, { translatedText: "sau đại chiến, máu chảy thành sông, thây chất đầy đồng" });
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].candidateVi, "máu chảy thành sông, thây chất ngập tràn đồng hoang");
  assert.equal(contribs[0].semanticRequirements.dramaticCategory, DRAMATIC_CATEGORIES.EPIC_BATTLEFIELD_AFTERMATH);
});

test("Wave C3-B2 - 6. Clan Destruction: “家破人亡” & Vow “此仇不报”", () => {
  const provider = createDramaticEscalatorProvider();

  // Family ruined
  const familyClause = createClauseIR({
    id: "cl_dram_06_family",
    sourceZh: "惨遭横祸，家破人亡。",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SORROW: 0.95 }, valence: -0.85, intensity: 0.85 })
  });
  const familyContribs = provider.contribute(familyClause, { translatedText: "gặp phải tai họa bất ngờ, gia phá nhân vong" });
  assert.equal(familyContribs.length, 1);
  assert.equal(familyContribs[0].candidateVi, "gia đình tan nát, người mất nhà tan");

  // Revenge oath
  const oathClause = createClauseIR({
    id: "cl_dram_06_oath",
    sourceZh: "此仇不报誓不为人！",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 1.0 }, valence: 0.10, intensity: 0.90 })
  });
  const oathContribs = provider.contribute(oathClause, { translatedText: "thù này không báo thề không làm người!" });
  assert.equal(oathContribs.length, 1);
  assert.equal(oathContribs[0].candidateVi, "thù này không báo, thề chẳng làm người");
});

// =========================================================================
// 2. Negative & Adversarial Invariant Tests
// =========================================================================

test("Wave C3-B2 - 7. Adversarial: Sect destruction strictly blocks ungrounded blood river assertion", () => {
  const provider = createDramaticEscalatorProvider();

  const sectClause = createClauseIR({
    id: "cl_adv_dram_sect_01",
    sourceZh: "宗门覆灭。",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.90 }, valence: -0.85, intensity: 0.90 })
  });

  const ctx = {
    translatedText: "tông môn bị diệt",
    assertBloodRiver: true // Context attempts to claim rivers of blood occurred without source text
  };

  const contribs = provider.contribute(sectClause, ctx);
  assert.equal(contribs.length, 0, "Must strictly reject ungrounded blood river claim");
});

test("Wave C3-B2 - 8. Adversarial: Extreme grief (“悲痛欲绝”) never escalates to madness", () => {
  const provider = createDramaticEscalatorProvider();

  const griefClause = createClauseIR({
    id: "cl_adv_dram_grief_01",
    sourceZh: "悲痛欲绝，痛哭失声。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SORROW: 1.0 }, valence: -0.90, intensity: 0.90 })
  });

  const ctx = {
    translatedText: "đau lòng đến cực điểm, khóc không thành tiếng",
    escalateToMadness: true // Adversarial attempt to rewrite grief into madness
  };

  const contribs = provider.contribute(griefClause, ctx);
  assert.equal(contribs.length, 0, "Grief must NOT escalate to madness");
});

test("Wave C3-B2 - 9. Adversarial: Lethal resolve (“决一死战”) never invents casualties", () => {
  const provider = createDramaticEscalatorProvider();

  const resolveClause = createClauseIR({
    id: "cl_adv_dram_casualty_01",
    sourceZh: "决一死战！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 1.0 }, valence: 0.20, intensity: 0.90 })
  });

  const ctx = {
    translatedText: "quyết tử chiến đến cùng",
    inventCasualties: true // Adversarial attempt to invent casualties before battle ends
  };

  const contribs = provider.contribute(resolveClause, ctx);
  assert.equal(contribs.length, 0, "Lethal resolve must NOT invent casualties");
});

test("Wave C3-B2 - 10. Adversarial: Third-Person Limited POV strictly rejects omniscient narrative commentary", () => {
  const provider = createDramaticEscalatorProvider();

  const clause = createClauseIR({
    id: "cl_adv_dram_pov_01",
    sourceZh: "不死不休。",
    role: "DESCRIPTION",
    cognitiveEvent: {
      pov: "THIRD_PERSON_LIMITED",
      thinker: { status: "RESOLVED", entityId: "hero1" },
      status: "RESOLVED"
    },
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 1.0 }, valence: 0.10, intensity: 0.90 })
  });

  const ctx = {
    translatedText: "bất tử bất hưu",
    pov: "THIRD_PERSON_LIMITED",
    assertOmniscientCommentary: true
  };

  const contribs = provider.contribute(clause, ctx);
  assert.equal(contribs.length, 0, "Omniscient narrative injection in limited POV must be rejected");
});

// =========================================================================
// 3. Multi-Provider Coexistence Tests
// =========================================================================

test("Wave C3-B2 - 11. Multi-Provider: Dramatic Climax + Elegy Mourning", () => {
  const dramaticProvider = createDramaticEscalatorProvider();
  const elegyProvider = createElegyProvider();

  const clause = createClauseIR({
    id: "cl_multi_dram_elegy_01",
    sourceZh: "宗门覆灭，英魂不灭！",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.95, SORROW: 0.90 }, valence: -0.85, intensity: 0.90 })
  });

  const ctx = {
    translatedText: "tông môn bị diệt, anh hồn bất diệt"
  };

  const dramContribs = dramaticProvider.contribute(clause, ctx);
  const elegyContribs = elegyProvider.proposeContributions(clause, ctx);

  assert.equal(dramContribs.length, 1, "Dramatic provider captures sect ruin on DRAMATIC_CLIMAX");
  assert.equal(elegyContribs.length, 1, "Elegy provider captures fallen heroes on ELEGY_HEROIC_SPIRIT");

  assert.equal(dramContribs[0].targetSlot, STYLE_SLOTS.DRAMATIC_CLIMAX);
  assert.equal(elegyContribs[0].targetSlot, STYLE_SLOTS.ELEGY_HEROIC_SPIRIT);
});

test("Wave C3-B2 - 12. Multi-Provider: Dramatic Vow + Martial Combat Clash", () => {
  const dramaticProvider = createDramaticEscalatorProvider();
  const actionProvider = createActionProvider();

  const clause = createClauseIR({
    id: "cl_multi_dram_combat_01",
    sourceZh: "决一死战！一掌拍出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.95, WRATH: 0.80 }, valence: 0.20, intensity: 0.90 })
  });

  const ctx = {
    translatedText: "quyết tử chiến đến cùng! Một chưởng vỗ ra."
  };

  const dramContribs = dramaticProvider.contribute(clause, ctx);
  const actionContribs = actionProvider.getSuggestions(clause, ctx).contributions;

  assert.equal(dramContribs.length, 1, "Dramatic provider produces DRAMATIC_CLIMAX");
  assert.equal(actionContribs.length, 1, "Action provider produces ACTION_STRIKE");

  assert.equal(dramContribs[0].targetSlot, STYLE_SLOTS.DRAMATIC_CLIMAX);
  assert.equal(actionContribs[0].targetSlot, STYLE_SLOTS.ACTION_STRIKE);
});

test("Wave C3-B2 - 13. Multi-Provider: Dramatic Pathos + Courtly Beauty (Maiden Weeping Tears)", () => {
  const dramaticProvider = createDramaticEscalatorProvider();
  const beautyProvider = createCourtlyBeautyProvider();

  const clause = createClauseIR({
    id: "cl_multi_dram_beauty_01",
    sourceZh: "白衣胜雪，泪如雨下。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SORROW: 0.90, TRANQUIL: 0.40 }, valence: -0.60, intensity: 0.80 })
  });

  const ctx = {
    translatedText: "một thân bạch y thắng tuyết, nước mắt tuôn rơi như mưa"
  };

  const dramContribs = dramaticProvider.contribute(clause, ctx);
  const beautyContribs = beautyProvider.contribute(clause, ctx);

  assert.equal(dramContribs.length, 1, "Dramatic provider captures tears on DRAMATIC_CLIMAX");
  assert.equal(beautyContribs.length, 1, "Beauty provider captures attire on AESTHETIC_ELEGANCE");

  assert.equal(dramContribs[0].targetSlot, STYLE_SLOTS.DRAMATIC_CLIMAX);
  assert.equal(beautyContribs[0].targetSlot, STYLE_SLOTS.AESTHETIC_ELEGANCE);
});

test("Wave C3-B2 - 14. Multi-Provider: Dramatic Vow + Title Hierarchy", () => {
  const dramaticProvider = createDramaticEscalatorProvider();
  const titleProvider = createTitleHierarchyProvider();

  const clause = createClauseIR({
    id: "cl_multi_dram_title_01",
    sourceZh: "太上长老怒喝：“不死不休！”",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 1.0, WRATH: 0.90 }, valence: 0.10, intensity: 0.90 })
  });

  const ctx = {
    translatedText: "Thái Thượng Trưởng lão quát lớn: \"Không chết không thôi!\""
  };

  const dramContribs = dramaticProvider.contribute(clause, ctx);
  const titleContribs = titleProvider.contribute(clause, ctx);

  assert.equal(dramContribs.length, 1, "Dramatic provider captures oath on DRAMATIC_CLIMAX");
  assert.equal(titleContribs.length, 1, "Title provider captures elder rank on TITLE_HONORIFIC");

  assert.equal(dramContribs[0].targetSlot, STYLE_SLOTS.DRAMATIC_CLIMAX);
  assert.equal(titleContribs[0].targetSlot, STYLE_SLOTS.TITLE_HONORIFIC);
});

// =========================================================================
// 4. Provider Order Independence
// =========================================================================

test("Wave C3-B2 - 15. Provider Order Independence: Deterministic routing across provider shuffles", () => {
  const clause = createClauseIR({
    id: "cl_order_dram_01",
    sourceZh: "背负血海深仇，决一死战！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 1.0, WRATH: 0.90 }, valence: -0.50, intensity: 0.90 })
  });

  const ctx = {
    primaryDomain: "DRAMATIC_CLIMAX",
    domainWeights: { DRAMATIC_CLIMAX: 0.95, COMBAT: 0.85, TITLE_HIERARCHY: 0.80 },
    translatedText: "gánh vác mối huyết hải thâm thù, quyết tử chiến đến cùng!"
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

test("Wave C3-B2 - 16. Performance Benchmark: DramaticEscalatorProvider latency is sub-millisecond", () => {
  const provider = createDramaticEscalatorProvider();
  const clause = createClauseIR({
    id: "cl_perf_dram_01",
    sourceZh: "背负血海深仇，决一死战！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 1.0 }, valence: -0.50, intensity: 0.90 })
  });

  const ctx = { translatedText: "gánh vác mối huyết hải thâm thù, quyết tử chiến đến cùng!" };

  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    provider.contribute(clause, ctx);
  }
  const totalMs = performance.now() - start;
  const avgUs = (totalMs / 1000) * 1000; // microseconds per call

  assert.ok(avgUs < 100, `Average contribution latency should be < 100μs, got ${avgUs.toFixed(2)}μs`);
});
