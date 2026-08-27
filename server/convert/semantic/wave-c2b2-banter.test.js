"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createClauseIR, createSemanticSignature } = require("./contracts");
const { STYLE_SLOTS } = require("./providers/stylist-contribution");
const { createBanterProvider, DIALOGUE_ACTS, RELATIONSHIP_TYPES } = require("./providers/banter-provider");
const { createUrbanSlangProvider, SLANG_CATEGORIES } = require("./providers/urban-slang-provider");
const { createStylistRouter } = require("./stylist-router");

// Helpers to build discourse context for banter activation tests
function makeDialogueCtx(speakerId, listenerId, relationshipType, relationshipStatus = "RESOLVED") {
  return {
    dialogueContext: {
      speaker: { status: "RESOLVED", entityId: speakerId, socialRank: "PEER" },
      listener: { status: "RESOLVED", entityId: listenerId, socialRank: "PEER" },
      relationship: { status: relationshipStatus, type: relationshipType, confidence: 0.98 }
    }
  };
}

// =========================================================================
// 1. Banter Provider — Positive Tests
// =========================================================================

test("Wave C2B-2 - 1. BanterProvider: ENEMY relationship + taunt pattern → BANTER_RETORT resolved", () => {
  const provider = createBanterProvider();

  const clause = createClauseIR({
    id: "cl_banter_01",
    sourceZh: "你以为你在跟我开玩笑吗？",
    role: "DIALOGUE",
    candidateVi: "ngươi đây là đang nói đùa sao?",
    semanticSignature: createSemanticSignature({
      affectDistribution: { CONTEMPT: 0.75 },
      valence: -0.30,
      intensity: 0.60
    })
  });

  const contribs = provider.contribute(clause, {
    ...makeDialogueCtx("A", "B", RELATIONSHIP_TYPES.ENEMY),
    translatedText: "ngươi đây là đang nói đùa sao?"
  });
  assert.equal(contribs.length, 1, "Must produce exactly 1 BANTER_RETORT contribution");
  assert.equal(contribs[0].targetSlot, STYLE_SLOTS.BANTER_RETORT);
  assert.equal(contribs[0].candidateVi, "ngươi đang kể chuyện cười cho ta nghe đấy à?");
  assert.equal(contribs[0].introducedInformation.length, 0, "Must not introduce new information");
});

test("Wave C2B-2 - 2. BanterProvider: PEER relationship + thick-face mock → BANTER_RETORT resolved", () => {
  const provider = createBanterProvider();

  const clause = createClauseIR({
    id: "cl_banter_02",
    sourceZh: "你的脸皮真厚",
    role: "DIALOGUE",
    candidateVi: "da mặt của ngươi thật dày đấy",
    semanticSignature: createSemanticSignature({
      affectDistribution: { AMUSEMENT: 0.65, CONTEMPT: 0.50 },
      valence: -0.25,
      intensity: 0.55
    })
  });

  const contribs = provider.contribute(clause, {
    ...makeDialogueCtx("A", "B", RELATIONSHIP_TYPES.PEER),
    translatedText: "da mặt của ngươi thật dày đấy"
  });
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].targetSlot, STYLE_SLOTS.BANTER_RETORT);
  assert.equal(contribs[0].candidateVi, "da mặt ngươi cũng dày bằng tường thành đấy nhỉ");
});

// =========================================================================
// 2. Banter Provider — Negative Tests (ABSTAIN conditions)
// =========================================================================

test("Wave C2B-2 - 3. BanterProvider: Missing speakerId → ABSTAIN (0 contributions)", () => {
  const provider = createBanterProvider();

  const clause = createClauseIR({
    id: "cl_banter_neg_01",
    sourceZh: "你以为你在跟我开玩笑吗？",
    role: "DIALOGUE",
    candidateVi: "ngươi đây là đang nói đùa sao?",
    semanticSignature: createSemanticSignature({ affectDistribution: { CONTEMPT: 0.75 }, valence: -0.30, intensity: 0.60 })
  });

  // Speaker status is UNKNOWN
  const ctx = {
    dialogueContext: {
      speaker: { status: "UNKNOWN", entityId: null },
      listener: { status: "RESOLVED", entityId: "B" },
      relationship: { status: "RESOLVED", type: RELATIONSHIP_TYPES.ENEMY }
    }
  };

  assert.equal(provider.contribute(clause, ctx).length, 0, "Missing speaker must yield 0 contributions");
});

test("Wave C2B-2 - 4. BanterProvider: MASTER_DISCIPLE relationship + taunt → ABSTAIN (hierarchy safety)", () => {
  const provider = createBanterProvider();

  const clause = createClauseIR({
    id: "cl_banter_neg_02",
    sourceZh: "你以为你是什么东西",
    role: "DIALOGUE",
    candidateVi: "ngươi tính là cái thứ gì",
    semanticSignature: createSemanticSignature({ affectDistribution: { CONTEMPT: 0.80 }, valence: -0.50, intensity: 0.70 })
  });

  // Disciple speaking to Master — MASTER_DISCIPLE is forbidden for this insult pattern
  const contribs = provider.contribute(clause, makeDialogueCtx("disciple", "master", RELATIONSHIP_TYPES.MASTER_DISCIPLE));
  assert.equal(contribs.length, 0, "Disciple insulting master must yield 0 contributions (relationship guard)");
});

test("Wave C2B-2 - 5. BanterProvider: Non-dialogue clause role → ABSTAIN", () => {
  const provider = createBanterProvider();

  const clause = createClauseIR({
    id: "cl_banter_neg_03",
    sourceZh: "他嘲讽地笑了笑",
    role: "NARRATION",
    candidateVi: "ngươi đây là đang nói đùa sao?",
    semanticSignature: createSemanticSignature({ affectDistribution: { CONTEMPT: 0.50 }, valence: -0.20, intensity: 0.40 })
  });

  assert.equal(provider.contribute(clause, makeDialogueCtx("A", "B", RELATIONSHIP_TYPES.PEER)).length, 0,
    "Non-DIALOGUE role must yield 0 banter contributions");
});

test("Wave C2B-2 - 6. BanterProvider: No dialogueContext at all → ABSTAIN", () => {
  const provider = createBanterProvider();

  const clause = createClauseIR({
    id: "cl_banter_neg_04",
    sourceZh: "你是什么东西",
    role: "DIALOGUE",
    candidateVi: "ngươi tính là cái thứ gì",
    semanticSignature: createSemanticSignature({ affectDistribution: { CONTEMPT: 0.80 }, valence: -0.50, intensity: 0.70 })
  });

  assert.equal(provider.contribute(clause, {}).length, 0, "Missing dialogueContext must yield 0 banter contributions");
});

// =========================================================================
// 3. Urban Slang Provider — Positive Tests
// =========================================================================

test("Wave C2B-2 - 7. UrbanSlangProvider: Gaming slang pattern → MODERN_VERNACULAR resolved", () => {
  const provider = createUrbanSlangProvider();

  const clause = createClauseIR({
    id: "cl_slang_01",
    sourceZh: "他直接开挂了",
    role: "DESCRIPTION",
    candidateVi: "hắn trực tiếp khai quải",
    semanticSignature: createSemanticSignature({ affectDistribution: { ELEVATED: 0.65 }, valence: 0.40, intensity: 0.50 })
  });

  const contribs = provider.contribute(clause, { translatedText: "hắn trực tiếp khai quải" });
  assert.equal(contribs.length, 1, "Gaming slang must produce 1 MODERN_VERNACULAR contribution");
  assert.equal(contribs[0].targetSlot, STYLE_SLOTS.MODERN_VERNACULAR);
  assert.equal(contribs[0].candidateVi, "bật hack");
  assert.equal(contribs[0].register, "MODERN_INTERNET");
  assert.equal(contribs[0].introducedInformation.length, 0);
});

test("Wave C2B-2 - 8. UrbanSlangProvider: Social phenomenon slang → MODERN_VERNACULAR resolved", () => {
  const provider = createUrbanSlangProvider();

  const clause = createClauseIR({
    id: "cl_slang_02",
    sourceZh: "在这个内卷的时代",
    role: "EXPOSITION",
    candidateVi: "trong thời đại nội quyển này",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.55 }, valence: -0.20, intensity: 0.45 })
  });

  const contribs = provider.contribute(clause, { translatedText: "trong thời đại nội quyển này" });
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].candidateVi, "cạnh tranh khốc liệt");
  assert.equal(contribs[0].targetSlot, STYLE_SLOTS.MODERN_VERNACULAR);
});

test("Wave C2B-2 - 9. UrbanSlangProvider: No discourse context required — activates on any role", () => {
  const provider = createUrbanSlangProvider();

  // ACTION role — urban slang can appear in action descriptions
  const actionClause = createClauseIR({
    id: "cl_slang_action",
    sourceZh: "他的行为就是在trang bức",
    role: "ACTION",
    candidateVi: "hành vi của hắn chính là trang bức",
    semanticSignature: createSemanticSignature({ affectDistribution: { CONTEMPT: 0.50 }, valence: -0.20, intensity: 0.45 })
  });

  const contribs = provider.contribute(actionClause, {}); // no dialogueContext needed
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].targetSlot, STYLE_SLOTS.MODERN_VERNACULAR);
  assert.equal(contribs[0].candidateVi, "làm màu ra vẻ");
});

// =========================================================================
// 4. Multi-Provider Interaction: Banter + Title + Urban Slang
// =========================================================================

test("Wave C2B-2 - 10. Multi-Provider Coexistence: BanterProvider + UrbanSlangProvider target distinct slots (no collision)", () => {
  const banterProvider = createBanterProvider();
  const slangProvider = createUrbanSlangProvider();

  // A DIALOGUE clause with both banter + slang patterns
  const clause = createClauseIR({
    id: "cl_multi_01",
    sourceZh: "你这个废物，你只会装逼而已",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({
      affectDistribution: { CONTEMPT: 0.85, AMUSEMENT: 0.50 },
      valence: -0.60,
      intensity: 0.75
    })
  });

  const banterCtx = {
    ...makeDialogueCtx("A", "B", RELATIONSHIP_TYPES.PEER),
    translatedText: "ngươi tính là cái thứ gì, chỉ biết trang bức"
  };

  const banterContribs = banterProvider.contribute(clause, banterCtx);
  const slangContribs = slangProvider.contribute(clause, { translatedText: "ngươi tính là cái thứ gì, chỉ biết trang bức" });

  // Both providers fire on distinct slots — no collision
  assert.equal(banterContribs.length, 1, "BanterProvider must produce 1 BANTER_RETORT contribution");
  assert.equal(slangContribs.length, 1, "UrbanSlangProvider must produce 1 MODERN_VERNACULAR contribution");

  const banterSlot = banterContribs[0].targetSlot;
  const slangSlot = slangContribs[0].targetSlot;
  assert.equal(banterSlot, STYLE_SLOTS.BANTER_RETORT, "Banter targets BANTER_RETORT");
  assert.equal(slangSlot, STYLE_SLOTS.MODERN_VERNACULAR, "Urban slang targets MODERN_VERNACULAR");
  assert.notEqual(banterSlot, slangSlot, "No slot collision between banter and urban slang providers");
});

// =========================================================================
// 5. Provider Order Independence
// =========================================================================

test("Wave C2B-2 - 11. Provider Order Independence: Banter + Urban Slang produce deterministic output", () => {
  const testClause = createClauseIR({
    id: "cl_order_01",
    sourceZh: "你这个废物只会装逼，真是丢人",
    role: "DIALOGUE",
    candidateVi: "ngươi là cái thứ gì, chỉ biết trang bức, thật là mất mặt",
    semanticSignature: createSemanticSignature({
      affectDistribution: { CONTEMPT: 0.85, AMUSEMENT: 0.50 },
      valence: -0.50,
      intensity: 0.70
    })
  });

  const ctx = makeDialogueCtx("A", "B", RELATIONSHIP_TYPES.PEER);
  ctx.primaryDomain = "BANTER";
  ctx.domainWeights = { BANTER: 0.85, URBAN_SLANG: 0.80 };

  const baselineRouter = createStylistRouter();
  const baselineRes = baselineRouter.route(testClause, ctx);

  for (let i = 0; i < 5; i++) {
    const shuffledRouter = createStylistRouter();
    const shuffledRes = shuffledRouter.route(testClause, ctx);
    assert.equal(shuffledRes.selectedContributions.length, baselineRes.selectedContributions.length,
      `Iteration ${i}: contribution count must be deterministic`);
  }
});

// =========================================================================
// 6. Golden Negative — Plain Narration
// =========================================================================

test("Wave C2B-2 - 12. Golden Negative: Plain narration produces 0 banter and 0 slang contributions", () => {
  const banterProvider = createBanterProvider();
  const slangProvider = createUrbanSlangProvider();

  const plainClause = createClauseIR({
    id: "cl_neg_plain",
    sourceZh: "他端起茶杯，轻轻啜了一口。",
    role: "ACTION",
    candidateVi: "hắn cầm chén trà lên, nhẹ nhàng nhấp một ngụm.",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.70 },
      valence: 0.50,
      intensity: 0.15
    })
  });

  assert.equal(banterProvider.contribute(plainClause, {}).length, 0, "Plain action must yield 0 banter");
  assert.equal(slangProvider.contribute(plainClause, {}).length, 0, "Plain action must yield 0 slang");
});
