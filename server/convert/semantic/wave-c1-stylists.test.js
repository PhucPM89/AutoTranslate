"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createClauseIR, createSemanticSignature } = require("./contracts");
const { STYLE_SLOTS } = require("./providers/stylist-contribution");
const { createChronologyProvider } = require("./providers/chronology-provider");
const { createSoundscapeProvider } = require("./providers/soundscape-provider");
const { createSensoryProvider } = require("./providers/sensory-provider");
const { createStylistRouter } = require("./stylist-router");

// =========================================================================
// 1. Chronology Provider Tests
// =========================================================================

test("Wave C1 - 1. Chronology Provider: resolves ancient durations and preserves temporal bounds", () => {
  const provider = createChronologyProvider();

  // Test 1: 一炷香功夫 (Incense duration)
  const clause1 = createClauseIR({
    id: "cl_chrono_01",
    sourceZh: "两人交手不过一炷香功夫，胜负已分。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      denotation: "INCENSE_DURATION",
      affectDistribution: { TRANQUIL: 0.60, SOLEMN: 0.60 },
      valence: 0.50,
      intensity: 0.40
    })
  });
  const contribs1 = provider.contribute(clause1);
  assert.equal(contribs1.length, 1);
  assert.equal(contribs1[0].targetSlot, STYLE_SLOTS.TEMPORAL_MEASURE);
  assert.equal(contribs1[0].candidateVi, "chừng tàn một nén nhang");
  assert.equal(contribs1[0].introducedInformation.length, 0);

  // Test 2: 几个呼吸间 (Few breaths duration - NO ungrounded "ngắn ngủi")
  const clause2 = createClauseIR({
    id: "cl_chrono_02",
    sourceZh: "短短几个呼吸间，伤口便已愈合。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      denotation: "FEW_BREATHS_DURATION",
      affectDistribution: { RESOLUTE: 0.70 },
      valence: 0.50,
      intensity: 0.60
    })
  });
  const contribs2 = provider.contribute(clause2);
  assert.equal(contribs2.length, 1);
  assert.equal(contribs2[0].targetSlot, STYLE_SLOTS.TEMPORAL_MEASURE);
  assert.equal(contribs2[0].candidateVi, "trong vài nhịp thở");
  assert.equal(contribs2[0].candidateVi.includes("ngắn ngủi"), false, "Must not inject ungrounded 'ngắn ngủi'");

  // Test 3: 一盏茶功夫 (Tea duration)
  const clause3 = createClauseIR({
    id: "cl_chrono_03",
    sourceZh: "静坐一盏茶功夫，心境彻底平复。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      denotation: "TEA_DURATION",
      affectDistribution: { TRANQUIL: 0.80 },
      valence: 0.60,
      intensity: 0.35
    })
  });
  const contribs3 = provider.contribute(clause3);
  assert.equal(contribs3.length, 1);
  assert.equal(contribs3[0].candidateVi, "chừng tàn một tuần trà");
});

// =========================================================================
// 2. Soundscape Provider Tests
// =========================================================================

test("Wave C1 - 2. Soundscape Provider: resolves onomatopoeia and preserves acoustic intensity", () => {
  const provider = createSoundscapeProvider();

  // Test 1: 砰的一声 (Impact sound)
  const clause1 = createClauseIR({
    id: "cl_sound_01",
    sourceZh: "只听砰的一声巨响，大门被彻底轰碎。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      denotation: "IMPACT_CRASH_SOUND",
      affectDistribution: { FIERCE: 0.80 },
      valence: 0.40,
      intensity: 0.75
    })
  });
  const contribs1 = provider.contribute(clause1);
  assert.equal(contribs1.length, 1);
  assert.equal(contribs1[0].targetSlot, STYLE_SLOTS.SOUNDSCAPE_EFFECT);
  assert.equal(contribs1[0].candidateVi, "rầm một tiếng vang dội");
  assert.equal(contribs1[0].dimension, "RHYTHMIC");

  // Test 2: 咔嚓一声 (Bone/wood fracture)
  const clause2 = createClauseIR({
    id: "cl_sound_02",
    sourceZh: "咔嚓一声脆响，长枪寸寸断裂。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      denotation: "CRACKING_FRACTURE_SOUND",
      affectDistribution: { FIERCE: 0.75 },
      valence: 0.35,
      intensity: 0.70
    })
  });
  const contribs2 = provider.contribute(clause2);
  assert.equal(contribs2.length, 1);
  assert.equal(contribs2[0].candidateVi, "rắc một tiếng giòn giã");

  // Test 3: 剑鸣嗡嗡 (Sword hum)
  const clause3 = createClauseIR({
    id: "cl_sound_03",
    sourceZh: "长剑出鞘，剑鸣嗡嗡作响。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      denotation: "SWORD_HUM_SOUND",
      affectDistribution: { ELEVATED: 0.80 },
      valence: 0.50,
      intensity: 0.65
    })
  });
  const contribs3 = provider.contribute(clause3);
  assert.equal(contribs3.length, 1);
  assert.equal(contribs3[0].candidateVi, "thanh kiếm rung lên ong ong rền rĩ");
});

// =========================================================================
// 3. Sensory Provider Tests
// =========================================================================

test("Wave C1 - 3. Sensory Provider: resolves sensory imagery with strict dimension separation & metaphor safety", () => {
  const provider = createSensoryProvider();

  // Test 1: 月华如水 (Metaphor present in source)
  const clause1 = createClauseIR({
    id: "cl_sensory_01",
    sourceZh: "夜色深沉，庭院中月华如水。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      denotation: "MOONLIGHT_WATER_METAPHOR",
      affectDistribution: { TRANQUIL: 0.90 },
      valence: 0.60,
      intensity: 0.50
    })
  });
  const contribs1 = provider.contribute(clause1);
  assert.equal(contribs1.length, 1);
  assert.equal(contribs1[0].targetSlot, STYLE_SLOTS.ATMOSPHERIC_DETAIL);
  assert.equal(contribs1[0].candidateVi, "ánh trăng vằng vặc như dòng nước bạc");
  assert.equal(contribs1[0].dimension, "VISUAL");

  // Test 2: 月光洒落 (Plain visual moonlight - NO invented 'như nước hồ thu')
  const clause2 = createClauseIR({
    id: "cl_sensory_02",
    sourceZh: "一缕月光洒落窗前。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      denotation: "MOONLIGHT_SHINING_PLAIN",
      affectDistribution: { TRANQUIL: 0.80 },
      valence: 0.50,
      intensity: 0.35
    })
  });
  const contribs2 = provider.contribute(clause2);
  assert.equal(contribs2.length, 1);
  assert.equal(contribs2[0].candidateVi, "ánh trăng dịu mát rọi xuống");
  assert.equal(contribs2[0].candidateVi.includes("nước hồ thu"), false, "Must not inject ungrounded metaphor");

  // Test 3: 幽香阵阵 (Olfactory dimension only - NO invented taste or warmth)
  const clause3 = createClauseIR({
    id: "cl_sensory_03",
    sourceZh: "微风吹拂，殿内幽香阵阵。",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      denotation: "FAINT_FRAGRANCE",
      affectDistribution: { TRANQUIL: 0.85 },
      valence: 0.65,
      intensity: 0.40
    })
  });
  const contribs3 = provider.contribute(clause3);
  assert.equal(contribs3.length, 1);
  assert.equal(contribs3[0].candidateVi, "hương thơm thoang thoảng lan tỏa");
  assert.equal(contribs3[0].dimension, "OLFACTORY");

  // Test 4: 寒光闪烁 (VISUAL only - NO ungrounded thermal chill)
  const clause4 = createClauseIR({
    id: "cl_sensory_04",
    sourceZh: "剑锋之上，一道寒光闪烁。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      denotation: "COLD_LIGHT_GLINT",
      affectDistribution: { RESOLUTE: 0.80 },
      valence: 0.40,
      intensity: 0.65
    })
  });
  const contribs4 = provider.contribute(clause4);
  assert.equal(contribs4.length, 1);
  assert.equal(contribs4[0].candidateVi, "ánh lạnh sắc bén lóe lên");
  assert.equal(contribs4[0].dimension, "VISUAL");
});

// =========================================================================
// 4. Multi-Domain & Cross-Wave Interaction Tests
// =========================================================================

test("Wave C1 - 4. Multi-Domain Interaction: Soundscape + Combat + Sensory coexisting harmoniously", () => {
  const router = createStylistRouter();

  const multiClause = createClauseIR({
    id: "cl_c1_multi_01",
    sourceZh: "夜色中月光洒落，长剑出鞘叮的一声脆响，剑锋寒芒四射，一拳轰出！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { RESOLUTE: 0.85, FIERCE: 0.80 },
      valence: 0.40,
      intensity: 0.85
    })
  });

  const res = router.route(multiClause, {
    primaryDomain: "COMBAT",
    domainWeights: { COMBAT: 0.85, SOUNDSCAPE: 0.80, SENSORY_ATMOSPHERE: 0.70 }
  });

  // Selected contributions should resolve without slot collisions:
  // - ACTION_STRIKE from action provider (一拳轰出)
  // - SOUNDSCAPE_EFFECT from soundscape provider (叮的一声 -> keng một tiếng sắc lẹm)
  // - ATMOSPHERIC_DETAIL from sensory provider (月光洒落 / 寒芒四射)
  assert.ok(res.selectedContributions.length >= 2, "Must resolve multiple orthogonal domain slots");

  const targetSlots = res.selectedContributions.map((c) => c.targetSlot);
  assert.ok(targetSlots.includes(STYLE_SLOTS.SOUNDSCAPE_EFFECT), "Soundscape effect must be selected");
  assert.ok(
    targetSlots.includes(STYLE_SLOTS.ACTION_STRIKE) || targetSlots.includes(STYLE_SLOTS.WEAPON_STRIKE),
    "Martial strike slot must be selected"
  );
});

// =========================================================================
// 5. Provider Order Independence
// =========================================================================

test("Wave C1 - 5. Provider Order Independence: C1 providers maintain 100% deterministic outcomes under shuffle", () => {
  const router = createStylistRouter();

  const testClause = createClauseIR({
    id: "cl_order_c1",
    sourceZh: "两人交手不过一炷香功夫，空中白雾氤氲，只听砰的一声巨响！",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { FIERCE: 0.80, SOLEMN: 0.70 },
      valence: 0.45,
      intensity: 0.75
    })
  });

  const baselineRes = router.route(testClause, {
    primaryDomain: "COMBAT",
    domainWeights: { COMBAT: 0.85, CHRONOLOGY: 0.75, SOUNDSCAPE: 0.80, SENSORY_ATMOSPHERE: 0.70 }
  });

  for (let i = 0; i < 5; i++) {
    const shuffledRouter = createStylistRouter();
    const shuffledRes = shuffledRouter.route(testClause, {
      primaryDomain: "COMBAT",
      domainWeights: { COMBAT: 0.85, CHRONOLOGY: 0.75, SOUNDSCAPE: 0.80, SENSORY_ATMOSPHERE: 0.70 }
    });

    assert.equal(
      shuffledRes.selectedContributions.length,
      baselineRes.selectedContributions.length,
      "Shuffled provider ordering must yield identical contribution count"
    );

    for (let k = 0; k < baselineRes.selectedContributions.length; k++) {
      assert.equal(
        shuffledRes.selectedContributions[k].candidateVi,
        baselineRes.selectedContributions[k].candidateVi,
        "Shuffled candidate text must be 100% identical"
      );
      assert.equal(
        shuffledRes.selectedContributions[k].targetSlot,
        baselineRes.selectedContributions[k].targetSlot,
        "Shuffled target slot must be 100% identical"
      );
    }
  }
});

// =========================================================================
// 6. Golden Negatives & Anti-Overwriting
// =========================================================================

test("Wave C1 - 6. Golden Negative: Minimal everyday sentence produces 0 unsolicited C1 expansions", () => {
  const router = createStylistRouter();

  const plainClause = createClauseIR({
    id: "cl_plain_c1",
    sourceZh: "他坐在椅子上喝了一口白开水，随后站起身来。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.50 },
      valence: 0.0,
      intensity: 0.20
    })
  });

  const res = router.route(plainClause, {
    primaryDomain: "NEUTRAL",
    domainWeights: { NEUTRAL: 1.0 }
  });

  assert.equal(res.selectedContributions.length, 0, "Ordinary text must yield 0 contributions");
});
