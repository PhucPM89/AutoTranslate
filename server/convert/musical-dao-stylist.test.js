"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishMusicalProse } = require("./musical-dao-stylist.js");

test("Musical Stylist: enhances zither performances and sonic attacks", () => {
  const raw = "Nàng gảy dây đàn, tiếng đàn lượn lờ cất lên khúc cao sơn lưu thủy, đột nhiên chuyển thành âm ba giết địch.";
  const polished = polishMusicalProse(raw);

  assert.match(polished, /mười ngón tay ngọc nhẹ nhàng gảy từng cung bậc réo rắt/i);
  assert.match(polished, /tiếng đàn thánh thót du dương lượn lờ giữa không trung/i);
  assert.match(polished, /khúc nhạc Cao Sơn Lưu Thủy tri âm tri kỷ thấu tận tâm can/i);
  assert.match(polished, /từng đợt sóng âm sắc lẹm hóa thành thiên quân vạn mã trảm sát kẻ thù/i);
});
