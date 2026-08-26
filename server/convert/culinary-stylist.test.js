"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishCulinaryProse } = require("./culinary-stylist.js");

test("Culinary Stylist: enhances banquets and gastronomic sensations", () => {
  const raw = "Trên bàn bày đầy trân tu mỹ vị cùng quỳnh tương ngọc dịch, linh quả vào miệng là tan, khiến môi răng lưu hương, mọi người đẩy chén đổi ly.";
  const polished = polishCulinaryProse(raw);

  assert.match(polished, /trân tu mỹ vị, cao lương mỹ vị bày la liệt khắp bàn tiệc/i);
  assert.match(polished, /mỹ tửu quỳnh tương ngọc dịch thơm nồng ngất ngây/i);
  assert.match(polished, /vừa chạm vào đầu lưỡi đã tan chảy, đọng lại vị ngọt thanh khiết nơi cuống họng/i);
  assert.match(polished, /dư vị thơm ngát vấn vương mãi nơi đầu môi khóe miệng/i);
  assert.match(polished, /chén tạc chén thù, cùng nhau nâng ly cạn chén vô cùng rôm rả/i);
});
