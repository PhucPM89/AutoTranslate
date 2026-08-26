"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateFluencyScore,
  auditGlossaryCompliance,
  reflectAndPolish
} = require("./reflection-engine.js");

test("Reflection Engine: calculateFluencyScore penalizes stiff grammar and Han remnants", () => {
  const stiffText = "Đối với hắn tới nói, tại trước mắt chuyện này có chút ít kỳ quái 李子夜.";
  const result = calculateFluencyScore(stiffText);

  assert.ok(result.score < 9.0);
  assert.ok(result.issues.length >= 2);
});

test("Reflection Engine: calculateFluencyScore awards 10/10 to polished literary prose", () => {
  const polishedText = "Lý Tử Dạ tay cầm trường kiếm, thần sắc thản nhiên nhìn về phía chân trời xa xăm.";
  const result = calculateFluencyScore(polishedText);

  assert.equal(result.score, 10.0);
  assert.equal(result.issues.length, 0);
});

test("Reflection Engine: auditGlossaryCompliance detects missing terms", () => {
  const text = "Lý Tử Dạ bước vào sơn môn.";
  const glossary = { "青云门": "Thanh Vân Môn", "李子夜": "Lý Tử Dạ" };

  const audit = auditGlossaryCompliance(text, glossary);
  assert.equal(audit.compliant, false);
  assert.deepEqual(audit.missingTerms, ["Thanh Vân Môn"]);
});

test("Reflection Engine: reflectAndPolish cleans stiff structures and boosts fluency score", () => {
  const unrefined = "Đối với hắn tới nói, chuyện này trong lòng không khỏi có chút kỳ quái, hắn không ngừng mà bước đi.";
  const result = reflectAndPolish(unrefined);

  assert.equal(result.improved, true);
  assert.ok(result.text.includes("đối với hắn mà nói"));
  assert.ok(result.text.includes("trong lòng không khỏi kỳ quái"));
  assert.ok(result.text.includes("không ngừng bước đi"));
  assert.ok(result.finalScore > result.initialScore);
});
