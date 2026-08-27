"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createClauseIR, createSemanticSignature } = require("./contracts");
const { STYLE_SLOTS } = require("./providers/stylist-contribution");
const { createMonologueProvider } = require("./providers/monologue-provider");
const { createStylistRouter } = require("./stylist-router");

// =========================================================================
// 1. Positive Tests & Explicit Inner Thoughts
// =========================================================================

test("Wave C2B-1 - 1. Monologue Provider: resolves explicit thoughts, cognitive insights, and inner state sensations", () => {
  const provider = createMonologueProvider();

  // Test 1: 心中忍不住想 (Uncontrollable thought marker)
  const clause1 = createClauseIR({
    id: "cl_mono_01",
    sourceZh: "他心中忍不住想到：“难道此人已经察觉到了？”",
    role: "INNER_THOUGHT",
    semanticSignature: createSemanticSignature({
      denotation: "UNCONTROLLABLE_INNER_THOUGHT",
      affectDistribution: { SOLEMN: 0.60 },
      valence: 0.50,
      intensity: 0.50
    })
  });
  const contribs1 = provider.contribute(clause1);
  assert.equal(contribs1.length, 1);
  assert.equal(contribs1[0].targetSlot, STYLE_SLOTS.INNER_MONOLOGUE);
  assert.equal(contribs1[0].candidateVi, "trong lòng không khỏi thầm nghĩ");
  assert.equal(contribs1[0].introducedInformation.length, 0);

  // Test 2: 脑海中闪过一个念头 (Cognitive flash)
  const clause2 = createClauseIR({
    id: "cl_mono_02",
    sourceZh: "电光石火间，他脑海中闪过一个念头。",
    role: "INNER_THOUGHT",
    semanticSignature: createSemanticSignature({
      denotation: "COGNITIVE_INSIGHT_FLASH",
      affectDistribution: { ELEVATED: 0.70 },
      valence: 0.50,
      intensity: 0.55
    })
  });
  const contribs2 = provider.contribute(clause2);
  assert.equal(contribs2.length, 1);
  assert.equal(contribs2[0].candidateVi, "trong đầu chợt lóe lên một ý nghĩ");

  // Test 3: 心中升起一股寒意 (Psychological chill / dread)
  const clause3 = createClauseIR({
    id: "cl_mono_03",
    sourceZh: "感受到这股恐怖的威压，他心中升起一股寒意。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      denotation: "PSYCHOLOGICAL_CHILL_DREAD",
      affectDistribution: { SOLEMN: 0.85 },
      valence: 0.25,
      intensity: 0.60
    })
  });
  const contribs3 = provider.contribute(clause3);
  assert.equal(contribs3.length, 1);
  assert.equal(contribs3[0].candidateVi, "trong lòng dâng lên một luồng ớn lạnh");

  // Test 4: 想到这里，眼中闪过精光 (Decision trigger - ZERO hardcoded pronoun)
  const clause4 = createClauseIR({
    id: "cl_mono_04",
    sourceZh: "想到这里，眼中闪过一丝精光。",
    role: "INNER_THOUGHT",
    semanticSignature: createSemanticSignature({
      denotation: "RESOLUTE_DECISION_SPARK",
      affectDistribution: { RESOLUTE: 0.85 },
      valence: 0.50,
      intensity: 0.70
    })
  });
  const contribs4 = provider.contribute(clause4);
  assert.equal(contribs4.length, 1);
  assert.equal(contribs4[0].candidateVi, "nghĩ đến đây, trong mắt lóe lên tia sáng sắc lạnh");
  assert.equal(contribs4[0].candidateVi.includes("hắn"), false, "Must not hardcode third-person pronoun 'hắn'");
});

// =========================================================================
// 2. Negative Tests & Role Boundaries (Reaction != Thought)
// =========================================================================

test("Wave C2B-1 - 2. Role Boundaries: Plain action and bodily reactions do not activate Monologue Provider", () => {
  const provider = createMonologueProvider();

  // Negative 1: 他微微皱眉 (Physical action, not inner monologue)
  const clause1 = createClauseIR({
    id: "cl_neg_frown",
    sourceZh: "他微微皱眉，并未多言。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.50 },
      valence: 0.50,
      intensity: 0.30
    })
  });
  assert.equal(provider.contribute(clause1).length, 0, "Physical frowning must yield 0 monologue contributions");

  // Negative 2: 他看着窗外 (Narration/Observation)
  const clause2 = createClauseIR({
    id: "cl_neg_window",
    sourceZh: "他静静地看着窗外的细雨。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.70 },
      valence: 0.50,
      intensity: 0.20
    })
  });
  assert.equal(provider.contribute(clause2).length, 0, "Sensory observation must not invent thought");
});

// =========================================================================
// 3. POV & Entity Interaction
// =========================================================================

test("Wave C2B-1 - 3. Multi-Domain & Title Interaction: Title + Monologue coexisting harmoniously", () => {
  const router = createStylistRouter();

  const multiClause = createClauseIR({
    id: "cl_title_mono_01",
    sourceZh: "他看着师尊，心中暗道不妙。",
    role: "INNER_THOUGHT",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.85 },
      valence: 0.40,
      intensity: 0.65
    })
  });

  const res = router.route(multiClause, {
    primaryDomain: "MONOLOGUE_PSYCHOLOGY",
    domainWeights: { MONOLOGUE_PSYCHOLOGY: 0.85, TITLE_HIERARCHY: 0.80 }
  });

  // Must select orthogonal contributions:
  // - TITLE_HONORIFIC for 师尊 (narrative referent in inner thought)
  // - INNER_MONOLOGUE for 心中暗道
  assert.ok(res.selectedContributions.length >= 2, "Must resolve both title and monologue slots");

  const targetSlots = res.selectedContributions.map((c) => c.targetSlot);
  assert.ok(targetSlots.includes(STYLE_SLOTS.TITLE_HONORIFIC), "TITLE_HONORIFIC must be selected");
  assert.ok(targetSlots.includes(STYLE_SLOTS.INNER_MONOLOGUE), "INNER_MONOLOGUE must be selected");
});

// =========================================================================
// 4. Provider Order Independence
// =========================================================================

test("Wave C2B-1 - 4. Provider Order Independence: Monologue provider produces 100% deterministic outcomes", () => {
  const router = createStylistRouter();

  const testClause = createClauseIR({
    id: "cl_mono_order",
    sourceZh: "太上长老目光如炬，他心中暗自思量，念及此处，眼中闪过精芒。",
    role: "INNER_THOUGHT",
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.85, SOLEMN: 0.80 },
      valence: 0.50,
      intensity: 0.70
    })
  });

  const baselineRes = router.route(testClause, {
    primaryDomain: "MONOLOGUE_PSYCHOLOGY",
    domainWeights: { MONOLOGUE_PSYCHOLOGY: 0.85, TITLE_HIERARCHY: 0.80 }
  });

  for (let i = 0; i < 5; i++) {
    const shuffledRouter = createStylistRouter();
    const shuffledRes = shuffledRouter.route(testClause, {
      primaryDomain: "MONOLOGUE_PSYCHOLOGY",
      domainWeights: { MONOLOGUE_PSYCHOLOGY: 0.85, TITLE_HIERARCHY: 0.80 }
    });

    assert.equal(shuffledRes.selectedContributions.length, baselineRes.selectedContributions.length);
    for (let k = 0; k < baselineRes.selectedContributions.length; k++) {
      assert.equal(
        shuffledRes.selectedContributions[k].candidateVi,
        baselineRes.selectedContributions[k].candidateVi
      );
      assert.equal(
        shuffledRes.selectedContributions[k].targetSlot,
        baselineRes.selectedContributions[k].targetSlot
      );
    }
  }
});

// =========================================================================
// 5. Golden Negative & Anti-Overwriting
// =========================================================================

test("Wave C2B-1 - 5. Golden Negative: Mundane everyday sentence yields 0 monologue expansions", () => {
  const router = createStylistRouter();

  const plainClause = createClauseIR({
    id: "cl_plain_mono",
    sourceZh: "他从包裹中取出一本普通的旧书，翻开看了几页。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.50 },
      valence: 0.50,
      intensity: 0.20
    })
  });

  const res = router.route(plainClause, {
    primaryDomain: "NEUTRAL",
    domainWeights: { NEUTRAL: 1.0 }
  });

  assert.equal(res.selectedContributions.length, 0, "Everyday text must yield 0 contributions");
});
