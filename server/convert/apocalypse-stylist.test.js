"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishApocalypseProse } = require("./apocalypse-stylist.js");

test("Apocalypse Stylist: enhances zombie tides and genetic limit breakthroughs", () => {
  const raw = "Giữa mạt nhật phế thổ, làn sóng tang thi ập tới, hắn đột phá khóa gen, dị năng thức tỉnh.";
  const polished = polishApocalypseProse(raw);

  assert.match(polished, /vùng đất hoang tàn đổ nát của thời kỳ mạt thế/i);
  assert.match(polished, /thủy triều tang thi khát máu ầm ầm càn quét như ngày tận thế/i);
  assert.match(polished, /phá vỡ gông cùm xiềng xích của khóa gen di truyền/i);
  assert.match(polished, /dị năng nguyên tố bùng nổ thức tỉnh sức mạnh kinh thiên/i);
});
