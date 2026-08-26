"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishZenProse } = require("./zen-tea-stylist.js");

test("Zen Tea Stylist: enhances tea brewing and sudden epiphanies", () => {
  const raw = "Hai người ngồi nấu trà luận đạo, hương trà bốn phía, tâm như nước lặng, đột nhiên đốn ngộ đạo lý sinh tử.";
  const polished = polishZenProse(raw);

  assert.match(polished, /đun nước pha trà, cùng nhau đàm đạo nhân sinh thế sự/i);
  assert.match(polished, /hương trà thanh khiết thoang thoảng làm lòng người thư thái dịu êm/i);
  assert.match(polished, /tâm tịnh tựa mặt nước hồ thu không một gợn sóng/i);
  assert.match(polished, /trong khoảnh khắc bừng tỉnh đại ngộ, thấu tỏ huyền cơ thiên địa/i);
});
