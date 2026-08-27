"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createClauseIR, createSemanticSignature } = require("./contracts");
const { STYLE_SLOTS, getSlotDefinition, SEMANTIC_ROLES, REALIZATION_DIMENSIONS } = require("./providers/stylist-contribution");
const { createCourtlyBeautyProvider, AESTHETIC_DIMENSIONS } = require("./providers/courtly-beauty-provider");
const { createTitleHierarchyProvider } = require("./providers/title-hierarchy-provider");
const { createSupernaturalProvider } = require("./providers/supernatural-provider");
const { createStylistRouter } = require("./stylist-router");

// =========================================================================
// 1. Positive Tests Across 9 Aesthetic Dimensions
// =========================================================================

test("Wave C3-A1 - 1. Clothing Dimension: “白衣胜雪” resolves snow-white celestial robes", () => {
  const provider = createCourtlyBeautyProvider();
  const clause = createClauseIR({
    id: "cl_beauty_clothing_01",
    sourceZh: "她一袭白衣胜雪，伫立风中。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.70 }, valence: 0.40, intensity: 0.50 })
  });

  const contribs = provider.contribute(clause, { translatedText: "nàng một thân bạch y thắng tuyết" });
  assert.equal(contribs.length, 1, "Must produce 1 AESTHETIC_ELEGANCE contribution");
  assert.equal(contribs[0].targetSlot, STYLE_SLOTS.AESTHETIC_ELEGANCE);
  assert.equal(contribs[0].candidateVi, "tà áo trắng tinh khôi thanh khiết tựa tuyết đầu mùa");
  assert.equal(contribs[0].semanticRequirements.aestheticDimension, AESTHETIC_DIMENSIONS.CLOTHING);
  assert.equal(contribs[0].introducedInformation.length, 0);
});

test("Wave C3-A1 - 2. Hair Dimension: “黑发如瀑” resolves flowing silky black hair", () => {
  const provider = createCourtlyBeautyProvider();
  const clause = createClauseIR({
    id: "cl_beauty_hair_01",
    sourceZh: "黑发如瀑，随风轻舞。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.65 }, valence: 0.35, intensity: 0.40 })
  });

  const contribs = provider.contribute(clause, { translatedText: "mái tóc đen như thác nước" });
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].targetSlot, STYLE_SLOTS.AESTHETIC_ELEGANCE);
  assert.equal(contribs[0].candidateVi, "suối tóc đen tuyền buông xõa mượt mà");
  assert.equal(contribs[0].semanticRequirements.aestheticDimension, AESTHETIC_DIMENSIONS.HAIR);
});

test("Wave C3-A1 - 3. Skin Dimension: “肤如凝脂” resolves translucent jade-like skin", () => {
  const provider = createCourtlyBeautyProvider();
  const clause = createClauseIR({
    id: "cl_beauty_skin_01",
    sourceZh: "肌肤胜雪，清冷绝尘。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.60 }, valence: 0.40, intensity: 0.45 })
  });

  const contribs = provider.contribute(clause, { translatedText: "da thịt trắng như tuyết" });
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].candidateVi, "làn da trắng ngần mịn màng như ngọc");
  assert.equal(contribs[0].semanticRequirements.aestheticDimension, AESTHETIC_DIMENSIONS.SKIN);
});

test("Wave C3-A1 - 4. Eyes Dimension: “目若秋水 / 眼神流转” resolves limpid autumn gaze", () => {
  const provider = createCourtlyBeautyProvider();
  const clause = createClauseIR({
    id: "cl_beauty_eyes_01",
    sourceZh: "美眸流转，顾盼生辉。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.60, AMUSEMENT: 0.40 }, valence: 0.40, intensity: 0.45 })
  });

  const contribs = provider.contribute(clause, { translatedText: "ánh mắt lưu chuyển như nước" });
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].candidateVi, "ánh mắt long lanh tựa làn nước mùa thu");
  assert.equal(contribs[0].semanticRequirements.aestheticDimension, AESTHETIC_DIMENSIONS.EYES);
});

test("Wave C3-A1 - 5. Face & Features: “容貌绝美 / 眉目如画” resolves exquisite countenance", () => {
  const provider = createCourtlyBeautyProvider();

  // Face
  const faceClause = createClauseIR({
    id: "cl_beauty_face_01",
    sourceZh: "容貌绝美，倾世无双。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.60, JOY: 0.40 }, valence: 0.50, intensity: 0.55 })
  });
  const faceContribs = provider.contribute(faceClause, { translatedText: "dung mạo tuyệt mỹ" });
  assert.equal(faceContribs.length, 1);
  assert.equal(faceContribs[0].candidateVi, "dung nhan tuyệt mỹ không tì vết");
  assert.equal(faceContribs[0].semanticRequirements.aestheticDimension, AESTHETIC_DIMENSIONS.FACE);

  // Eyebrows
  const browClause = createClauseIR({
    id: "cl_beauty_brow_01",
    sourceZh: "眉目如画，清丽脱俗。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.65 }, valence: 0.40, intensity: 0.40 })
  });
  const browContribs = provider.contribute(browClause, { translatedText: "mày ngài như vẽ" });
  assert.equal(browContribs.length, 1);
  assert.equal(browContribs[0].candidateVi, "hàng chân mày thanh tú như họa");
});

test("Wave C3-A1 - 6. Aura & Beauty Metaphors: “气质出尘 / 倾国倾城 / 美若天仙”", () => {
  const provider = createCourtlyBeautyProvider();

  // Aura
  const auraClause = createClauseIR({
    id: "cl_beauty_aura_01",
    sourceZh: "气质出尘，宛如广寒仙子。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.80 }, valence: 0.50, intensity: 0.50 })
  });
  const auraContribs = provider.contribute(auraClause, { translatedText: "khí chất xuất trần" });
  assert.equal(auraContribs.length, 1);
  assert.equal(auraContribs[0].candidateVi, "khí chất thanh tao thoát tục");
  assert.equal(auraContribs[0].semanticRequirements.aestheticDimension, AESTHETIC_DIMENSIONS.AURA);

  // Kingdom-toppling
  const kingdomClause = createClauseIR({
    id: "cl_beauty_kingdom_01",
    sourceZh: "倾国倾城之貌。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.60, JOY: 0.40 }, valence: 0.50, intensity: 0.60 })
  });
  const kingdomContribs = provider.contribute(kingdomClause, { translatedText: "khuynh quốc khuynh thành" });
  assert.equal(kingdomContribs.length, 1);
  assert.equal(kingdomContribs[0].candidateVi, "nhan sắc tuyệt trần khuynh quốc khuynh thành");

  // Celestial immortal
  const celestialClause = createClauseIR({
    id: "cl_beauty_celestial_01",
    sourceZh: "美若天仙，下凡尘世。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.70, JOY: 0.45 }, valence: 0.55, intensity: 0.60 })
  });
  const celestialContribs = provider.contribute(celestialClause, { translatedText: "mỹ nhược thiên tiên" });
  assert.equal(celestialContribs.length, 1);
  assert.equal(celestialContribs[0].candidateVi, "nhan sắc thanh lệ thoát tục tựa tiên nữ giáng trần");
});

test("Wave C3-A1 - 7. Posture Dimension: “身材婀娜” allowed ONLY when explicit in source", () => {
  const provider = createCourtlyBeautyProvider();
  const postureClause = createClauseIR({
    id: "cl_beauty_posture_01",
    sourceZh: "身材婀娜，步履轻盈。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.60 }, valence: 0.35, intensity: 0.40 })
  });

  const contribs = provider.contribute(postureClause, { translatedText: "dáng người thướt tha" });
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].candidateVi, "dáng người thướt tha mềm mại");
  assert.equal(contribs[0].semanticRequirements.aestheticDimension, AESTHETIC_DIMENSIONS.POSTURE);
});

// =========================================================================
// 2. Negative and Adversarial Invariant Tests
// =========================================================================

test("Wave C3-A1 - 8. Adversarial: Neutral clothing (“身穿白衣”) never injects skin softness, body curves, or scent", () => {
  const provider = createCourtlyBeautyProvider();

  // Neutral clothing description without snow metaphor or beauty praise
  const neutralClothClause = createClauseIR({
    id: "cl_adv_cloth_01",
    sourceZh: "她身穿白衣，站在树下。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.80 }, valence: 0.0, intensity: 0.20 })
  });

  const ctx = { translatedText: "nàng mặc áo trắng, đứng dưới gốc cây" };
  const contribs = provider.contribute(neutralClothClause, ctx);

  // Must NOT trigger skin, hair, eyes, or posture rules
  assert.equal(contribs.length, 0, "Neutral clothing must NOT trigger courtly beauty enhancements");
});

test("Wave C3-A1 - 9. Adversarial: Neutral smile (“微微一笑”) never injects seduction, love, or desire", () => {
  const provider = createCourtlyBeautyProvider();

  const smileClause = createClauseIR({
    id: "cl_adv_smile_01",
    sourceZh: "她微微一笑，点了点头。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.70, AMUSEMENT: 0.30 }, valence: 0.20, intensity: 0.25 })
  });

  const ctx = { translatedText: "nàng khẽ mỉm cười, gật đầu" };
  const contribs = provider.contribute(smileClause, ctx);
  assert.equal(contribs.length, 0, "Neutral smile must NOT trigger beauty/seduction contributions");
});

test("Wave C3-A1 - 10. Adversarial: Neutral lighting (“月光照在她身上”) never injects ungrounded beauty judgments", () => {
  const provider = createCourtlyBeautyProvider();

  const lightingClause = createClauseIR({
    id: "cl_adv_light_01",
    sourceZh: "月光照在她身上，夜色微凉。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.80 }, valence: 0.0, intensity: 0.15 })
  });

  const ctx = { translatedText: "ánh trăng chiếu lên thân thể nàng, cảnh đêm se lạnh" };
  const contribs = provider.contribute(lightingClause, ctx);
  assert.equal(contribs.length, 0, "Neutral lighting must NOT fabricate beauty judgments");
});

test("Wave C3-A1 - 11. Adversarial: Third-Person Limited POV strictly rejects universal attraction claims", () => {
  const provider = createCourtlyBeautyProvider();

  const clause = createClauseIR({
    id: "cl_adv_pov_01",
    sourceZh: "容貌绝美。",
    role: "DESCRIPTION",
    cognitiveEvent: {
      pov: "THIRD_PERSON_LIMITED",
      thinker: { status: "RESOLVED", entityId: "observer1" },
      status: "RESOLVED"
    },
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.60 }, valence: 0.40, intensity: 0.40 })
  });

  // Attempting to pass universal attraction claim in limited POV
  const ctx = {
    translatedText: "dung mạo tuyệt mỹ",
    pov: "THIRD_PERSON_LIMITED",
    assertUniversalAttraction: true
  };

  const contribs = provider.contribute(clause, ctx);
  assert.equal(contribs.length, 0, "Universal attraction claims must be rejected in limited POV");
});

// =========================================================================
// 3. Multi-Provider Coexistence Tests
// =========================================================================

test("Wave C3-A1 - 12. Multi-Provider: Beauty + Title Hierarchy coexist on distinct slots without collision", () => {
  const beautyProvider = createCourtlyBeautyProvider();
  const titleProvider = createTitleHierarchyProvider();

  const clause = createClauseIR({
    id: "cl_multi_title_beauty_01",
    sourceZh: "太上长老容貌绝美，飘然若仙。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.70, SOLEMN: 0.50 }, valence: 0.50, intensity: 0.55 })
  });

  const ctx = {
    translatedText: "Thái Thượng Trưởng lão dung mạo tuyệt mỹ, phiêu nhiên như tiên"
  };

  const beautyContribs = beautyProvider.contribute(clause, ctx);
  const titleContribs = titleProvider.contribute(clause, ctx);

  assert.equal(beautyContribs.length, 1, "CourtlyBeautyProvider produces AESTHETIC_ELEGANCE");
  assert.equal(titleContribs.length, 1, "TitleHierarchyProvider produces TITLE_HONORIFIC");

  assert.equal(beautyContribs[0].targetSlot, STYLE_SLOTS.AESTHETIC_ELEGANCE);
  assert.equal(titleContribs[0].targetSlot, STYLE_SLOTS.TITLE_HONORIFIC);
  assert.notEqual(beautyContribs[0].targetSlot, titleContribs[0].targetSlot, "Providers operate on distinct slots");
});

test("Wave C3-A1 - 13. Multi-Provider: Beauty + Supernatural Horror coexist orthogonally (Spectral Maiden)", () => {
  const beautyProvider = createCourtlyBeautyProvider();
  const horrorProvider = createSupernaturalProvider();

  const clause = createClauseIR({
    id: "cl_multi_beauty_horror_01",
    sourceZh: "红衣厉鬼容貌绝美，鬼气森森。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { FEAR: 0.80, TRANQUIL: 0.40 },
      valence: -0.40,
      intensity: 0.75
    })
  });

  const ctx = {
    translatedText: "lệ quỷ áo đỏ dung mạo tuyệt mỹ, quỷ khí sâm sâm"
  };

  const beautyContribs = beautyProvider.contribute(clause, ctx);
  const horrorContribs = horrorProvider.proposeContributions(clause, ctx);

  assert.equal(beautyContribs.length, 1, "Beauty provider captures maiden elegance on AESTHETIC_ELEGANCE");
  assert.equal(horrorContribs.length, 1, "Horror provider captures spectral terror on SUPERNATURAL_SPECTER");

  assert.equal(beautyContribs[0].targetSlot, STYLE_SLOTS.AESTHETIC_ELEGANCE);
  assert.equal(horrorContribs[0].targetSlot, STYLE_SLOTS.SUPERNATURAL_SPECTER);
});

// =========================================================================
// 4. Provider Order Independence
// =========================================================================

test("Wave C3-A1 - 14. Provider Order Independence: Deterministic routing across provider shuffles", () => {
  const clause = createClauseIR({
    id: "cl_order_beauty_01",
    sourceZh: "圣女一袭白衣胜雪，容貌绝美。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.70 }, valence: 0.50, intensity: 0.50 })
  });

  const ctx = {
    primaryDomain: "COURTLY_BEAUTY",
    domainWeights: { COURTLY_BEAUTY: 0.90, TITLE_HIERARCHY: 0.85 },
    translatedText: "Thánh Nữ một thân bạch y thắng tuyết, dung mạo tuyệt mỹ"
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

test("Wave C3-A1 - 15. Performance Benchmark: CourtlyBeautyProvider latency is sub-millisecond", () => {
  const provider = createCourtlyBeautyProvider();
  const clause = createClauseIR({
    id: "cl_perf_01",
    sourceZh: "一袭白衣胜雪，容貌绝美。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.70 }, valence: 0.50, intensity: 0.50 })
  });

  const ctx = { translatedText: "một thân bạch y thắng tuyết, dung mạo tuyệt mỹ" };

  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    provider.contribute(clause, ctx);
  }
  const totalMs = performance.now() - start;
  const avgUs = (totalMs / 1000) * 1000; // microseconds per call

  assert.ok(avgUs < 100, `Average contribution latency should be < 100μs, got ${avgUs.toFixed(2)}μs`);
});
