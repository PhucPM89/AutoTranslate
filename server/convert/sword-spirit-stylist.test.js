"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishSwordProse } = require("./sword-spirit-stylist.js");

test("Sword Stylist: enhances sword intent and blade spirit awakenings", () => {
  const raw = "Bảo kiếm ra khỏi vỏ, kiếm ý thông thiên bùng nổ, khí linh thức tỉnh khiến hắn đạt tới cảnh giới nhân kiếm hợp nhất.";
  const polished = polishSwordProse(raw);

  assert.match(polished, /bảo kiếm rời vỏ phát ra tiếng leng keng lảnh lót ngân vang/i);
  assert.match(polished, /kiếm ý thông thiên ngút trời xé toạc tầng mây/i);
  assert.match(polished, /khí linh thượng cổ từ từ thức tỉnh sau giấc ngủ vạn năm/i);
  assert.match(polished, /người và kiếm hòa làm một, người là kiếm, kiếm là người/i);
});
