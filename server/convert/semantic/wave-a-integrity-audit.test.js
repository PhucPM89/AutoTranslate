"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createStylistRouter } = require("./stylist-router");
const { createClauseIR, createSemanticSignature, checkSignatureCompatibility } = require("./contracts");
const { evaluateExpansionBudget } = require("./expansion-budget");
const { ALCHEMY_CONTRIBUTION_DEFINITIONS } = require("./providers/alchemy-provider");
const { BEAST_CONTRACT_CONTRIBUTION_DEFINITIONS } = require("./providers/beast-contract-provider");
const { BESTIARY_CONTRIBUTION_DEFINITIONS } = require("./providers/bestiary-provider");
const { CULINARY_CONTRIBUTION_DEFINITIONS } = require("./providers/culinary-provider");
const { CYBER_CONTRIBUTION_DEFINITIONS } = require("./providers/cyber-scifi-provider");
const { DAOIST_ARRAY_CONTRIBUTION_DEFINITIONS } = require("./providers/daoist-array-provider");
const { INSCRIPT_CONTRIBUTION_DEFINITIONS } = require("./providers/inscript-provider");
const { MERIDIAN_HEALING_CONTRIBUTION_DEFINITIONS } = require("./providers/meridian-healing-provider");
const { NECROPOLIS_CONTRIBUTION_DEFINITIONS } = require("./providers/necropolis-provider");
const { SOUL_TOKEN_CONTRIBUTION_DEFINITIONS } = require("./providers/soul-token-provider");
const { SPATIAL_CONTRIBUTION_DEFINITIONS } = require("./providers/spatial-provider");
const { AUCTION_CONTRIBUTION_DEFINITIONS } = require("./providers/auction-provider");

// 1. Audit Taxonomy Verification
test("Wave A Integrity Audit: accurately classifies all 67 candidate definitions", () => {
  const allDefs = [
    ...ALCHEMY_CONTRIBUTION_DEFINITIONS,
    ...BEAST_CONTRACT_CONTRIBUTION_DEFINITIONS,
    ...BESTIARY_CONTRIBUTION_DEFINITIONS,
    ...CULINARY_CONTRIBUTION_DEFINITIONS,
    ...CYBER_CONTRIBUTION_DEFINITIONS,
    ...DAOIST_ARRAY_CONTRIBUTION_DEFINITIONS,
    ...INSCRIPT_CONTRIBUTION_DEFINITIONS,
    ...MERIDIAN_HEALING_CONTRIBUTION_DEFINITIONS,
    ...NECROPOLIS_CONTRIBUTION_DEFINITIONS,
    ...SOUL_TOKEN_CONTRIBUTION_DEFINITIONS,
    ...SPATIAL_CONTRIBUTION_DEFINITIONS,
    ...AUCTION_CONTRIBUTION_DEFINITIONS
  ];

  assert.equal(allDefs.length, 68, "Must account for all 68 Wave A definitions");

  for (const def of allDefs) {
    assert.ok(def.targetZh, "Must define targetZh");
    assert.ok(def.targetSlot, "Must define targetSlot");
    assert.ok(def.candidateVi, "Must define candidateVi");
    assert.ok(def.signature, "Must define signature");
    assert.ok(typeof def.expansionCost === "number", "Must define expansionCost");
    assert.ok(Array.isArray(def.introducedInformation), "Must define introducedInformation");
  }
});

// 2. Golden Negative Test: Prohibits ungrounded additions when source has neutral/minimal context
test("Wave A Integrity Audit - Negative: Rejects unsupported expansion when invariants forbid modifiers", () => {
  // Source: simple meridian text without chaotic state
  const simpleClause = createClauseIR({
    id: "cl_audit_neg_01",
    sourceZh: "气血平复",
    role: "ACTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { TRANQUIL: 0.90, NEUTRAL: 0.80 },
      valence: 0.10,
      intensity: 0.20
    }),
    invariants: { allowMetaphor: false, maxAdjectives: 0 }
  });

  // Candidate with heavy ungrounded inflation: "khí huyết vốn đang nghịch loạn dần dần bình ổn trở lại"
  const candidateVi = "khí huyết vốn đang nghịch loạn dần dần bình ổn trở lại";
  const budget = evaluateExpansionBudget(simpleClause, {
    targetVi: candidateVi,
    adjectiveCount: 2
  });

  assert.equal(budget.allowed, false, "Expansion Budget must block 2-adjective expansion on maxAdjectives: 0");
  assert.ok(budget.reason.includes("ADJECTIVE_BLOAT"));
});

// 3. Golden Negative Test: Prevents ordinary beast from triggering mountain-shattering roars
test("Wave A Integrity Audit - Negative: Ordinary wild beast does not activate mythical bestiary provider", () => {
  const router = createStylistRouter();

  // "A wild dog barked in the alley" (Non-demonic)
  const clause = createClauseIR({
    id: "cl_audit_neg_02",
    sourceZh: "野狗在巷子里吠叫",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { NEUTRAL: 0.90 },
      valence: 0.0,
      intensity: 0.20
    })
  });

  const context = {
    primaryDomain: "MUNDANE_DAILY",
    domainWeights: { MUNDANE_DAILY: 0.90, BESTIARY_DEMONIC: 0.0 }
  };

  const res = router.route(clause, context);

  // Bestiary provider must NOT be active
  assert.ok(!res.activeProviders.includes("bestiary-provider"), "Bestiary provider must remain inactive in mundane daily domain");
  assert.equal(res.selectedContributions.length, 0);
});

// 4. Provenance Trace Audit
test("Wave A Integrity Audit: ensures provenance captures expansion cost and introduced items", () => {
  const router = createStylistRouter();

  const clause = createClauseIR({
    id: "cl_audit_prov_01",
    sourceZh: "玉简记载",
    role: "DESCRIPTION",
    semanticSignature: createSemanticSignature({
      affectDistribution: { SOLEMN: 0.85, TRANQUIL: 0.70 },
      valence: 0.40,
      intensity: 0.60
    })
  });

  const context = {
    primaryDomain: "ANCIENT_INSCRIPTIONS",
    domainWeights: { ANCIENT_INSCRIPTIONS: 0.90 }
  };

  const res = router.route(clause, context);
  const item = res.selectedContributions.find((c) => c.sourceSpanZh === "玉简记载");

  assert.ok(item, "Must produce contribution");
  assert.equal(item.providerId, "inscript-provider");
  assert.equal(item.provenance, "inscript-provider:玉简记载");
  assert.ok(item.semanticExpansionCost > 0.0);
  assert.ok(item.introducedInformation.includes("ngàn năm") || item.introducedInformation.includes("cổ xưa"));
});
