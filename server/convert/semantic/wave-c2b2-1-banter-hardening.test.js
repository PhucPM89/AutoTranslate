"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createClauseIR, createSemanticSignature } = require("./contracts");
const { STYLE_SLOTS, STYLE_SLOT_DEFINITIONS, SEMANTIC_ROLES, REALIZATION_DIMENSIONS, getSlotDefinition } = require("./providers/stylist-contribution");
const { createBanterProvider, DIALOGUE_ACTS, RELATIONSHIP_TYPES } = require("./providers/banter-provider");
const { createUrbanSlangProvider, SLANG_CATEGORIES } = require("./providers/urban-slang-provider");
const { createTitleHierarchyProvider } = require("./providers/title-hierarchy-provider");
const { createMonologueProvider } = require("./providers/monologue-provider");
const { createStylistRouter } = require("./stylist-router");

// Helper to construct dialogue context
function makeDialogueCtx(speakerId, listenerId, relationshipType, extra = {}) {
  return {
    dialogueContext: {
      speaker: { status: "RESOLVED", entityId: speakerId, socialRank: extra.speakerRank || "PEER", speechStyle: extra.speakerStyle || null, persona: extra.speakerPersona || null },
      listener: { status: "RESOLVED", entityId: listenerId, socialRank: extra.listenerRank || "PEER", speechStyle: extra.listenerStyle || null },
      relationship: { status: "RESOLVED", type: relationshipType, confidence: 0.98 }
    },
    genre: extra.genre || undefined,
    formalSetting: extra.formalSetting || false,
    translatedText: extra.translatedText || undefined
  };
}

// =========================================================================
// 1. Urban Slang Safety & Context Gating Tests
// =========================================================================

test("Wave C2B-2.1 - 1. Urban Slang Safety: Gaming slang in GAME genre with modern persona activates cleanly", () => {
  const provider = createUrbanSlangProvider();
  const clause = createClauseIR({
    id: "cl_slang_game_01",
    sourceZh: "他直接开挂了",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { ELEVATED: 0.65 }, valence: 0.40, intensity: 0.50 })
  });

  const ctx = {
    ...makeDialogueCtx("p1", "p2", RELATIONSHIP_TYPES.PEER, { genre: "GAME", speakerStyle: "MODERN_CASUAL" }),
    translatedText: "hắn trực tiếp khai quải"
  };

  const contribs = provider.contribute(clause, ctx);
  assert.equal(contribs.length, 1, "Must contribute 1 MODERN_VERNACULAR realization");
  assert.equal(contribs[0].targetSlot, STYLE_SLOTS.MODERN_VERNACULAR);
  assert.equal(contribs[0].candidateVi, "bật hack");
  assert.ok(contribs[0].provenance.includes("genre=GAME"));
});

test("Wave C2B-2.1 - 2. Urban Slang Safety: Xianxia / Historical narration strictly suppresses modern slang", () => {
  const provider = createUrbanSlangProvider();

  // Narration in Xianxia mentioning a phrase matching slang pattern
  const clause = createClauseIR({
    id: "cl_xianxia_narr_01",
    sourceZh: "宗门内部竞争激烈",
    role: "NARRATION",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.60 }, valence: -0.20, intensity: 0.50 })
  });

  const xianxiaCtx = { genre: "XIANXIA", translatedText: "nội quyển trong tông môn" };
  const historicalCtx = { genre: "HISTORICAL", translatedText: "thảng bình mặc kệ sự đời" };
  const imperialCtx = { genre: "IMPERIAL", translatedText: "hắn trang bức trước điện" };

  assert.equal(provider.contribute(clause, xianxiaCtx).length, 0, "Xianxia narration must yield 0 slang");
  assert.equal(provider.contribute(clause, historicalCtx).length, 0, "Historical narration must yield 0 slang");
  assert.equal(provider.contribute(clause, imperialCtx).length, 0, "Imperial narration must yield 0 slang");
});

test("Wave C2B-2.1 - 3. Urban Slang Safety: Classical dialogue suppresses slang unless speaker is modern transmigrator", () => {
  const provider = createUrbanSlangProvider();

  const clause = createClauseIR({
    id: "cl_dialogue_slang_01",
    sourceZh: "这简直是黑科技",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { SOLEMN: 0.50 }, valence: 0.30, intensity: 0.40 })
  });

  // Ancient Master in Xianxia -> MUST ABSTAIN
  const ancientCtx = {
    ...makeDialogueCtx("elder", "disciple", RELATIONSHIP_TYPES.MASTER_DISCIPLE, { genre: "XIANXIA", speakerStyle: "DAOIST_ELDER" }),
    translatedText: "đây quả thực là hắc khoa kỹ"
  };
  assert.equal(provider.contribute(clause, ancientCtx).length, 0, "Ancient Daoist Elder must not speak modern internet slang");

  // Modern transmigrator in Xianxia -> PERMITTED
  const transmigratorCtx = {
    ...makeDialogueCtx("mc", "disciple", RELATIONSHIP_TYPES.PEER, { genre: "XIANXIA", speakerStyle: "TRANSMIGRATOR" }),
    translatedText: "đây quả thực là hắc khoa kỹ"
  };
  const transContribs = provider.contribute(clause, transmigratorCtx);
  assert.equal(transContribs.length, 1, "Transmigrator character is permitted to use modern register");
  assert.equal(transContribs[0].candidateVi, "siêu công nghệ hắc ám");
});

// =========================================================================
// 2. StyleSlot Contract Verification (MODERN_VERNACULAR ≠ STATE)
// =========================================================================

test("Wave C2B-2.1 - 4. StyleSlot Contract: MODERN_VERNACULAR is NARRATIVE_FUNCTION, not STATE", () => {
  const slotDef = getSlotDefinition(STYLE_SLOTS.MODERN_VERNACULAR);
  assert.ok(slotDef, "MODERN_VERNACULAR must be defined");
  assert.equal(slotDef.semanticRole, SEMANTIC_ROLES.NARRATIVE_FUNCTION, "MODERN_VERNACULAR must have semanticRole NARRATIVE_FUNCTION");
  assert.notEqual(slotDef.semanticRole, SEMANTIC_ROLES.STATE, "MODERN_VERNACULAR must NOT be classified as source world STATE");
  assert.ok(slotDef.realizationDimensions.includes(REALIZATION_DIMENSIONS.REGISTER), "Must modulate REGISTER dimension");
  assert.ok(slotDef.realizationDimensions.includes(REALIZATION_DIMENSIONS.LEXICAL), "Must modulate LEXICAL dimension");
});

// =========================================================================
// 3. Genre Safety & Matrix Tests
// =========================================================================

test("Wave C2B-2.1 - 5. Genre Safety: Permitted modern genres vs Restricted classical genres matrix", () => {
  const provider = createUrbanSlangProvider();
  const clause = createClauseIR({
    id: "cl_genre_matrix_01",
    sourceZh: "他正在装逼",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { CONTEMPT: 0.50 }, valence: -0.20, intensity: 0.40 })
  });

  const testText = "hắn đang trang bức";

  // Permitted genres
  const modernGenres = ["MODERN", "URBAN", "SCI_FI", "GAME", "CYBERPUNK"];
  for (const genre of modernGenres) {
    const contribs = provider.contribute(clause, { genre, translatedText: testText });
    assert.equal(contribs.length, 1, `Genre ${genre} must permit urban slang`);
  }

  // Restricted classical genres
  const classicalGenres = ["XIANXIA", "WUXIA", "HISTORICAL", "IMPERIAL", "RELIGIOUS", "COURT", "DAOIST"];
  for (const genre of classicalGenres) {
    const contribs = provider.contribute(clause, { genre, translatedText: testText });
    assert.equal(contribs.length, 0, `Classical genre ${genre} must suppress urban slang in action/narration`);
  }
});

// =========================================================================
// 4. Persona Safety Tests (Same Genre, Different SpeechStyle)
// =========================================================================

test("Wave C2B-2.1 - 6. Persona Safety: Archaic formal speaker vs Modern casual speaker in same genre", () => {
  const provider = createUrbanSlangProvider();
  const clause = createClauseIR({
    id: "cl_persona_01",
    sourceZh: "你别装逼了",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { CONTEMPT: 0.60 }, valence: -0.30, intensity: 0.50 })
  });

  const text = "ngươi đừng trang bức nữa";

  // Speaker A: Archaic formal dignitary (e.g. visiting ancient official in modern setting)
  const formalCtx = {
    ...makeDialogueCtx("spkA", "spkB", RELATIONSHIP_TYPES.PEER, { genre: "MODERN", speakerStyle: "ARCHAIC_FORMAL" }),
    translatedText: text
  };
  assert.equal(provider.contribute(clause, formalCtx).length, 0, "Archaic formal speaker must suppress slang even in modern genre");

  // Speaker B: Modern casual netizen
  const casualCtx = {
    ...makeDialogueCtx("spkB", "spkA", RELATIONSHIP_TYPES.PEER, { genre: "MODERN", speakerStyle: "MODERN_CASUAL" }),
    translatedText: text
  };
  const casualContribs = provider.contribute(clause, casualCtx);
  assert.equal(casualContribs.length, 1, "Modern casual speaker permits slang");
  assert.equal(casualContribs[0].candidateVi, "làm màu ra vẻ");
});

// =========================================================================
// 5. Banter ≠ Insult Delineation Tests
// =========================================================================

test("Wave C2B-2.1 - 7. Banter ≠ Insult: Hostile insult between enemies vs Playful teasing between friends", () => {
  const provider = createBanterProvider();

  // 1. Hostile death wish provocation between enemies -> TAUNT (not playful banter)
  const enemyClause = createClauseIR({
    id: "cl_enemy_insult",
    sourceZh: "你这是找死",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { CONTEMPT: 0.90, HOSTILITY: 0.85 }, valence: -0.70, intensity: 0.85 })
  });
  const enemyCtx = {
    ...makeDialogueCtx("enemy1", "enemy2", RELATIONSHIP_TYPES.MORTAL_ENEMY),
    translatedText: "ngươi đây là tự tìm cái chết"
  };
  const enemyContribs = provider.contribute(enemyClause, enemyCtx);
  assert.equal(enemyContribs.length, 1);
  assert.equal(enemyContribs[0].semanticRequirements.dialogueAct, DIALOGUE_ACTS.TAUNT);
  assert.equal(enemyContribs[0].candidateVi, "ngươi đúng là chán sống rồi");

  // 2. Playful light teasing between peers -> TEASING
  const friendClause = createClauseIR({
    id: "cl_friend_teasing",
    sourceZh: "你的脸皮真厚",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { AMUSEMENT: 0.70, CONTEMPT: 0.40 }, valence: -0.10, intensity: 0.45 })
  });
  const friendCtx = {
    ...makeDialogueCtx("friend1", "friend2", RELATIONSHIP_TYPES.PEER),
    translatedText: "da mặt cũng thật là dày"
  };
  const friendContribs = provider.contribute(friendClause, friendCtx);
  assert.equal(friendContribs.length, 1);
  assert.equal(friendContribs[0].semanticRequirements.dialogueAct, DIALOGUE_ACTS.TEASING);
  assert.equal(friendContribs[0].candidateVi, "da mặt cũng dày thật đấy");
});

// =========================================================================
// 6. Same-Sentence Context Switch Tests
// =========================================================================

test("Wave C2B-2.1 - 8. Same-Sentence Context Switch: “你可真厉害” disambiguates based on discourse context", () => {
  const provider = createBanterProvider();

  const clause = createClauseIR({
    id: "cl_ambig_praise_01",
    sourceZh: "你可真厉害",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { AMUSEMENT: 0.75 }, valence: 0.40, intensity: 0.50 })
  });

  // Context A: Friends with playful affect -> AFFECTIONATE / TEASING
  const friendCtx = {
    ...makeDialogueCtx("f1", "f2", RELATIONSHIP_TYPES.FRIEND),
    translatedText: "ngươi thật là lợi hại đấy"
  };
  const friendContribs = provider.contribute(clause, friendCtx);
  assert.equal(friendContribs.length, 1, "Friends context produces playful teasing candidate");
  assert.equal(friendContribs[0].candidateVi, "ngươi cũng cừ thật đấy nhỉ");

  // Context B: Enemies with hostility -> SARCASM / MOCKERY
  const enemyCtx = {
    ...makeDialogueCtx("e1", "e2", RELATIONSHIP_TYPES.ENEMY),
    translatedText: "ngươi quả là ghê gớm đấy"
  };
  const enemyContribs = provider.contribute(clause, enemyCtx);
  assert.equal(enemyContribs.length, 1, "Enemy context produces sarcastic mockery candidate");
  assert.equal(enemyContribs[0].candidateVi, "ngươi quả là ghê gớm đấy");

  // Context C: Formal Imperial Court -> ABSTAINS
  const courtCtx = {
    ...makeDialogueCtx("subject", "emperor", RELATIONSHIP_TYPES.RULER_SUBJECT, { formalSetting: true }),
    translatedText: "ngươi thật là lợi hại đấy"
  };
  const courtContribs = provider.contribute(clause, courtCtx);
  assert.equal(courtContribs.length, 0, "Formal court setting strictly suppresses banter");
});

// =========================================================================
// 7. Multi-Provider Coexistence Tests (Title + Banter + Monologue + Slang)
// =========================================================================

test("Wave C2B-2.1 - 9. Title + Banter Coexistence: “师兄，你算什么东西” targets distinct slots without overwrite", () => {
  const titleProvider = createTitleHierarchyProvider();
  const banterProvider = createBanterProvider();

  const clause = createClauseIR({
    id: "cl_title_banter_01",
    sourceZh: "师兄，你算什么东西",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { CONTEMPT: 0.85 }, valence: -0.60, intensity: 0.70 })
  });

  const ctx = {
    ...makeDialogueCtx("junior", "senior", RELATIONSHIP_TYPES.SENIOR_JUNIOR),
    translatedText: "sư huynh, ngươi tính là cái thứ gì"
  };

  const titleContribs = titleProvider.contribute(clause, ctx);
  const banterContribs = banterProvider.contribute(clause, ctx);

  assert.equal(titleContribs.length, 1, "TitleHierarchyProvider contributes SOCIAL_ADDRESS/TITLE_HONORIFIC");
  assert.equal(banterContribs.length, 1, "BanterProvider contributes BANTER_RETORT");

  assert.notEqual(titleContribs[0].targetSlot, banterContribs[0].targetSlot, "Providers target distinct StyleSlots");
  assert.equal(banterContribs[0].targetSlot, STYLE_SLOTS.BANTER_RETORT);
});

test("Wave C2B-2.1 - 10. Banter + Monologue Coexistence: Spoken banter and internal thought remain separate semantic layers", () => {
  const banterProvider = createBanterProvider();
  const monologueProvider = createMonologueProvider();

  // Spoken dialogue clause
  const dialogueClause = createClauseIR({
    id: "cl_layer_dial",
    sourceZh: "师兄，你可真厉害",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { AMUSEMENT: 0.70 }, valence: 0.40, intensity: 0.50 })
  });

  // Consecutive inner thought clause
  const thoughtClause = createClauseIR({
    id: "cl_layer_thought",
    sourceZh: "他心中暗想",
    role: "INNER_THOUGHT",
    semanticSignature: createSemanticSignature({ affectDistribution: { CONTEMPT: 0.90 }, valence: -0.70, intensity: 0.75 }),
    cognitiveEvent: {
      kind: "EXPLICIT_THOUGHT",
      evidenceId: "THOUGHT_COVERT",
      sourceSpan: "心中暗想",
      thinker: { status: "RESOLVED", entityId: "junior" },
      status: "RESOLVED",
      confidence: 0.95
    }
  });

  const ctx = makeDialogueCtx("junior", "senior", RELATIONSHIP_TYPES.FRIEND, {
    translatedText: "ngươi thật là lợi hại đấy"
  });

  const banterContribs = banterProvider.contribute(dialogueClause, ctx);
  const monologueContribs = monologueProvider.contribute(thoughtClause, ctx);

  assert.equal(banterContribs.length, 1, "Dialogue clause receives BANTER_RETORT");
  assert.equal(monologueContribs.length, 1, "Thought clause receives INNER_MONOLOGUE");

  // Zero cross-contamination
  assert.equal(banterProvider.contribute(thoughtClause, ctx).length, 0, "Banter never contributes to INNER_THOUGHT");
  assert.equal(monologueProvider.contribute(dialogueClause, ctx).length, 0, "Monologue never contributes to DIALOGUE");
});

test("Wave C2B-2.1 - 11. Banter + Urban Slang: Modern casual speaker coexists; historical formal suppresses slang", () => {
  const banterProvider = createBanterProvider();
  const slangProvider = createUrbanSlangProvider();

  const clause = createClauseIR({
    id: "cl_coexist_01",
    sourceZh: "你这废物只会社死，算什么东西",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { CONTEMPT: 0.85, AMUSEMENT: 0.50 }, valence: -0.60, intensity: 0.70 })
  });

  const text = "ngươi chỉ biết xã tử, ngươi tính là cái thứ gì";

  // Modern setting: Both coexist
  const modernCtx = {
    ...makeDialogueCtx("p1", "p2", RELATIONSHIP_TYPES.PEER, { genre: "MODERN", speakerStyle: "MODERN_CASUAL" }),
    translatedText: text
  };
  const modernBanter = banterProvider.contribute(clause, modernCtx);
  const modernSlang = slangProvider.contribute(clause, modernCtx);
  assert.equal(modernBanter.length, 1, "Modern context produces BANTER_RETORT");
  assert.equal(modernSlang.length, 1, "Modern context produces MODERN_VERNACULAR");

  // Historical setting: Banter allowed, Urban slang suppressed
  const historicalCtx = {
    ...makeDialogueCtx("p1", "p2", RELATIONSHIP_TYPES.PEER, { genre: "HISTORICAL", speakerStyle: "ARCHAIC_FORMAL" }),
    translatedText: text
  };
  const histBanter = banterProvider.contribute(clause, historicalCtx);
  const histSlang = slangProvider.contribute(clause, historicalCtx);
  assert.equal(histBanter.length, 1, "Historical context retains classical banter/insult");
  assert.equal(histSlang.length, 0, "Historical context strictly suppresses modern slang");
});

// =========================================================================
// 8. Order Independence & Semantic Invariants Tests
// =========================================================================

test("Wave C2B-2.1 - 12. Provider Order Independence: Deterministic routing across provider shuffles", () => {
  const router = createStylistRouter();

  const clause = createClauseIR({
    id: "cl_order_indep_01",
    sourceZh: "你算什么东西，在这装逼",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { CONTEMPT: 0.85 }, valence: -0.60, intensity: 0.70 })
  });

  const ctx = {
    ...makeDialogueCtx("p1", "p2", RELATIONSHIP_TYPES.PEER, { genre: "MODERN" }),
    primaryDomain: "BANTER",
    domainWeights: { BANTER: 0.90, URBAN_SLANG: 0.85 },
    translatedText: "ngươi tính là cái thứ gì, chỉ biết trang bức"
  };

  const baselineRes = router.route(clause, ctx);

  for (let i = 0; i < 5; i++) {
    const shuffledRouter = createStylistRouter();
    const shuffledRes = shuffledRouter.route(clause, ctx);
    assert.equal(shuffledRes.selectedContributions.length, baselineRes.selectedContributions.length, `Shuffle ${i} count match`);
    for (let j = 0; j < baselineRes.selectedContributions.length; j++) {
      assert.equal(shuffledRes.selectedContributions[j].candidateVi, baselineRes.selectedContributions[j].candidateVi, `Shuffle ${i} candidate ${j} match`);
      assert.equal(shuffledRes.selectedContributions[j].targetSlot, baselineRes.selectedContributions[j].targetSlot, `Shuffle ${i} targetSlot ${j} match`);
    }
  }
});

test("Wave C2B-2.1 - 13. Semantic Invariant: Zero invented facts, intents, emotions, or relationships", () => {
  const banterProvider = createBanterProvider();
  const slangProvider = createUrbanSlangProvider();

  const clause = createClauseIR({
    id: "cl_inv_01",
    sourceZh: "给脸不要脸",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({ affectDistribution: { CONTEMPT: 0.85 }, valence: -0.60, intensity: 0.70 })
  });

  const ctx = {
    ...makeDialogueCtx("A", "B", RELATIONSHIP_TYPES.ENEMY, { genre: "XIANXIA" }),
    translatedText: "cho mặt mà không muốn mặt"
  };

  const banterContribs = banterProvider.contribute(clause, ctx);
  assert.equal(banterContribs.length, 1);
  assert.deepEqual(banterContribs[0].introducedInformation, [], "Banter must introduce 0 facts");
  assert.equal(banterContribs[0].semanticExpansionCost, 0.0, "Banter must have 0 expansion cost");
  assert.equal(banterContribs[0].introducedMetaphor, false, "Banter must not introduce ungrounded metaphors");
});

// =========================================================================
// 9. Golden Negatives
// =========================================================================

test("Wave C2B-2.1 - 14. Golden Negatives: Plain cold sneer, inner chuckle, window staring yield 0 banter and 0 slang", () => {
  const banterProvider = createBanterProvider();
  const slangProvider = createUrbanSlangProvider();

  // 1. 他冷笑了一声。 (Action / Narration)
  const sneerClause = createClauseIR({
    id: "cl_neg_sneer",
    sourceZh: "他冷笑了一声。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { CONTEMPT: 0.60 }, valence: -0.30, intensity: 0.40 })
  });

  // 2. 他心中暗笑。 (Inner Thought)
  const chuckleClause = createClauseIR({
    id: "cl_neg_chuckle",
    sourceZh: "他心中暗笑。",
    role: "INNER_THOUGHT",
    semanticSignature: createSemanticSignature({ affectDistribution: { AMUSEMENT: 0.50 }, valence: 0.20, intensity: 0.30 })
  });

  // 3. 他看着窗外。 (Description)
  const windowClause = createClauseIR({
    id: "cl_neg_window",
    sourceZh: "他看着窗外。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({ affectDistribution: { TRANQUIL: 0.80 }, valence: 0.0, intensity: 0.10 })
  });

  const ctx = { genre: "XIANXIA" };

  assert.equal(banterProvider.contribute(sneerClause, ctx).length, 0, "Sneer narration is NOT banter");
  assert.equal(slangProvider.contribute(sneerClause, ctx).length, 0, "Sneer narration is NOT slang");

  assert.equal(banterProvider.contribute(chuckleClause, ctx).length, 0, "Inner chuckle is NOT banter");
  assert.equal(slangProvider.contribute(chuckleClause, ctx).length, 0, "Inner chuckle is NOT slang");

  assert.equal(banterProvider.contribute(windowClause, ctx).length, 0, "Window description is NOT banter");
  assert.equal(slangProvider.contribute(windowClause, ctx).length, 0, "Window description is NOT slang");
});
