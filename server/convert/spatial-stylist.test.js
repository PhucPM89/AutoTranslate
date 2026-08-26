"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishSpatialProse } = require("./spatial-stylist.js");

test("Spatial Stylist: enhances void tears and dimension collapses", () => {
  const raw = "Hai cường giả va chạm làm không gian xé rách, hư không sụp đổ, dòng loạn lưu không gian cuốn phăng tất cả, hắn phá toái hư không rời đi.";
  const polished = polishSpatialProse(raw);

  assert.match(polished, /khe nứt không gian xé toạc chân trời phát ra tiếng rít chói tai/i);
  assert.match(polished, /hư không xung quanh sụp đổ vỡ vụn thành từng mảng lớn/i);
  assert.match(polished, /dòng loạn lưu không gian cuồng bạo cuốn phăng mọi thứ thành tro bụi/i);
  assert.match(polished, /phá toái hư không, đạp không mà đi/i);
});
