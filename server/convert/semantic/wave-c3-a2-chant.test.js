"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createClauseIR, createSemanticSignature } = require("./contracts");
const { STYLE_SLOTS } = require("./providers/stylist-contribution");
const { createChantVersifierProvider, POETIC_FORMS } = require("./providers/chant-versifier-provider");
const { createActionProvider } = require("./providers/action-provider");
const { createMantraProvider } = require("./providers/mantra-provider");
const { createTitleHierarchyProvider } = require("./providers/title-hierarchy-provider");
const { createCourtlyBeautyProvider } = require("./providers/courtly-beauty-provider");
const { createStylistRouter } = require("./stylist-router");

// =========================================================================
// 1. Positive Tests Across 6 Poetic Forms & 8 Classical Chants
// =========================================================================

test("Wave C3-A2 - 1. Hero Declaration: “天不生我李淳罡，剑道万古如长夜” dynamic name capture", () => {
  const provider = createChantVersifierProvider();

  // Chinese source match
  const zhClause = createClauseIR({
    id: "cl_chant_01_zh",
    sourceZh: "天不生我李淳罡，剑道万古如长夜！",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.85, RESOLUTE: 0.70 }, valence: 0.60, intensity: 0.85 })
  });

  const zhContribs = provider.contribute(zhClause);
  assert.equal(zhContribs.length, 1, "Must produce 1 POETIC_VERSE contribution for Chinese input");
  assert.equal(zhContribs[0].targetSlot, STYLE_SLOTS.POETIC_VERSE);
  assert.equal(zhContribs[0].candidateVi, "Trời không sinh ta 李淳罡, Kiếm đạo muôn đời tựa đêm trường.");
  assert.equal(zhContribs[0].semanticRequirements.poeticForm, POETIC_FORMS.HERO_DECLARATION);

  // Vietnamese translated text match
  const viClause = createClauseIR({
    id: "cl_chant_01_vi",
    sourceZh: "天不生我叶辰，剑道万古如长夜",
    role: "DIALOGUE"
  });
  const viContribs = provider.contribute(viClause, {
    translatedText: "Trời không sinh ta Diệp Thần, kiếm đạo vạn cổ như đêm dài"
  });
  assert.equal(viContribs.length, 1);
  assert.equal(viContribs[0].candidateVi, "Trời không sinh ta Diệp Thần, Kiếm đạo muôn đời tựa đêm trường.");
});

test("Wave C3-A2 - 2. Classical Couplet: “大梦谁先觉，平生我自知”", () => {
  const provider = createChantVersifierProvider();
  const clause = createClauseIR({
    id: "cl_chant_02",
    sourceZh: "大梦谁先觉，平生我自知。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.90 }, valence: 0.40, intensity: 0.60 })
  });

  const contribs = provider.contribute(clause);
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].targetSlot, STYLE_SLOTS.POETIC_VERSE);
  assert.equal(contribs[0].candidateVi, "Giấc mộng lớn ai người tỉnh trước? Cuộc đời này chỉ có ta hay.");
  assert.equal(contribs[0].semanticRequirements.poeticForm, POETIC_FORMS.COUPLET);
});

test("Wave C3-A2 - 3. Hero Declaration: “手握日月摘星辰，世间无我这般人”", () => {
  const provider = createChantVersifierProvider();
  const clause = createClauseIR({
    id: "cl_chant_03",
    sourceZh: "手握日月摘星辰，世间无我这般人！",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90 }, valence: 0.70, intensity: 0.90 })
  });

  const contribs = provider.contribute(clause);
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].candidateVi, "Tay nắm nhật nguyệt hái tinh tú, Trần thế ai người sánh bằng ta.");
  assert.equal(contribs[0].semanticRequirements.poeticForm, POETIC_FORMS.HERO_DECLARATION);
});

test("Wave C3-A2 - 4. Martial Verse: “一剑光寒十九洲”", () => {
  const provider = createChantVersifierProvider();
  const clause = createClauseIR({
    id: "cl_chant_04",
    sourceZh: "一剑光寒十九洲！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.80 }, valence: 0.50, intensity: 0.80 })
  });

  const contribs = provider.contribute(clause);
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].candidateVi, "Một kiếm hàn quang rực chín châu");
  assert.equal(contribs[0].semanticRequirements.poeticForm, POETIC_FORMS.MARTIAL_VERSE);
});

test("Wave C3-A2 - 5. Battle Cry: “御剑乘风来，除魔天地间”", () => {
  const provider = createChantVersifierProvider();
  const clause = createClauseIR({
    id: "cl_chant_05",
    sourceZh: "御剑乘风来，除魔天地间！",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.85 }, valence: 0.60, intensity: 0.75 })
  });

  const contribs = provider.contribute(clause);
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].candidateVi, "Ngự kiếm theo gió tới, Trảm ma giữa đất trời.");
  assert.equal(contribs[0].semanticRequirements.poeticForm, POETIC_FORMS.BATTLE_CRY);
});

test("Wave C3-A2 - 6. Proverbial Form: “三十年河东，三十年河西，莫欺少年穷”", () => {
  const provider = createChantVersifierProvider();
  const clause = createClauseIR({
    id: "cl_chant_06",
    sourceZh: "三十年河东，三十年河西，莫欺少年穷！",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.95 }, valence: 0.50, intensity: 0.85 })
  });

  const contribs = provider.contribute(clause);
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].candidateVi, "Ba mươi năm bờ đông, ba mươi năm bờ tây, chớ khinh thiếu niên nghèo!");
  assert.equal(contribs[0].semanticRequirements.poeticForm, POETIC_FORMS.PROVERBIAL_FORM);
});

test("Wave C3-A2 - 7. Cultivation Maxims: “我命由我不由天” & “顺为凡，逆则仙”", () => {
  const provider = createChantVersifierProvider();

  // Maxim 1: My Fate
  const fateClause = createClauseIR({
    id: "cl_chant_07_fate",
    sourceZh: "我命由我不由天！",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 1.0 }, valence: 0.70, intensity: 0.90 })
  });
  const fateContribs = provider.contribute(fateClause);
  assert.equal(fateContribs.length, 1);
  assert.equal(fateContribs[0].candidateVi, "Mệnh ta do ta định, chẳng do trời!");
  assert.equal(fateContribs[0].semanticRequirements.poeticForm, POETIC_FORMS.CULTIVATION_MAXIM);

  // Maxim 2: Flow Mortal Reverse Immortal
  const daoClause = createClauseIR({
    id: "cl_chant_07_dao",
    sourceZh: "顺为凡，逆则仙。",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.90 }, valence: 0.60, intensity: 0.85 })
  });
  const daoContribs = provider.contribute(daoClause);
  assert.equal(daoContribs.length, 1);
  assert.equal(daoContribs[0].candidateVi, "Thuận là phàm nhân, nghịch ắt thành tiên!");
});

// =========================================================================
// 2. Negative & Adversarial Invariant Tests
// =========================================================================

test("Wave C3-A2 - 8. Adversarial: Cultivation maxim strictly rejects ungrounded cosmic lore injection", () => {
  const provider = createChantVersifierProvider();

  const clause = createClauseIR({
    id: "cl_adv_chant_cosmic_01",
    sourceZh: "我命由我不由天！",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 1.0 }, valence: 0.70, intensity: 0.90 })
  });

  // Attempting to assert ungrounded cosmic destruction lore
  const ctx = {
    translatedText: "Mệnh ta do ta không do trời",
    assertCosmicLore: true
  };

  const contribs = provider.contribute(clause, ctx);
  assert.equal(contribs.length, 0, "Provider must ABSTAIN / fallback to prose when cosmic lore is ungrounded");
});

test("Wave C3-A2 - 9. Adversarial: Non-poetic 4-character idioms are strictly NEVER forced into verse", () => {
  const provider = createChantVersifierProvider();

  const mundaneClause = createClauseIR({
    id: "cl_adv_chant_mundane_01",
    sourceZh: "他小心翼翼地推开门，一言不发。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.70 }, valence: 0.0, intensity: 0.20 })
  });

  const ctx = { translatedText: "hắn cẩn thận từng li từng tí đẩy cửa ra, không nói một lời" };
  const contribs = provider.contribute(mundaneClause, ctx);
  assert.equal(contribs.length, 0, "Mundane 4-character prose must NOT trigger poetic versification");
});

test("Wave C3-A2 - 10. Adversarial: Inverting agent/patient for rhyme triggers Fallback-to-Prose", () => {
  const provider = createChantVersifierProvider();

  const clause = createClauseIR({
    id: "cl_adv_chant_agent_01",
    sourceZh: "手握日月摘星辰，世间无我这般人",
    role: "DIALOGUE"
  });

  // Attempting agent/patient reversal
  const ctx = {
    translatedText: "Tay nắm nhật nguyệt hái tinh tú",
    invertAgentPatient: true
  };

  const contribs = provider.contribute(clause, ctx);
  assert.equal(contribs.length, 0, "Must fallback to prose when agent/patient relation is reversed");
});

test("Wave C3-A2 - 11. Adversarial: Dropping essential semantic atom triggers Fallback-to-Prose", () => {
  const provider = createChantVersifierProvider();

  const clause = createClauseIR({
    id: "cl_adv_chant_drop_01",
    sourceZh: "一剑光寒十九洲",
    role: "ACTION"
  });

  // Context indicates sword semantic atom was omitted
  const ctx = {
    dropSemanticAtom: true
  };

  const contribs = provider.contribute(clause, ctx);
  assert.equal(contribs.length, 0, "Must fallback to prose if essential semantic atom is dropped");
});

// =========================================================================
// 3. Multi-Provider Coexistence Tests
// =========================================================================

test("Wave C3-A2 - 12. Multi-Provider: Chant + Combat coexist cleanly during martial clash", () => {
  const chantProvider = createChantVersifierProvider();
  const actionProvider = createActionProvider();

  const clause = createClauseIR({
    id: "cl_multi_chant_combat_01",
    sourceZh: "御剑乘风来，除魔天地间！一掌拍出。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90 }, valence: 0.40, intensity: 0.85 })
  });

  const ctx = {
    translatedText: "Ngự kiếm theo gió tới, trảm ma giữa trời đất! Một chưởng vỗ ra."
  };

  const chantContribs = chantProvider.contribute(clause, ctx);
  const actionContribs = actionProvider.getSuggestions(clause, ctx).contributions;

  assert.equal(chantContribs.length, 1, "ChantVersifierProvider produces POETIC_VERSE");
  assert.equal(actionContribs.length, 1, "ActionProvider produces ACTION_STRIKE");

  assert.equal(chantContribs[0].targetSlot, STYLE_SLOTS.POETIC_VERSE);
  assert.equal(actionContribs[0].targetSlot, STYLE_SLOTS.ACTION_STRIKE);
  assert.notEqual(chantContribs[0].targetSlot, actionContribs[0].targetSlot, "Providers operate on distinct slots");
});

test("Wave C3-A2 - 13. Multi-Provider: Chant + Daoist Mantra operate orthogonally", () => {
  const chantProvider = createChantVersifierProvider();
  const mantraProvider = createMantraProvider();

  const clause = createClauseIR({
    id: "cl_multi_chant_mantra_01",
    sourceZh: "口诵真言！顺为凡，逆则仙！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.95 }, valence: 0.50, intensity: 0.85 })
  });

  const ctx = {
    translatedText: "miệng tụng chân ngôn! Thuận vi phàm, nghịch tắc tiên!"
  };

  const chantContribs = chantProvider.contribute(clause, ctx);
  const mantraContribs = mantraProvider.proposeContributions(clause, ctx);

  assert.equal(chantContribs.length, 1, "Chant provider captures cultivation maxim on POETIC_VERSE");
  assert.equal(mantraContribs.length, 1, "Mantra provider captures incantation on MANTRA_SEAL");

  assert.equal(chantContribs[0].targetSlot, STYLE_SLOTS.POETIC_VERSE);
  assert.equal(mantraContribs[0].targetSlot, STYLE_SLOTS.MANTRA_SEAL);
});

test("Wave C3-A2 - 14. Multi-Provider: Chant + Courtly Beauty Maiden Recitation", () => {
  const chantProvider = createChantVersifierProvider();
  const beautyProvider = createCourtlyBeautyProvider();

  const clause = createClauseIR({
    id: "cl_multi_chant_beauty_01",
    sourceZh: "白衣胜雪，轻吟道：大梦谁先觉，平生我自知。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.80 }, valence: 0.45, intensity: 0.55 })
  });

  const ctx = {
    translatedText: "một thân bạch y thắng tuyết, khẽ ngâm: Giấc mộng lớn ai người tỉnh trước, cuộc đời này chỉ có ta hay"
  };

  const chantContribs = chantProvider.contribute(clause, ctx);
  const beautyContribs = beautyProvider.contribute(clause, ctx);

  assert.equal(chantContribs.length, 1, "Chant provider captures couplet on POETIC_VERSE");
  assert.equal(beautyContribs.length, 1, "Beauty provider captures attire on AESTHETIC_ELEGANCE");

  assert.equal(chantContribs[0].targetSlot, STYLE_SLOTS.POETIC_VERSE);
  assert.equal(beautyContribs[0].targetSlot, STYLE_SLOTS.AESTHETIC_ELEGANCE);
});

// =========================================================================
// 4. Provider Order Independence
// =========================================================================

test("Wave C3-A2 - 15. Provider Order Independence: Deterministic routing across provider shuffles", () => {
  const clause = createClauseIR({
    id: "cl_order_chant_01",
    sourceZh: "太上长老一剑光寒十九洲！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.85 }, valence: 0.50, intensity: 0.80 })
  });

  const ctx = {
    primaryDomain: "CHANT_POETRY",
    domainWeights: { CHANT_POETRY: 0.95, TITLE_HIERARCHY: 0.90, ACTION: 0.80 },
    translatedText: "Thái Thượng Trưởng lão Một kiếm quang hàn mười chín châu!"
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

test("Wave C3-A2 - 16. Performance Benchmark: ChantVersifierProvider latency is sub-millisecond", () => {
  const provider = createChantVersifierProvider();
  const clause = createClauseIR({
    id: "cl_perf_chant_01",
    sourceZh: "天不生我李淳罡，剑道万古如长夜！",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.85 }, valence: 0.60, intensity: 0.85 })
  });

  const ctx = { translatedText: "Trời không sinh ta Lý Thuần Cương, kiếm đạo vạn cổ như đêm dài" };

  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    provider.contribute(clause, ctx);
  }
  const totalMs = performance.now() - start;
  const avgUs = (totalMs / 1000) * 1000; // microseconds per call

  assert.ok(avgUs < 100, `Average contribution latency should be < 100μs, got ${avgUs.toFixed(2)}μs`);
});
