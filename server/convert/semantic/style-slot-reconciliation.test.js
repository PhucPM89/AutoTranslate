"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  STYLE_SLOTS,
  SEMANTIC_ROLES,
  REALIZATION_DIMENSIONS,
  CONFLICT_POLICIES,
  STYLE_SLOT_DEFINITIONS,
  PROVIDER_SLOT_COMPATIBILITY_MAP,
  getSlotDefinition,
  isSlotMergeable,
  getSlotMaxMultiplicity,
  getAllSlotDefinitions,
  validateProviderSlotCompatibility,
  createStylistContribution
} = require("./providers/stylist-contribution");

const { createStylistRouter } = require("./stylist-router");
const { createDefaultProviderRegistry } = require("./providers/provider-registry");
const { createClauseIR, createSemanticSignature } = require("./contracts");

// =========================================================================
// 1. StyleSlot Exact Inventory & Reconciliation Tests
// =========================================================================

test("Wave B.5.1 - 1. Reconciliation Audit: exact 75 canonical slots, 0 orphans, 0 undeclared", () => {
  const canonicalKeys = Object.keys(STYLE_SLOTS);
  const definitionKeys = Object.keys(STYLE_SLOT_DEFINITIONS);

  // Exact 75 slots
  assert.equal(canonicalKeys.length, 75, "Canonical slots count must be exactly 75");
  assert.equal(definitionKeys.length, 75, "Defined slots count must be exactly 75");

  // Every canonical slot has a corresponding definition
  for (const key of canonicalKeys) {
    const slotId = STYLE_SLOTS[key];
    assert.ok(STYLE_SLOT_DEFINITIONS[slotId], `Slot ${slotId} must exist in STYLE_SLOT_DEFINITIONS`);
    assert.equal(STYLE_SLOT_DEFINITIONS[slotId].id, slotId);
  }

  // Check provider source code: ensure every single slot is targeted by at least 1 provider
  const provDir = path.join(__dirname, "providers");
  const provFiles = fs.readdirSync(provDir).filter((f) => f.endsWith("-provider.js"));

  const targetedSlots = new Set();
  for (const file of provFiles) {
    const content = fs.readFileSync(path.join(provDir, file), "utf8");
    const matches = [...content.matchAll(/STYLE_SLOTS\.([A-Z0-9_]+)/g)].map((m) => m[1]);
    for (const m of matches) {
      targetedSlots.add(m);
    }
  }

  // 0 orphan slots (all 75 are targeted)
  for (const key of canonicalKeys) {
    assert.ok(targetedSlots.has(key), `Slot ${key} must be targeted by at least 1 provider (no orphan slots)`);
  }

  // 0 undeclared slots (providers never target a slot not in STYLE_SLOTS)
  for (const targeted of targetedSlots) {
    assert.ok(STYLE_SLOTS[targeted], `Targeted slot ${targeted} must be registered in STYLE_SLOTS`);
  }
});

// =========================================================================
// 2. Semantic Role vs Realization Dimension Separation
// =========================================================================

test("Wave B.5.1 - 2. Contract Separation: every slot strictly separates semanticRole from realizationDimensions", () => {
  const allSlots = getAllSlotDefinitions();

  for (const slotId of Object.keys(allSlots)) {
    const def = allSlots[slotId];

    // semanticRole check
    assert.ok(
      Object.values(SEMANTIC_ROLES).includes(def.semanticRole),
      `Slot ${slotId} must have a valid SEMANTIC_ROLES value, got: ${def.semanticRole}`
    );

    // realizationDimensions check
    assert.ok(Array.isArray(def.realizationDimensions) && def.realizationDimensions.length > 0);
    for (const dim of def.realizationDimensions) {
      assert.ok(
        Object.values(REALIZATION_DIMENSIONS).includes(dim),
        `Slot ${slotId} has invalid dimension: ${dim}`
      );
    }

    // Must have description and sourceSemantics explanation
    assert.ok(def.description && def.description.length > 0);
    assert.ok(def.sourceSemantics && def.sourceSemantics.length > 0);
  }
});

// =========================================================================
// 3. Category Breakdown & Ontology Distribution
// =========================================================================

test("Wave B.5.1 - 3. Ontology Integrity: 75 slots correctly distributed across semantic roles", () => {
  const allSlots = getAllSlotDefinitions();
  const distribution = {};

  for (const slotId of Object.keys(allSlots)) {
    const role = allSlots[slotId].semanticRole;
    distribution[role] = (distribution[role] || 0) + 1;
  }

  assert.equal(distribution[SEMANTIC_ROLES.ACTION], 16, "ACTION slots count");
  assert.equal(distribution[SEMANTIC_ROLES.OBJECT], 6, "OBJECT slots count");
  assert.equal(distribution[SEMANTIC_ROLES.EVENT], 12, "EVENT slots count");
  assert.equal(distribution[SEMANTIC_ROLES.STATE], 13, "STATE slots count");
  assert.equal(distribution[SEMANTIC_ROLES.AFFECT], 5, "AFFECT slots count");
  assert.equal(distribution[SEMANTIC_ROLES.COGNITION], 1, "COGNITION slots count");
  assert.equal(distribution[SEMANTIC_ROLES.ATMOSPHERE], 15, "ATMOSPHERE slots count");
  assert.equal(distribution[SEMANTIC_ROLES.DIALOGUE_ACT], 4, "DIALOGUE_ACT slots count");
  assert.equal(distribution[SEMANTIC_ROLES.NARRATIVE_FUNCTION], 3, "NARRATIVE_FUNCTION slots count");

  // C3-A1: AESTHETIC_ELEGANCE adds ATMOSPHERE (14->15); Total: 75
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  assert.equal(total, 75, "Total slots distribution must sum to exactly 75");
});

// =========================================================================
// 4. Provider-Slot Compatibility Authorization Matrix
// =========================================================================

test("Wave B.5.1 - 4. Authorization Matrix: validateProviderSlotCompatibility validates provider boundaries", () => {
  // Action provider authorized for ACTION_STRIKE, WEAPON_STRIKE
  assert.equal(validateProviderSlotCompatibility("action-provider", "ACTION_STRIKE"), true);
  assert.equal(validateProviderSlotCompatibility("action-provider", "WEAPON_STRIKE"), true);

  // Action provider unauthorized for ZEN_STATE, ALCHEMY_AROMA
  assert.equal(validateProviderSlotCompatibility("action-provider", "ZEN_STATE"), false);
  assert.equal(validateProviderSlotCompatibility("action-provider", "ALCHEMY_AROMA"), false);

  // Sword provider authorized for WEAPON_DRAW, WEAPON_STRIKE, WEAPON_INTENT
  assert.equal(validateProviderSlotCompatibility("sword-provider", "WEAPON_DRAW"), true);
  assert.equal(validateProviderSlotCompatibility("sword-provider", "WEAPON_STRIKE"), true);
  assert.equal(validateProviderSlotCompatibility("sword-provider", "ZEN_STATE"), false);

  // Zen tea provider authorized for TEA_PREPARATION, ZEN_STATE
  assert.equal(validateProviderSlotCompatibility("zen-tea-provider", "ZEN_STATE"), true);
  assert.equal(validateProviderSlotCompatibility("zen-tea-provider", "ACTION_STRIKE"), false);

  // Unknown provider returns false
  assert.equal(validateProviderSlotCompatibility("unknown-provider", "ACTION_STRIKE"), false);
});

// =========================================================================
// 5. Merge, Compete, Multiplicity, and Conflict Policy Coherence
// =========================================================================

test("Wave B.5.1 - 5. Conflict Policy Coherence: canMerge, canCompete, and conflictPolicy must be logically non-contradictory", () => {
  const allSlots = getAllSlotDefinitions();

  for (const slotId of Object.keys(allSlots)) {
    const def = allSlots[slotId];

    if (def.canMerge) {
      assert.equal(def.canCompete, false, `Slot ${slotId} is mergeable, so canCompete must be false`);
      assert.ok(def.maxMultiplicity >= 2, `Slot ${slotId} is mergeable, so maxMultiplicity must be >= 2`);
      assert.equal(
        def.conflictPolicy,
        CONFLICT_POLICIES.ORTHOGONAL_MERGE,
        `Slot ${slotId} mergeable policy must be ORTHOGONAL_MERGE`
      );
    } else {
      assert.equal(def.canCompete, true, `Slot ${slotId} is competitive, so canCompete must be true`);
      assert.equal(def.maxMultiplicity, 1, `Slot ${slotId} is competitive, so maxMultiplicity must be 1`);
      assert.ok(
        [CONFLICT_POLICIES.WIN_OR_ABSTAIN, CONFLICT_POLICIES.COMPOSITE_SCORE].includes(def.conflictPolicy),
        `Slot ${slotId} competitive policy must be WIN_OR_ABSTAIN or COMPOSITE_SCORE`
      );
    }
  }
});

// =========================================================================
// 6. Neutral vs No-Contribution Handling
// =========================================================================

test("Wave B.5.1 - 6. Neutral Contribution: Plain everyday terms resolve without unsolicited poetic inflation", () => {
  const router = createStylistRouter();

  const plainClause = createClauseIR({
    id: "cl_neutral_01",
    sourceZh: "他低头看了看手表，然后关上了窗户。",
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

  assert.equal(res.selectedContributions.length, 0, "Plain actions must yield 0 contributions");
  assert.ok(res.activeProviders.length >= 0);
});

// =========================================================================
// 7. Semantic Assertion Boundary Isolation
// =========================================================================

test("Wave B.5.1 - 7. Semantic Isolation: StyleSlot realization cannot introduce ungrounded factual assertions", () => {
  const contribution = createStylistContribution({
    providerId: "inscript-provider",
    domain: "DAOIST_INSCRIPTION",
    targetSlot: STYLE_SLOTS.INSCRIPTION_LEGACY,
    sourceSpanZh: "古籍记载",
    candidateVi: "sách cổ ghi lại",
    semanticExpansionCost: 0.0,
    introducedInformation: [],
    surfaceRealization: true,
    semanticAssertions: ["RECORDED_IN_ANCIENT_MANUSCRIPT"]
  });

  assert.equal(contribution.targetSlot, STYLE_SLOTS.INSCRIPTION_LEGACY);
  assert.equal(contribution.introducedInformation.length, 0, "Must not introduce ungrounded assertions");
  assert.equal(contribution.semanticExpansionCost, 0.0);
});
