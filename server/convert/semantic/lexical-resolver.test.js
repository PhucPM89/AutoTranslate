"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLexicalCandidate } = require("./lexical-candidate");
const { createLexicalCandidateGenerator } = require("./lexical-candidate-generator");
const { createLexicalResolver } = require("./lexical-resolver");
const { createSemanticSignature, checkSignatureCompatibility } = require("./contracts");

test("Lexical Disambiguation: 关上房门 resolves 门 to 'cửa' and rejects 'môn'", () => {
  const resolver = createLexicalResolver();
  const res = resolver.resolveText("关上房门", { primaryDomain: "URBAN_MODERN" });

  assert.equal(res.status, "RESOLVED");
  const doorSlot = res.resolvedSlots.find((s) => s.spanZh === "门");
  assert.ok(doorSlot);
  assert.equal(doorSlot.chosenVi, "cửa");

  // Check provenance records
  const doorRecord = res.resolutionRecords.find((r) => r.sourceSpan === "门");
  assert.ok(doorRecord);
  assert.equal(doorRecord.selectedCandidate, "cửa");
  assert.ok(doorRecord.alternatives.some((alt) => alt.candidate === "môn"));
});

test("Lexical Disambiguation: 佛门 resolves 门 to 'môn' and rejects 'cửa'", () => {
  const resolver = createLexicalResolver();
  const res = resolver.resolveText("佛门清净之地", { primaryDomain: "ZEN_TEA" });

  assert.equal(res.status, "RESOLVED");
  const sectSlot = res.resolvedSlots.find((s) => s.spanZh === "门");
  assert.ok(sectSlot);
  assert.equal(sectSlot.chosenVi, "môn");
});

test("Lexical Disambiguation: 重如泰山 resolves 重 to 'nặng'", () => {
  const resolver = createLexicalResolver();
  const res = resolver.resolveText("重如泰山");

  assert.equal(res.status, "RESOLVED");
  const heavySlot = res.resolvedSlots.find((s) => s.spanZh === "重");
  assert.ok(heavySlot);
  assert.equal(heavySlot.chosenVi, "nặng");
});

test("Lexical Disambiguation: 重整旗鼓 resolves 重 to 'lại' / 'chấn chỉnh'", () => {
  const resolver = createLexicalResolver();
  const res = resolver.resolveText("重整旗鼓");

  assert.equal(res.status, "RESOLVED");
  const renewSlot = res.resolvedSlots.find((s) => s.spanZh === "重");
  assert.ok(renewSlot);
  assert.equal(renewSlot.chosenVi, "lại");
});

test("Lexical Disambiguation: 一行人 resolves 行 to 'đoàn'", () => {
  const resolver = createLexicalResolver();
  const res = resolver.resolveText("一行人缓缓走来");

  assert.equal(res.status, "RESOLVED");
  const groupSlot = res.resolvedSlots.find((s) => s.spanZh === "行");
  assert.ok(groupSlot);
  assert.equal(groupSlot.chosenVi, "đoàn");
});

test("Hard Lock vs Soft Preference: Book Glossary 青云宗=Thanh Vân Tông is locked and never overruled", () => {
  const generator = createLexicalCandidateGenerator({
    nameGlossary: { "青云宗": "Thanh Vân Tông" }
  });
  const resolver = createLexicalResolver({ candidateGenerator: generator });
  const res = resolver.resolveText("青云宗大门敞开");

  const sectSlot = res.resolvedSlots.find((s) => s.spanZh === "青云宗");
  assert.ok(sectSlot);
  assert.equal(sectSlot.chosenVi, "Thanh Vân Tông");
  assert.equal(sectSlot.method, "GLOSSARY_LOCK");
  assert.equal(sectSlot.confidence, 1.0);
});

test("Semantic Signature Compatibility: 冷笑 candidate 'cười lạnh' accepted, 'mỉm cười an nhiên' rejected", () => {
  const sourceSig = createSemanticSignature({
    denotation: "SNEER_COLD",
    affectDistribution: { CONTEMPT: 0.85, HOSTILITY: 0.50 },
    valence: -0.70,
    intensity: 0.80
  });

  const validCandidateSig = createSemanticSignature({
    denotation: "COLD_SMILE",
    affectDistribution: { CONTEMPT: 0.90, HOSTILITY: 0.40 },
    valence: -0.65,
    intensity: 0.80
  });

  const invalidCandidateSig = createSemanticSignature({
    denotation: "PEACEFUL_SMILE",
    affectDistribution: { TRANQUIL: 0.90, JOY: 0.70 },
    valence: 0.70,
    intensity: 0.30
  });

  const validCheck = checkSignatureCompatibility(sourceSig, validCandidateSig);
  const invalidCheck = checkSignatureCompatibility(sourceSig, invalidCandidateSig);

  assert.equal(validCheck.compatible, true);
  assert.ok(validCheck.score >= 0.70);

  assert.equal(invalidCheck.compatible, false);
  assert.ok(invalidCheck.reasons.some((r) => r.toLowerCase().includes("polarity inversion") || r.toLowerCase().includes("valence drift")));
});

test("Lexical Resolver Fast Path: Unambiguous sentences resolve in Fast Path O(1)", () => {
  const resolver = createLexicalResolver();
  const res = resolver.resolveText("小心翼翼");

  assert.equal(res.status, "RESOLVED");
  assert.equal(res.method, "FAST_PATH");
  assert.equal(res.confidence, 1.0);
});
