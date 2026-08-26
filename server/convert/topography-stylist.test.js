"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishTopographyProse } = require("./topography-stylist.js");

test("Topography Stylist: elevates sacred mountains and spiritual lands", () => {
  const raw = "Nơi đây là một tòa động thiên phúc địa, linh khí hóa vụ, mây mù lượn lờ bao phủ vách đá muôn trượng.";
  const polished = polishTopographyProse(raw);

  assert.match(polished, /động thiên phúc địa tràn đầy linh khí đất trời/i);
  assert.match(polished, /linh khí đậm đặc ngưng tụ thành từng làn sương mờ ảo/i);
  assert.match(polished, /mây mù lãng đãng vờn quanh đỉnh núi thiêng/i);
  assert.match(polished, /vách đá dựng đứng muôn trượng hiểm trở vô cùng/i);
});
