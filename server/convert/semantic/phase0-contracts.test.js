"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createSemanticSignature,
  checkSignatureCompatibility,
  createClauseIR,
  scoreContextShock,
  resolveWithAbstention,
  createProvenanceTrace
} = require("./contracts");

const { GOLDEN_FIXTURES } = require("./golden-fixtures");

test("Phase 0 Contracts: Semantic Signature creation & normalization", () => {
  const sig = createSemanticSignature({
    denotation: "COLD_SMILE",
    affectDistribution: { CONTEMPT: 0.85, hostility: 0.50, INVALID_TAG: 0.99 },
    valence: -0.70,
    intensity: 0.65,
    register: "CLASSICAL_LITERARY"
  });

  assert.equal(sig.denotation, "COLD_SMILE");
  assert.equal(sig.affectDistribution.CONTEMPT, 0.85);
  assert.equal(sig.affectDistribution.HOSTILITY, 0.50);
  assert.equal(sig.affectDistribution.INVALID_TAG, undefined, "Invalid affect tags must be stripped");
  assert.equal(sig.valence, -0.70);
  assert.equal(sig.intensity, 0.65);
  assert.equal(sig.register, "CLASSICAL_LITERARY");
});

test("Phase 0 Contracts: Multi-Label Affect Gating strictly rejects polarity & affect drift (e.g. 冷笑 -> mỉm cười an nhiên)", () => {
  const fixture = GOLDEN_FIXTURES.affectSignatures.find((f) => f.id === "affect_leng_xiao");
  assert.ok(fixture);

  // Valid candidates must pass
  for (const cand of fixture.validCandidates) {
    const res = checkSignatureCompatibility(fixture.expectedSignature, cand.sig);
    assert.equal(res.compatible, true, `Candidate "${cand.vi}" should be compatible with 冷笑`);
    assert.ok(res.score > 0.6);
  }

  // Invalid candidate (an nhiên mỉm cười) must be strictly rejected
  for (const cand of fixture.invalidCandidates) {
    const res = checkSignatureCompatibility(fixture.expectedSignature, cand.sig);
    assert.equal(res.compatible, false, `Candidate "${cand.vi}" must be rejected for polarity drift`);
    assert.match(res.reasons.join(" "), new RegExp(cand.expectedRejectReason, "i"));
  }
});

test("Phase 0 Contracts: Multi-Label Affect Gating for 苦笑 (bitter smile)", () => {
  const fixture = GOLDEN_FIXTURES.affectSignatures.find((f) => f.id === "affect_ku_xiao");
  assert.ok(fixture);

  for (const cand of fixture.validCandidates) {
    const res = checkSignatureCompatibility(fixture.expectedSignature, cand.sig);
    assert.equal(res.compatible, true, `Candidate "${cand.vi}" should be compatible with 苦笑`);
  }

  for (const cand of fixture.invalidCandidates) {
    const res = checkSignatureCompatibility(fixture.expectedSignature, cand.sig);
    assert.equal(res.compatible, false, `Candidate "${cand.vi}" must be rejected`);
  }
});

test("Phase 0 Contracts: Slot-based ClauseIR creation with Serial Actions", () => {
  const fixture = GOLDEN_FIXTURES.serialActionProDrop;
  const clause = fixture.expectedClauseIR;

  assert.equal(clause.tier, "SERIAL_ACTION");
  assert.equal(clause.subjectSlot.isImplicit, true);
  assert.equal(clause.actionSequence.length, 3);
  assert.equal(clause.actionSequence[0].verbZh, "拔剑");
  assert.equal(clause.actionSequence[2].verbZh, "凌空一斩");
  assert.equal(clause.invariants.preserveClauseOrder, true);
  assert.equal(clause.invariants.allowMetaphor, false);
});

test("Phase 0 Contracts: Shock Scorer rejects false positive inside quoted/ancient lore", () => {
  const quoteFixture = GOLDEN_FIXTURES.shockScenarios.find((s) => s.id === "shock_false_positive_quote");
  const decision = scoreContextShock(quoteFixture.evidence);

  assert.equal(decision.isShock, false);
  assert.equal(decision.transitionType, "RECOLLECTION_FILTERED");
  assert.equal(decision.recommendedAlpha, 0.85);
});

test("Phase 0 Contracts: Shock Scorer triggers on real acoustic & violent ambush", () => {
  const ambushFixture = GOLDEN_FIXTURES.shockScenarios.find((s) => s.id === "shock_true_positive_ambush");
  const decision = scoreContextShock(ambushFixture.evidence);

  assert.equal(decision.isShock, true);
  assert.equal(decision.transitionType, "PUNCTUAL_EVENT_SHOCK");
  assert.equal(decision.recommendedAlpha, 0.0);
});

test("Phase 0 Contracts: Uncertainty & Abstention resolves ambiguous ties to expected AMBIGUOUS state", () => {
  const ambigFixture = GOLDEN_FIXTURES.uncertaintyScenarios.find((s) => s.id === "uncertainty_ambiguous_brothers");
  const res = resolveWithAbstention(ambigFixture.candidates);

  assert.equal(res.status, "AMBIGUOUS");
  assert.equal(res.resolvedValue, "đối phương");
  assert.equal(res.flag, ambigFixture.expectedResult.flag);
  assert.ok(res.abstentionReason.includes("Margin delta"));
});

test("Phase 0 Contracts: Uncertainty & Abstention resolves high-confidence clear margin", () => {
  const confFixture = GOLDEN_FIXTURES.uncertaintyScenarios.find((s) => s.id === "uncertainty_confident_master");
  const res = resolveWithAbstention(confFixture.candidates);

  assert.equal(res.status, "RESOLVED");
  assert.equal(res.resolvedValue, "sư phụ");
  assert.equal(res.selectedId, "ent_su_phu_ly");
});

test("Phase 0 Contracts: Uncertainty & Abstention handles zero-evidence with UNKNOWN abstention", () => {
  const noEvFixture = GOLDEN_FIXTURES.uncertaintyScenarios.find((s) => s.id === "uncertainty_no_evidence");
  const res = resolveWithAbstention(noEvFixture.candidates);

  assert.equal(res.status, "UNKNOWN");
  assert.equal(res.resolvedValue, "người này");
  assert.equal(res.flag, "NO_EVIDENCE_ABSTENTION");
});

test("Phase 0 Contracts: Provenance Trace metadata integrity", () => {
  const trace = createProvenanceTrace({
    clauseId: "cl_trace_01",
    sourceZh: "他冷笑一声",
    finalVi: "Hắn cười lạnh một tiếng",
    contextSnapshot: { primaryDomain: "COMBAT" },
    discourseResolution: { status: "RESOLVED", entityId: "char_hero" },
    stylistAudit: [{ provider: "action-stylist", slot: "冷笑", status: "ACCEPTED" }]
  });

  assert.equal(trace.clauseId, "cl_trace_01");
  assert.equal(trace.finalVi, "Hắn cười lạnh một tiếng");
  assert.ok(trace.timestamp);
});
