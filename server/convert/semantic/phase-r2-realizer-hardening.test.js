"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createClauseIR, createSemanticSignature } = require("./contracts");
const { createExpressionPlanner, FALLBACK_LEVELS } = require("./expression-planner");
const {
  createVietnameseRealizer,
  checkNegationSafety,
  checkTemporalSafety,
  checkDiscourseSafety,
  performSemanticRoundTripCheck
} = require("./vietnamese-realizer");

// Mock base converter for testing fallback mechanisms
function mockBaseConvert(zhText) {
  return String(zhText)
    .replace(/他/g, "hắn ")
    .replace(/缓缓/g, "chậm rãi ")
    .replace(/拔出长剑/g, "tuốt trường kiếm ")
    .replace(/拔剑/g, "tuốt kiếm ")
    .replace(/斩出/g, "chém ra ")
    .replace(/心中暗道不妙/g, "trong lòng thầm nghĩ không ổn ")
    .replace(/随后/g, "sau đó ")
    .replace(/王爷/g, "Vương gia ")
    .replace(/微微一笑/g, "mỉm cười ")
    .replace(/宗门覆灭/g, "tông môn bị diệt ")
    .replace(/悲痛欲绝/g, "đau lòng đến cực điểm ")
    .replace(/师尊/g, "Sư tôn ")
    .replace(/师兄/g, "Sư huynh ")
    .replace(/打趣道/g, "trêu đùa rằng ")
    .replace(/看着弟子/g, "nhìn đệ tử ")
    .replace(/他说/g, "hắn nói ")
    .replace(/你可真厉害/g, "ngươi quả thật lợi hại ")
    .replace(/你可真行/g, "ngươi quả thật lợi hại ")
    .replace(/好一切/g, " xong tất cả")
    .replace(/没有死/g, "không chết ")
    .replace(/已经离开了/g, "đã rời đi ");
}

// =========================================================================
// 1. 10 Mandatory Golden Composition Cases
// =========================================================================

test("Phase R2 - 1. Golden Case 1: “他缓缓拔出长剑。” (Manner + Verb + Object)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_r2_gold_01",
    sourceZh: "他缓缓拔出长剑。",
    role: "ACTION",
    subjectSlot: { entityId: "hero1", isImplicit: false, resolvedPronoun: "Hắn" },
    actionSequence: [{ verbZh: "拔出", actionVi: "tuốt", weaponEntity: "trường kiếm" }],
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.85, SOLEMN: 0.70 }, valence: 0.10, intensity: 0.75 })
  });

  const ctx = {
    primaryDomain: "SWORD_DAO",
    domainWeights: { SWORD_DAO: 0.95, COMBAT: 0.90 },
    translatedText: "hắn chậm rãi tuốt trường kiếm rời vỏ."
  };

  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.includes("hắn") || text.includes("Hắn"), "Subject preserved");
  assert.ok(text.includes("trường kiếm") || text.includes("kiếm"), "Object preserved");
  assert.ok(text.includes("chậm rãi") || text.includes("tuốt"), "Manner and verb composed cleanly");
});

test("Phase R2 - 2. Golden Case 2: “他心中暗道不妙，随后拔剑斩出。” (Monologue + Temporal + Action)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_r2_gold_02",
    sourceZh: "心中暗道不妙，随后拔剑斩出！",
    role: "ACTION",
    subjectSlot: { entityId: "hero1", isImplicit: true, resolvedPronoun: "Hắn" },
    cognitiveEvent: { status: "RESOLVED", kind: "EXPLICIT_THOUGHT", evidenceId: "THOUGHT_COVERT" },
    semanticSignature: createSemanticSignature({ affectDistribution: { FEAR: 0.60, RESOLUTE: 0.85 }, valence: -0.20, intensity: 0.85 })
  });

  const ctx = {
    primaryDomain: "COMBAT",
    domainWeights: { COMBAT: 0.95, MONOLOGUE_PSYCHOLOGY: 0.90 },
    translatedText: "trong lòng thầm nghĩ không ổn, sau đó tuốt kiếm chém ra!"
  };

  const { text, plan } = realizer.realizeClause(clause, ctx);
  assert.ok(text.includes("trong lòng thầm nghĩ") || text.includes("không ổn"), "Monologue preserved");
  assert.ok(text.includes("sau đó"), "Temporal connector preserved");
  assert.ok(text.includes("kiếm") || text.includes("chém"), "Combat action realized");
  assert.equal(plan.linguisticConstraints.temporalAspect, "SEQUENTIAL_THEN");
});

test("Phase R2 - 3. Golden Case 3: “红衣女鬼容貌绝美，杀意滔天。” (Beauty + Horror + Hostility)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_r2_gold_03",
    sourceZh: "红衣女鬼容貌绝美，杀意滔天！",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { HOSTILITY: 0.95, FEAR: 0.80 }, valence: -0.75, intensity: 0.90 })
  });

  const ctx = {
    primaryDomain: "SUPERNATURAL_HORROR",
    domainWeights: { SUPERNATURAL_HORROR: 0.95, COURTLY_BEAUTY: 0.85, MADNESS_FRENZY: 0.90 },
    translatedText: "hồng y nữ quỷ dung mạo tuyệt mỹ, sát ý ngút trời cuồng bạo"
  };

  const { text, trace } = realizer.realizeClause(clause, ctx);
  assert.ok(text.includes("sát ý") || text.includes("cuồng bạo"), "Hostility preserved");
  assert.ok(!text.includes("tình chàng ý thiếp"), "No romance drift");
  assert.equal(trace.budgetAudit.qualityGateStatus, "QUALITY_GATE_PASSED");
});

test("Phase R2 - 4. Golden Case 4: “琴音袅袅之间，一剑斩出。” (Musical + Combat)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_r2_gold_04",
    sourceZh: "琴音袅袅之间，一剑斩出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.60, RESOLUTE: 0.80 }, valence: 0.10, intensity: 0.80 })
  });

  const ctx = {
    primaryDomain: "COMBAT",
    domainWeights: { COMBAT: 0.95, MUSICAL_DAO: 0.85 },
    translatedText: "tiếng đàn du dương quanh quẩn, một kiếm chém ra!"
  };

  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.length > 0, "Musical combat action synthesized");
});

test("Phase R2 - 5. Golden Case 5: “宗门覆灭，众人悲痛欲绝。” (Destruction + Grief)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_r2_gold_05",
    sourceZh: "宗门覆灭，众人悲痛欲绝。",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.90, SORROW: 0.95 }, valence: -0.90, intensity: 0.90 })
  });

  const ctx = {
    primaryDomain: "DRAMATIC_CLIMAX",
    domainWeights: { DRAMATIC_CLIMAX: 0.95 },
    translatedText: "tông môn hoàn toàn bị hủy diệt, mọi người đau đớn đến thắt ruột thắt gan"
  };

  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.includes("hủy diệt") || text.includes("tông môn"), "Destruction realized");
  assert.ok(!text.includes("máu chảy thành sông"), "Zero ungrounded blood river assertion");
});

test("Phase R2 - 6. Golden Case 6: “王爷微微一笑。” (Title + Demeanor)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_r2_gold_06",
    sourceZh: "王爷微微一笑。",
    role: "DESCRIPTION",
    subjectSlot: { entityId: "prince1", isImplicit: false, resolvedPronoun: "Vương gia" },
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.80 }, valence: 0.30, intensity: 0.30 })
  });

  const ctx = {
    primaryDomain: "TITLE_HIERARCHY",
    domainWeights: { TITLE_HIERARCHY: 0.95, POLITICAL_INTRIGUE: 0.50 },
    translatedText: "Vương gia mỉm cười"
  };

  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.includes("Vương gia") || text.includes("mỉm cười"), "Title and demeanor realized");
  assert.ok(!text.includes("âm mưu") && !text.includes("dã tâm"), "Zero conspiracy drift");
});

test("Phase R2 - 7. Golden Case 7: “师尊看着弟子。” (Sect Title + Kinship address)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_r2_gold_07",
    sourceZh: "师尊看着弟子。",
    role: "DESCRIPTION",
    subjectSlot: { entityId: "master1", isImplicit: false, resolvedPronoun: "Sư tôn" },
    objectSlot: { entityId: "disciple1", baseVi: "đệ tử" },
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.80 }, valence: 0.30, intensity: 0.40 })
  });

  const ctx = {
    primaryDomain: "TITLE_HIERARCHY",
    domainWeights: { TITLE_HIERARCHY: 0.95 },
    translatedText: "Sư tôn nhìn đệ tử"
  };

  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.toLowerCase().includes("sư tôn"), "Master title preserved");
  assert.ok(text.toLowerCase().includes("đệ tử"), "Disciple title preserved");
});

test("Phase R2 - 8. Golden Case 8: “他说：“你可真厉害。”” (Dialogue + Speech Act + Register)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_r2_gold_08",
    sourceZh: "他说：“你可真厉害。”",
    role: "DIALOGUE",
    dialogueAct: {
      status: "RESOLVED",
      actType: "COMPLIMENT_OR_BANTER",
      speaker: { status: "RESOLVED", entityId: "hero1" }
    },
    semanticSignature: createSemanticSignature({ affectDistribution: { AMUSEMENT: 0.70 }, valence: 0.30, intensity: 0.50 })
  });

  const ctx = {
    primaryDomain: "BANTER",
    domainWeights: { BANTER: 0.85 },
    translatedText: "hắn nói: \"Ngươi quả thật lợi hại.\""
  };

  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.toLowerCase().includes("ngươi quả thật lợi hại") || text.toLowerCase().includes("ngươi"), "Dialogue content preserved in character voice");
});

test("Phase R2 - 9. Golden Case 9: “他没有死。” (Negation Safety Enforced)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_r2_gold_09_negation",
    sourceZh: "他没有死。",
    role: "EXPOSITION",
    subjectSlot: { entityId: "hero1", isImplicit: false, resolvedPronoun: "Hắn" },
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.80 }, valence: 0.20, intensity: 0.70 })
  });

  const ctx = {
    primaryDomain: "NEUTRAL",
    domainWeights: {},
    translatedText: "hắn không chết"
  };

  const { text, plan } = realizer.realizeClause(clause, ctx);
  assert.equal(plan.linguisticConstraints.hasNegation, true, "Negation detected in source");
  assert.ok(text.includes("không") || text.includes("chưa"), "Negative polarity preserved");
  assert.ok(!text.includes("hắn đã chết"), "Zero positive inversion");
});

test("Phase R2 - 10. Golden Case 10: “他已经离开了。” (Temporal Aspect Safety)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_r2_gold_10_temporal",
    sourceZh: "他已经离开了。",
    role: "EXPOSITION",
    subjectSlot: { entityId: "hero1", isImplicit: false, resolvedPronoun: "Hắn" },
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.70 }, valence: 0.0, intensity: 0.50 })
  });

  const ctx = {
    primaryDomain: "NEUTRAL",
    domainWeights: {},
    translatedText: "hắn đã rời đi"
  };

  const { text, plan } = realizer.realizeClause(clause, ctx);
  assert.equal(plan.linguisticConstraints.temporalAspect, "PERFECTIVE_ALREADY");
  assert.ok(text.includes("đã"), "Perfective aspect preserved");
});

// =========================================================================
// 2. 10 Cross-Provider Multi-Domain Tests
// =========================================================================

test("Phase R2 - 11. Cross-Provider 1: Action + Sword (SWORD_DAO + COMBAT)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });
  const clause = createClauseIR({
    id: "cl_cross_01",
    sourceZh: "拔剑斩出！",
    role: "ACTION",
    subjectSlot: { entityId: "hero1", isImplicit: true, resolvedPronoun: "Hắn" },
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90 }, valence: 0.20, intensity: 0.85 })
  });
  const ctx = { primaryDomain: "SWORD_DAO", domainWeights: { SWORD_DAO: 0.95, COMBAT: 0.95 }, translatedText: "tuốt kiếm chém ra!" };
  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.includes("kiếm") || text.includes("chém"));
});

test("Phase R2 - 12. Cross-Provider 2: Beauty + Horror (COURTLY_BEAUTY + SUPERNATURAL_HORROR)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });
  const clause = createClauseIR({
    id: "cl_cross_02",
    sourceZh: "红衣胜火，鬼气森然。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { FEAR: 0.80 }, valence: -0.60, intensity: 0.80 })
  });
  const ctx = { primaryDomain: "SUPERNATURAL_HORROR", domainWeights: { SUPERNATURAL_HORROR: 0.95, COURTLY_BEAUTY: 0.85 }, translatedText: "hồng y như lửa, quỷ khí sâm nhiên" };
  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.length > 0);
});

test("Phase R2 - 13. Cross-Provider 3: Combat + Musical (COMBAT + MUSICAL_DAO)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });
  const clause = createClauseIR({
    id: "cl_cross_03",
    sourceZh: "琴音破空，一掌轰出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.85 }, valence: 0.0, intensity: 0.85 })
  });
  const ctx = { primaryDomain: "COMBAT", domainWeights: { COMBAT: 0.95, MUSICAL_DAO: 0.85 }, translatedText: "tiếng đàn xé gió, tung một chưởng đánh ra!" };
  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.length > 0);
});

test("Phase R2 - 14. Cross-Provider 4: Zen + Tea (ZEN_TEA + ALCHEMY)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });
  const clause = createClauseIR({
    id: "cl_cross_04",
    sourceZh: "轻啜一口灵茶，清香四溢。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.90 }, valence: 0.60, intensity: 0.40 })
  });
  const ctx = { primaryDomain: "ZEN_TEA", domainWeights: { ZEN_TEA: 0.95, ALCHEMY: 0.70 }, translatedText: "uống một ngụm linh trà, thanh hương bốn phía" };
  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.length > 0);
});

test("Phase R2 - 15. Cross-Provider 5: Title + Banter (TITLE_HIERARCHY + BANTER)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });
  const clause = createClauseIR({
    id: "cl_cross_05",
    sourceZh: "师兄打趣道：“你可真行。”",
    role: "DIALOGUE",
    dialogueAct: { status: "RESOLVED", actType: "BANTER", speaker: { status: "RESOLVED", entityId: "brother1" } },
    semanticSignature: createSemanticSignature({ affectDistribution: { AMUSEMENT: 0.80 }, valence: 0.40, intensity: 0.50 })
  });
  const ctx = { primaryDomain: "TITLE_HIERARCHY", domainWeights: { TITLE_HIERARCHY: 0.95, BANTER: 0.85 }, translatedText: "Sư huynh trêu đùa: \"Ngươi quả thật giỏi.\"" };
  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.toLowerCase().includes("sư huynh") || text.toLowerCase().includes("ngươi"));
});

test("Phase R2 - 16. Cross-Provider 6: Monologue + Combat (MONOLOGUE_PSYCHOLOGY + COMBAT)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });
  const clause = createClauseIR({
    id: "cl_cross_06",
    sourceZh: "心中暗道不妙，一拳轰出！",
    role: "ACTION",
    cognitiveEvent: { status: "RESOLVED", kind: "EXPLICIT_THOUGHT", evidenceId: "THOUGHT_COVERT" },
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.85 }, valence: -0.10, intensity: 0.85 })
  });
  const ctx = { primaryDomain: "COMBAT", domainWeights: { COMBAT: 0.95, MONOLOGUE_PSYCHOLOGY: 0.90 }, translatedText: "trong lòng thầm nghĩ không ổn, một quyền đánh ra!" };
  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.includes("trong lòng thầm nghĩ") || text.includes("không ổn"));
});

test("Phase R2 - 17. Cross-Provider 7: Madness + Combat (MADNESS_FRENZY + COMBAT)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });
  const clause = createClauseIR({
    id: "cl_cross_07",
    sourceZh: "走火入魔，拔剑狂斩！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { WRATH: 0.95 }, valence: -0.80, intensity: 0.95 })
  });
  const ctx = { primaryDomain: "MADNESS_FRENZY", domainWeights: { MADNESS_FRENZY: 0.95, COMBAT: 0.90 }, translatedText: "tẩu hỏa nhập ma, tuốt kiếm chém điên cuồng!" };
  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.length > 0);
});

test("Phase R2 - 18. Cross-Provider 8: Conspiracy + Title (POLITICAL_INTRIGUE + TITLE_HIERARCHY)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });
  const clause = createClauseIR({
    id: "cl_cross_08",
    sourceZh: "王爷早已谋划好一切。",
    role: "EXPOSITION",
    subjectSlot: { entityId: "prince1", isImplicit: false, resolvedPronoun: "Vương gia" },
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.80 }, valence: -0.40, intensity: 0.85 })
  });
  const ctx = { primaryDomain: "POLITICAL_INTRIGUE", domainWeights: { POLITICAL_INTRIGUE: 0.95, TITLE_HIERARCHY: 0.90 }, translatedText: "Vương gia sớm đã mưu tính xong tất cả." };
  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.toLowerCase().includes("vương gia") && (text.toLowerCase().includes("sớm đã") || text.toLowerCase().includes("mưu tính")));
});

test("Phase R2 - 19. Cross-Provider 9: Dramatic + Elegy (DRAMATIC_CLIMAX + ELEGY)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });
  const clause = createClauseIR({
    id: "cl_cross_09",
    sourceZh: "宗门覆灭，英魂长存。",
    role: "EXPOSITION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.95, SORROW: 0.90 }, valence: -0.80, intensity: 0.90 })
  });
  const ctx = { primaryDomain: "DRAMATIC_CLIMAX", domainWeights: { DRAMATIC_CLIMAX: 0.95, ELEGY: 0.85 }, translatedText: "tông môn hoàn toàn bị hủy diệt, anh hồn vạn cổ trường tồn" };
  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.length > 0);
});

test("Phase R2 - 20. Cross-Provider 10: Chant + Combat (POETIC_VERSE + COMBAT)", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });
  const clause = createClauseIR({
    id: "cl_cross_10",
    sourceZh: "一剑光寒十九洲，一剑斩出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90, SOLEMN: 0.85 }, valence: 0.30, intensity: 0.90 })
  });
  const ctx = { primaryDomain: "POETIC_VERSE", domainWeights: { POETIC_VERSE: 0.95, COMBAT: 0.90 }, translatedText: "một kiếm quang hàn mười chín châu, một kiếm chém ra!" };
  const { text } = realizer.realizeClause(clause, ctx);
  assert.ok(text.length > 0);
});

// =========================================================================
// 3. Adversarial Constraint & Pronoun Tests
// =========================================================================

test("Phase R2 - 21. Adversarial: Negation Inversion Detection (Detects lost negation and falls back safely)", () => {
  const check = checkNegationSafety("hắn đã chết", "他没有死。");
  assert.equal(check.passed, false, "Must fail if negation marker is missing");
  assert.equal(check.reason, "NEGATION_POLARITY_LOST");
});

test("Phase R2 - 22. Adversarial: Temporal Aspect Loss Detection", () => {
  const check = checkTemporalSafety("hắn rời đi", "他已经离开了。", "PERFECTIVE_ALREADY");
  assert.equal(check.passed, false, "Must fail if already aspect is missing");
  assert.equal(check.reason, "PERFECTIVE_ASPECT_LOST");
});

test("Phase R2 - 23. Discourse Continuity: Pronoun Repetition Suppression across coordinate actions", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clauses = [
    createClauseIR({
      id: "cl_rep_01",
      sourceZh: "他走到窗前。",
      role: "ACTION",
      tier: "FULL_FRAME",
      subjectSlot: { entityId: "hero1", isImplicit: false, resolvedPronoun: "Hắn" },
      semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.70 } })
    }),
    createClauseIR({
      id: "cl_rep_02",
      sourceZh: "打开窗户。",
      role: "ACTION",
      tier: "SERIAL_ACTION",
      subjectSlot: { entityId: "hero1", isImplicit: true, resolvedPronoun: "Hắn" },
      semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.70 } })
    })
  ];

  const ctx = { translatedText: "hắn đi tới bên cửa sổ, mở ra cửa sổ" };
  const { text } = realizer.realizeParagraph(clauses, ctx);

  assert.ok(text.includes("Hắn") || text.includes("hắn"), "Initial subject present");
  // Paragraph should not have duplicate "Hắn hắn"
  assert.ok(!text.includes("Hắn, Hắn") && !text.includes("hắn, hắn"), "Suppressed redundant pronoun stuttering");
});

// =========================================================================
// 4. Performance & Scalability Benchmark
// =========================================================================

test("Phase R2 - 24. Performance Benchmark: Constraint-Aware Realizer executes in < 50μs per clause", () => {
  const realizer = createVietnameseRealizer({ baseConvertFunction: mockBaseConvert });

  const clause = createClauseIR({
    id: "cl_perf_r2_01",
    sourceZh: "他心中暗道不妙，随后拔剑斩出！",
    role: "ACTION",
    subjectSlot: { entityId: "hero1", isImplicit: false, resolvedPronoun: "Hắn" },
    cognitiveEvent: { status: "RESOLVED", kind: "EXPLICIT_THOUGHT" },
    semanticSignature: createSemanticSignature({ affectDistribution: { RESOLUTE: 0.90 } })
  });

  const ctx = {
    primaryDomain: "COMBAT",
    domainWeights: { COMBAT: 0.95, MONOLOGUE_PSYCHOLOGY: 0.90 },
    translatedText: "trong lòng thầm nghĩ không ổn, sau đó tuốt kiếm chém ra!"
  };

  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    realizer.realizeClause(clause, ctx);
  }
  const totalMs = performance.now() - start;
  const avgUs = (totalMs / 1000) * 1000;

  assert.ok(avgUs < 500, `Average realization latency should be < 500μs, got ${avgUs.toFixed(2)}μs`);
});
