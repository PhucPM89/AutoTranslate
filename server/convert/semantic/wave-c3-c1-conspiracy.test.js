"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createClauseIR, createSemanticSignature } = require("./contracts");
const { STYLE_SLOTS } = require("./providers/stylist-contribution");
const { createConspiracyProvider, CONSPIRACY_CATEGORIES } = require("./providers/conspiracy-provider");
const { createTitleHierarchyProvider } = require("./providers/title-hierarchy-provider");
const { createImperialEdictProvider } = require("./providers/imperial-edict-provider");
const { createMonologueProvider } = require("./providers/monologue-provider");
const { createCourtlyBeautyProvider } = require("./providers/courtly-beauty-provider");
const { createStylistRouter } = require("./stylist-router");

// =========================================================================
// 1. Positive Tests Across 4 Political Intrigue Categories
// =========================================================================

test("Wave C3-C1 - 1. Court Undercurrent: “暗流涌动”", () => {
  const provider = createConspiracyProvider();
  const clause = createClauseIR({
    id: "cl_consp_01_undercurrent",
    sourceZh: "朝堂之上，暗流涌动。",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.85, SUSPICION: 0.80 }, valence: -0.50, intensity: 0.80 })
  });

  const contribs = provider.contribute(clause, { translatedText: "trên triều đình, sóng ngầm cuộn trào" });
  assert.equal(contribs.length, 1, "Must produce 1 POLITICAL_INTRIGUE contribution");
  assert.equal(contribs[0].targetSlot, STYLE_SLOTS.POLITICAL_INTRIGUE);
  assert.equal(contribs[0].candidateVi, "sóng ngầm cuộn trào nơi thâm cung nội viện");
  assert.equal(contribs[0].semanticRequirements.conspiracyCategory, CONSPIRACY_CATEGORIES.COURT_UNDERCURRENT);
});

test("Wave C3-C1 - 2. High Treason: “欺君犯上” & “株连九族”", () => {
  const provider = createConspiracyProvider();

  // High treason
  const treasonClause = createClauseIR({
    id: "cl_consp_02_treason",
    sourceZh: "胆敢欺君犯上，罪不容诛！",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { WRATH: 0.95, SOLEMN: 0.90 }, valence: -0.85, intensity: 0.95 })
  });
  const treasonContribs = provider.contribute(treasonClause, { translatedText: "dám khi quân phạm thượng, tội không thể tha!" });
  assert.equal(treasonContribs.length, 1);
  assert.equal(treasonContribs[0].candidateVi, "tội tày đình khi quân phạm thượng, muôn chết không tha");

  // Nine clans extermination
  const clanClause = createClauseIR({
    id: "cl_consp_02_clan",
    sourceZh: "判处株连九族，以儆效尤！",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 1.0, WRATH: 0.90 }, valence: -0.90, intensity: 0.95 })
  });
  const clanContribs = provider.contribute(clanClause, { translatedText: "xử tội tru di cửu tộc, để răn đe kẻ khác!" });
  assert.equal(clanContribs.length, 1);
  assert.equal(clanContribs[0].candidateVi, "tội đáng tru di cửu tộc");
});

test("Wave C3-C1 - 3. Ruthless Stratagems: “狼子野心”, “借刀杀人”, “兔死狗烹”, “设计陷害”", () => {
  const provider = createConspiracyProvider();

  // Wolf ambition
  const wolfClause = createClauseIR({
    id: "cl_consp_03_wolf",
    sourceZh: "此人狼子野心，不可不防。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { HOSTILITY: 0.90 }, valence: -0.80, intensity: 0.88 })
  });
  const wolfContribs = provider.contribute(wolfClause, { translatedText: "người này dã tâm lang sói, không thể không phòng" });
  assert.equal(wolfContribs.length, 1);
  assert.equal(wolfContribs[0].candidateVi, "dã tâm lang sói muôn phần hiểm độc khó lường");

  // Borrow knife
  const knifeClause = createClauseIR({
    id: "cl_consp_03_knife",
    sourceZh: "这一招借刀杀人，当真精妙。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { HOSTILITY: 0.85 }, valence: -0.75, intensity: 0.85 })
  });
  const knifeContribs = provider.contribute(knifeClause, { translatedText: "chiêu mượn đao giết người này, quả thực tinh diệu" });
  assert.equal(knifeContribs.length, 1);
  assert.equal(knifeContribs[0].candidateVi, "mượn đao giết người không vấy một giọt máu");

  // Cook hound
  const houndClause = createClauseIR({
    id: "cl_consp_03_hound",
    sourceZh: "兔死狗烹，自古皆然。",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { MELANCHOLY: 0.85 }, valence: -0.80, intensity: 0.85 })
  });
  const houndContribs = provider.contribute(houndClause, { translatedText: "thỏ chết chó bị mổ, từ xưa đến nay đều như vậy" });
  assert.equal(houndContribs.length, 1);
  assert.equal(houndContribs[0].candidateVi, "chim hết bẻ cung, thỏ chết chó săn ắt bị làm thịt");

  // Design and frame
  const frameClause = createClauseIR({
    id: "cl_consp_03_frame",
    sourceZh: "暗中设计陷害忠良。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { HOSTILITY: 0.90 }, valence: -0.75, intensity: 0.85 })
  });
  const frameContribs = provider.contribute(frameClause, { translatedText: "ngầm thiết kế hãm hại trung lương" });
  assert.equal(frameContribs.length, 1);
  assert.equal(frameContribs[0].candidateVi, "bày mưu tính kế hãm hại");
});

test("Wave C3-C1 - 4. Explicit Conspiracy Plans: “早已谋划”, “里应外合”, “伪造诏书”", () => {
  const provider = createConspiracyProvider();

  // Long planned scheme
  const planClause = createClauseIR({
    id: "cl_consp_04_plan",
    sourceZh: "他早已谋划好夺嫡之策。",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90 }, valence: -0.40, intensity: 0.85 })
  });
  const planContribs = provider.contribute(planClause, { translatedText: "hắn sớm đã mưu tính sách lược đoạt đích" });
  assert.equal(planContribs.length, 1);
  assert.equal(planContribs[0].candidateVi, "sớm đã bày sẵn kế sách vẹn toàn");

  // Collusion inside and out
  const collusionClause = createClauseIR({
    id: "cl_consp_04_collusion",
    sourceZh: "与叛军里应外合，攻破京城。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.85 }, valence: -0.60, intensity: 0.85 })
  });
  const collusionContribs = provider.contribute(collusionClause, { translatedText: "cùng phản quân lý ứng ngoại hợp, công phá kinh thành" });
  assert.equal(collusionContribs.length, 1);
  assert.equal(collusionContribs[0].candidateVi, "trong ngoài tương ứng, ngầm cấu kết");

  // Forged edict
  const edictClause = createClauseIR({
    id: "cl_consp_04_edict",
    sourceZh: "私自伪造诏书，意图谋反！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.85 }, valence: -0.80, intensity: 0.90 })
  });
  const edictContribs = provider.contribute(edictClause, { translatedText: "tự ý giả mạo chiếu thư, ý đồ mưu phản!" });
  assert.equal(edictContribs.length, 1);
  assert.equal(edictContribs[0].candidateVi, "giả mạo thánh chỉ, mưu đồ bất chính");
});

// =========================================================================
// 2. Negative & Adversarial Invariant Tests
// =========================================================================

test("Wave C3-C1 - 5. Adversarial: A smile is NEVER a conspiracy (“他微微一笑。”)", () => {
  const provider = createConspiracyProvider();

  const smileClause = createClauseIR({
    id: "cl_adv_consp_smile_01",
    sourceZh: "他微微一笑，神色温和。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.80 }, valence: 0.40, intensity: 0.30 })
  });

  const ctx = { translatedText: "hắn mỉm cười, vẻ mặt ôn hòa" };
  const contribs = provider.contribute(smileClause, ctx);
  assert.equal(contribs.length, 0, "A smile must NOT trigger conspiracy provider");
});

test("Wave C3-C1 - 6. Adversarial: Silence is NEVER a conspiracy (“他沉默片刻。”)", () => {
  const provider = createConspiracyProvider();

  const silenceClause = createClauseIR({
    id: "cl_adv_consp_silence_01",
    sourceZh: "他沉默片刻，并未多言。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.70 }, valence: 0.0, intensity: 0.30 })
  });

  const ctx = { translatedText: "hắn im lặng một hồi, không nói thêm lời nào" };
  const contribs = provider.contribute(silenceClause, ctx);
  assert.equal(contribs.length, 0, "Silence must NOT trigger conspiracy provider");
});

test("Wave C3-C1 - 7. Adversarial: Cold glance is NOT political conspiracy (“他冷冷地看着对方。”)", () => {
  const provider = createConspiracyProvider();

  const gazeClause = createClauseIR({
    id: "cl_adv_consp_gaze_01",
    sourceZh: "他冷冷地看着对方。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { HOSTILITY: 0.70 }, valence: -0.40, intensity: 0.60 })
  });

  const ctx = { translatedText: "hắn lạnh lùng nhìn đối phương" };
  const contribs = provider.contribute(gazeClause, ctx);
  assert.equal(contribs.length, 0, "Cold glance must NOT trigger conspiracy provider");
});

test("Wave C3-C1 - 8. Adversarial: Court context alone does not prove conspiracy (“他在朝堂上微微一笑。”)", () => {
  const provider = createConspiracyProvider();

  const courtSmileClause = createClauseIR({
    id: "cl_adv_consp_court_01",
    sourceZh: "他在朝堂上微微一笑。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.60 }, valence: 0.20, intensity: 0.30 })
  });

  const ctx = {
    translatedText: "hắn ở trên triều đình mỉm cười",
    contextGenre: "IMPERIAL_COURT"
  };

  const contribs = provider.contribute(courtSmileClause, ctx);
  assert.equal(contribs.length, 0, "Court context + demeanor must NOT trigger conspiracy");
});

test("Wave C3-C1 - 9. Adversarial: Title + Smile is NOT conspiracy (“王爷微微一笑。”)", () => {
  const provider = createConspiracyProvider();

  const titleSmileClause = createClauseIR({
    id: "cl_adv_consp_title_01",
    sourceZh: "王爷微微一笑，端起茶杯。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.80 }, valence: 0.30, intensity: 0.30 })
  });

  const ctx = { translatedText: "Vương gia mỉm cười, bưng chén trà lên" };
  const contribs = provider.contribute(titleSmileClause, ctx);
  assert.equal(contribs.length, 0, "Title + smile must NOT trigger conspiracy provider");
});

test("Wave C3-C1 - 10. Adversarial: Sarcastic dialogue / Banter is NOT conspiracy (““你可真厉害。””)", () => {
  const provider = createConspiracyProvider();

  const banterClause = createClauseIR({
    id: "cl_adv_consp_banter_01",
    sourceZh: "他冷笑道：“你可真厉害。”",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { CONTEMPT: 0.70 }, valence: -0.20, intensity: 0.50 })
  });

  const ctx = {
    translatedText: "hắn cười lạnh: \"Ngươi quả thật lợi hại.\"",
    isBanter: true
  };

  const contribs = provider.contribute(banterClause, ctx);
  assert.equal(contribs.length, 0, "Sarcastic banter must NOT trigger conspiracy provider");
});

test("Wave C3-C1 - 11. Adversarial: Third-Person Limited POV strictly rejects unobserved hidden intent", () => {
  const provider = createConspiracyProvider();

  const povClause = createClauseIR({
    id: "cl_adv_consp_pov_01",
    sourceZh: "暗流涌动。",
    role: "DESCRIPTION",
    cognitiveEvent: {
      pov: "THIRD_PERSON_LIMITED",
      thinker: { status: "RESOLVED", entityId: "observer1" },
      status: "RESOLVED"
    },
    semanticSignature: createSemanticSignature({ affectDistribution: { SUSPICION: 0.80 }, valence: -0.50, intensity: 0.70 })
  });

  const ctx = {
    translatedText: "sóng ngầm cuộn trào",
    pov: "THIRD_PERSON_LIMITED",
    assertUnobservedIntent: true
  };

  const contribs = provider.contribute(povClause, ctx);
  assert.equal(contribs.length, 0, "Unobserved intent in limited POV must be rejected");
});

// =========================================================================
// 3. Multi-Provider Coexistence Tests
// =========================================================================

test("Wave C3-C1 - 12. Multi-Provider: Conspiracy + Title Hierarchy", () => {
  const conspProvider = createConspiracyProvider();
  const titleProvider = createTitleHierarchyProvider();

  const clause = createClauseIR({
    id: "cl_multi_consp_title_01",
    sourceZh: "王爷早已谋划好一切。",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.80 }, valence: -0.40, intensity: 0.85 })
  });

  const ctx = {
    translatedText: "Vương gia sớm đã mưu tính xong tất cả."
  };

  const conspContribs = conspProvider.contribute(clause, ctx);
  const titleContribs = titleProvider.contribute(clause, ctx);

  assert.equal(conspContribs.length, 1, "Conspiracy provider produces POLITICAL_INTRIGUE");
  assert.equal(titleContribs.length, 1, "Title provider produces TITLE_HONORIFIC");

  assert.equal(conspContribs[0].targetSlot, STYLE_SLOTS.POLITICAL_INTRIGUE);
  assert.equal(titleContribs[0].targetSlot, STYLE_SLOTS.TITLE_HONORIFIC);
});

test("Wave C3-C1 - 13. Multi-Provider: Conspiracy + Imperial Edict", () => {
  const conspProvider = createConspiracyProvider();
  const edictProvider = createImperialEdictProvider();

  const clause = createClauseIR({
    id: "cl_multi_consp_edict_01",
    sourceZh: "伪造诏书，奉天承运皇帝诏曰！",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.95, RESOLUTE: 0.90 }, valence: -0.60, intensity: 0.90 })
  });

  const ctx = {
    translatedText: "giả mạo thánh chỉ, Phụng thiên thừa vận Hoàng đế chiếu viết!"
  };

  const conspContribs = conspProvider.contribute(clause, ctx);
  const edictContribs = edictProvider.proposeContributions(clause, ctx);

  assert.equal(conspContribs.length, 1, "Conspiracy provider captures forged edict on POLITICAL_INTRIGUE");
  assert.equal(edictContribs.length, 1, "Imperial edict provider captures opening on IMPERIAL_PROCLAMATION");

  assert.equal(conspContribs[0].targetSlot, STYLE_SLOTS.POLITICAL_INTRIGUE);
  assert.equal(edictContribs[0].targetSlot, STYLE_SLOTS.IMPERIAL_PROCLAMATION);
});

test("Wave C3-C1 - 14. Multi-Provider: Conspiracy + Inner Monologue", () => {
  const conspProvider = createConspiracyProvider();
  const monoProvider = createMonologueProvider();

  const clause = createClauseIR({
    id: "cl_multi_consp_mono_01",
    sourceZh: "早已谋划，心中暗道：“此计必成。”",
    role: "INNER_THOUGHT",
    cognitiveEvent: {
      status: "RESOLVED",
      kind: "EXPLICIT_THOUGHT",
      evidenceId: "THOUGHT_COVERT",
      thinker: { status: "RESOLVED", entityId: "prince1" }
    },
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.80 }, valence: -0.30, intensity: 0.85 })
  });

  const ctx = {
    translatedText: "sớm đã mưu tính, trong lòng thầm nghĩ: \"Kế này tất thành.\""
  };

  const conspContribs = conspProvider.contribute(clause, ctx);
  const monoContribs = monoProvider.contribute(clause, ctx);

  assert.equal(conspContribs.length, 1, "Conspiracy captures scheme on POLITICAL_INTRIGUE");
  assert.equal(monoContribs.length, 1, "Monologue captures thought marker on INNER_MONOLOGUE");

  assert.equal(conspContribs[0].targetSlot, STYLE_SLOTS.POLITICAL_INTRIGUE);
  assert.equal(monoContribs[0].targetSlot, STYLE_SLOTS.INNER_MONOLOGUE);
});

test("Wave C3-C1 - 15. Multi-Provider: Conspiracy + Courtly Beauty (Palace Beauty Intrigue)", () => {
  const conspProvider = createConspiracyProvider();
  const beautyProvider = createCourtlyBeautyProvider();

  const clause = createClauseIR({
    id: "cl_multi_consp_beauty_01",
    sourceZh: "白衣胜雪，暗流涌动。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.80, TRANQUIL: 0.50 }, valence: -0.30, intensity: 0.75 })
  });

  const ctx = {
    translatedText: "một thân bạch y thắng tuyết, sóng ngầm cuộn trào"
  };

  const conspContribs = conspProvider.contribute(clause, ctx);
  const beautyContribs = beautyProvider.contribute(clause, ctx);

  assert.equal(conspContribs.length, 1, "Conspiracy captures undercurrent on POLITICAL_INTRIGUE");
  assert.equal(beautyContribs.length, 1, "Beauty captures maiden attire on AESTHETIC_ELEGANCE");

  assert.equal(conspContribs[0].targetSlot, STYLE_SLOTS.POLITICAL_INTRIGUE);
  assert.equal(beautyContribs[0].targetSlot, STYLE_SLOTS.AESTHETIC_ELEGANCE);
});

// =========================================================================
// 4. Provider Order Independence
// =========================================================================

test("Wave C3-C1 - 16. Provider Order Independence: Deterministic routing across provider shuffles", () => {
  const clause = createClauseIR({
    id: "cl_order_consp_01",
    sourceZh: "王爷早已谋划好一切。",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.80 }, valence: -0.40, intensity: 0.85 })
  });

  const ctx = {
    primaryDomain: "POLITICAL_INTRIGUE",
    domainWeights: { POLITICAL_INTRIGUE: 0.95, TITLE_HIERARCHY: 0.90 },
    translatedText: "Vương gia sớm đã mưu tính xong tất cả."
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

test("Wave C3-C1 - 17. Performance Benchmark: ConspiracyProvider latency is sub-millisecond", () => {
  const provider = createConspiracyProvider();
  const clause = createClauseIR({
    id: "cl_perf_consp_01",
    sourceZh: "朝堂之上，暗流涌动，早已谋划！",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.85 }, valence: -0.50, intensity: 0.85 })
  });

  const ctx = { translatedText: "trên triều đình, sóng ngầm cuộn trào, sớm đã mưu tính!" };

  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    provider.contribute(clause, ctx);
  }
  const totalMs = performance.now() - start;
  const avgUs = (totalMs / 1000) * 1000; // microseconds per call

  assert.ok(avgUs < 100, `Average contribution latency should be < 100μs, got ${avgUs.toFixed(2)}μs`);
});
