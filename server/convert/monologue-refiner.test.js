"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { refineInnerMonologue } = require("./monologue-refiner.js");

test("Monologue Refiner: refines repetitive thought markers and emotional shifts", () => {
  const raw = "Hắn trong lòng âm thầm suy nghĩ, trong lòng hiện lên một cỗ nghi hoặc. Trong đầu lóe lên một cái ý niệm, nghĩ tới đây, trong mắt lóe lên tinh quang.";
  const refined = refineInnerMonologue(raw);

  assert.match(refined, /trong lòng thầm tính toán/i);
  assert.match(refined, /trong lòng dấy lên từng đợt nghi hoặc/i);
  assert.match(refined, /trong đầu chợt lóe lên một ý nghĩ/i);
  assert.match(refined, /trong mắt hắn lóe lên tia sáng sắc lạnh/i);
});
