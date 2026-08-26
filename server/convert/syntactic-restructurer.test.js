"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { restructureSyntax } = require("./syntactic-restructurer.js");

test("Syntactic Restructurer: reorders gaze and observer clauses naturally", () => {
  const raw = "Tại trong ánh mắt chấn kinh của mọi người, chuôi kiếm kia từ từ bay lên.";
  const polished = restructureSyntax(raw);

  assert.ok(polished.includes("Dưới ánh mắt chấn kinh của mọi người"));
});

test("Syntactic Restructurer: cleans temporal and causal prepositions", () => {
  const raw = "Tại ba ngày sau đó, bởi vì thương thế quá nặng duyên cớ, hắn không thể động đậy. Theo lấy thời gian trôi qua, nhìn thấy một màn này, hắn nghĩ tới chỗ này.";
  const polished = restructureSyntax(raw);

  assert.match(polished, /ba ngày sau/i);
  assert.match(polished, /do thương thế quá nặng/i);
  assert.match(polished, /thời gian dần trôi qua/i);
  assert.match(polished, /nhìn thấy cảnh tượng này/i);
  assert.match(polished, /nghĩ đến đây/i);
});
