"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createClauseIR, createSemanticSignature } = require("./contracts");
const { STYLE_SLOTS } = require("./providers/stylist-contribution");
const {
  createTitleHierarchyProvider,
  TITLE_TYPES,
  DISCOURSE_FUNCTIONS
} = require("./providers/title-hierarchy-provider");
const { createDiscourseTracker } = require("./entity-discourse-tracker");
const { createStylistRouter } = require("./stylist-router");

// =========================================================================
// 1. Title Semantics vs Discourse Function Separation Tests
// =========================================================================

test("Wave C2A.1 - 1. Title vs Discourse: 师尊 dynamically maps to SOCIAL_ADDRESS (Dialogue) vs TITLE_HONORIFIC (Narration)", () => {
  const provider = createTitleHierarchyProvider();

  // Dialogue case: “师尊，弟子知错了。”
  const dialogueClause = createClauseIR({
    id: "cl_c2a1_dial_01",
    sourceZh: "“师尊，弟子知错了。”",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({
      denotation: "REVERED_MASTER_ADDRESS",
      affectDistribution: { SOLEMN: 0.90 },
      valence: 0.50,
      intensity: 0.60
    })
  });
  const dialContribs = provider.contribute(dialogueClause);
  const masterDial = dialContribs.find((c) => c.sourceSpanZh === "师尊");
  assert.ok(masterDial, "师尊 must produce contribution in dialogue");
  assert.equal(masterDial.targetSlot, STYLE_SLOTS.SOCIAL_ADDRESS, "In dialogue, 师尊 maps to SOCIAL_ADDRESS");
  assert.equal(masterDial.semanticRequirements.discourseRole, DISCOURSE_FUNCTIONS.DIRECT_ADDRESS);
  assert.equal(masterDial.semanticRequirements.titleType, TITLE_TYPES.RELATIONSHIP_TITLE);

  // Narration case: 师尊走进大殿。
  const narrativeClause = createClauseIR({
    id: "cl_c2a1_narr_01",
    sourceZh: "师尊缓步走进了大殿之中。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      denotation: "REVERED_MASTER_ADDRESS",
      affectDistribution: { SOLEMN: 0.85 },
      valence: 0.50,
      intensity: 0.50
    })
  });
  const narrContribs = provider.contribute(narrativeClause);
  const masterNarr = narrContribs.find((c) => c.sourceSpanZh === "师尊");
  assert.ok(masterNarr, "师尊 must produce contribution in narration");
  assert.equal(masterNarr.targetSlot, STYLE_SLOTS.TITLE_HONORIFIC, "In narration, 师尊 maps to TITLE_HONORIFIC");
  assert.equal(masterNarr.semanticRequirements.discourseRole, DISCOURSE_FUNCTIONS.NARRATIVE_REFERENCE);
  assert.equal(masterNarr.semanticRequirements.titleType, TITLE_TYPES.RELATIONSHIP_TITLE);
});

// =========================================================================
// 2. Sovereign & Peerage Title Separation (王爷, 陛下)
// =========================================================================

test("Wave C2A.1 - 2. Title vs Discourse: 王爷 & 陛下 dynamically separate Direct Address from Narrative Mention", () => {
  const provider = createTitleHierarchyProvider();

  // Direct Address in Dialogue: “王爷，请用茶。”
  const princeDialClause = createClauseIR({
    id: "cl_c2a1_dial_prince",
    sourceZh: "“王爷，请用茶。”",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({
      denotation: "ROYAL_PRINCE_TITLE",
      affectDistribution: { SOLEMN: 0.80 },
      valence: 0.50,
      intensity: 0.40
    })
  });
  const princeDialContribs = provider.contribute(princeDialClause);
  const princeDial = princeDialContribs.find((c) => c.sourceSpanZh === "王爷");
  assert.ok(princeDial);
  assert.equal(princeDial.targetSlot, STYLE_SLOTS.SOCIAL_ADDRESS);
  assert.equal(princeDial.semanticRequirements.discourseRole, DISCOURSE_FUNCTIONS.DIRECT_ADDRESS);

  // Narrative Reference: 王爷冷冷地看着他。
  const princeNarrClause = createClauseIR({
    id: "cl_c2a1_narr_prince",
    sourceZh: "王爷冷冷地看着他。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      denotation: "ROYAL_PRINCE_TITLE",
      affectDistribution: { SOLEMN: 0.85 },
      valence: 0.35,
      intensity: 0.60
    })
  });
  const princeNarrContribs = provider.contribute(princeNarrClause);
  const princeNarr = princeNarrContribs.find((c) => c.sourceSpanZh === "王爷");
  assert.ok(princeNarr);
  assert.equal(princeNarr.targetSlot, STYLE_SLOTS.TITLE_HONORIFIC);
  assert.equal(princeNarr.semanticRequirements.discourseRole, DISCOURSE_FUNCTIONS.NARRATIVE_REFERENCE);
});

// =========================================================================
// 3. Self-Reference Boundaries & Register
// =========================================================================

test("Wave C2A.1 - 3. Self-Reference: Court & Religious self-designations active only in dialogue", () => {
  const provider = createTitleHierarchyProvider();

  // In Dialogue: “老衲这就告退。”
  const monkDialClause = createClauseIR({
    id: "cl_monk_dial",
    sourceZh: "“老衲这就告退。”",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({
      denotation: "BUDDHIST_ELDER_SELF_REF",
      affectDistribution: { TRANQUIL: 0.90 },
      valence: 0.50,
      intensity: 0.40
    })
  });
  const monkContribs = provider.contribute(monkDialClause);
  assert.equal(monkContribs.length, 1);
  assert.equal(monkContribs[0].candidateVi, "Lão nạp");
  assert.equal(monkContribs[0].semanticRequirements.discourseRole, DISCOURSE_FUNCTIONS.SELF_REFERENCE);

  // In Narration: self-reference must be suppressed or inactive
  const monkNarrClause = createClauseIR({
    id: "cl_monk_narr",
    sourceZh: "老衲走在路上。（假设非对话）",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.50 },
      valence: 0.50,
      intensity: 0.20
    })
  });
  const narrMonkContribs = provider.contribute(monkNarrClause);
  assert.equal(narrMonkContribs.length, 0, "Self-reference designations must be inactive in non-dialogue narration");
});

// =========================================================================
// 4. Title + Name Boundary Safety
// =========================================================================

test("Wave C2A.1 - 4. Title + Name Boundaries: Title provider targets exact title without corrupting proper noun names", () => {
  const provider = createTitleHierarchyProvider();

  const nameCases = [
    { sourceZh: "师尊叶辰缓缓开口。", titleZh: "师尊", titleVi: "sư tôn" },
    { sourceZh: "王爷萧炎端坐上方。", titleZh: "王爷", titleVi: "vương gia" },
    { sourceZh: "张公子拱手行礼。", titleZh: "公子", titleVi: "công tử" },
    { sourceZh: "林小姐微微一笑。", titleZh: "小姐", titleVi: "tiểu thư" }
  ];

  for (const tc of nameCases) {
    const clause = createClauseIR({
      id: `cl_name_${tc.titleZh}`,
      sourceZh: tc.sourceZh,
      role: "ACTION",
      semanticSignature: createSemanticSignature({
        affectDistribution: { SOLEMN: 0.70 },
        valence: 0.50,
        intensity: 0.50
      })
    });
    const contribs = provider.contribute(clause);
    const target = contribs.find((c) => c.sourceSpanZh === tc.titleZh);
    assert.ok(target, `Must find title contribution for ${tc.titleZh}`);
    assert.equal(target.candidateVi, tc.titleVi);
    assert.equal(target.sourceSpanZh, tc.titleZh, "Source span must be strictly the title token, preserving proper name");
  }
});

// =========================================================================
// 5. Title + Pronoun Integrity
// =========================================================================

test("Wave C2A.1 - 5. Title + Pronoun Integrity: 他看向师尊 does not alter sentence pronouns", () => {
  const provider = createTitleHierarchyProvider();

  const clause = createClauseIR({
    id: "cl_pronoun_integ",
    sourceZh: "他转过身来，深深地看向师尊。",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.80 },
      valence: 0.50,
      intensity: 0.55
    })
  });

  const contribs = provider.contribute(clause);
  assert.equal(contribs.length, 1);
  assert.equal(contribs[0].sourceSpanZh, "师尊");
  assert.equal(contribs[0].candidateVi, "sư tôn");
  assert.equal(contribs[0].introducedInformation.length, 0);
});

// =========================================================================
// 6. Register Safety: Sovereign Title Never Degrades to Slang
// =========================================================================

test("Wave C2A.1 - 6. Register Safety: 陛下 preserves SOLEMN_DECREE register", () => {
  const provider = createTitleHierarchyProvider();

  const clause = createClauseIR({
    id: "cl_reg_safety",
    sourceZh: "“陛下圣明！”",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.95 },
      valence: 0.60,
      intensity: 0.70
    })
  });

  const contribs = provider.contribute(clause);
  const monarch = contribs.find((c) => c.sourceSpanZh === "陛下");
  assert.ok(monarch);
  assert.equal(monarch.register, "SOLEMN_DECREE");
  assert.equal(monarch.candidateVi, "Bệ hạ");
});

// =========================================================================
// 7. Provenance Trace Verification
// =========================================================================

test("Wave C2A.1 - 7. Provenance Trace: Captures titleMeaning, discourseRole, and targetSlot accurately", () => {
  const provider = createTitleHierarchyProvider();

  const clause = createClauseIR({
    id: "cl_prov_trace",
    sourceZh: "“师兄，你等等我。”",
    role: "DIALOGUE",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.70 },
      valence: 0.60,
      intensity: 0.40
    })
  });

  const contribs = provider.contribute(clause);
  assert.equal(contribs.length, 1);
  assert.equal(
    contribs[0].provenance,
    "title-hierarchy-provider:师兄->SOCIAL_ADDRESS:DIRECT_ADDRESS:RELATIONSHIP_TITLE"
  );
});
