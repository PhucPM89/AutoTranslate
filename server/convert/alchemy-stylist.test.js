"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishAlchemyProse } = require("./alchemy-stylist.js");

test("Alchemy Stylist: elevates cauldron dynamics and pill aromas", () => {
  const raw = "Hắn đem thảo dược cho vào địa hỏa tôi luyện. Đột nhiên đan hương bốn phía phiêu tán, chín đạo đan văn xuất hiện, ngưng đan xuất thế.";
  const polished = polishAlchemyProse(raw);

  assert.match(polished, /tôi luyện trong Địa Hỏa cuộn trào/i);
  assert.match(polished, /đan hương ngào ngạt lan tỏa khắp bốn phía/i);
  assert.match(polished, /chín đạo đan văn tuyệt phẩm/i);
  assert.match(polished, /đan thành viên mãn, ngưng đan xuất thế/i);
});
