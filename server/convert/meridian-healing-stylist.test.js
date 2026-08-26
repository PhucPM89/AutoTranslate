"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishHealingProse } = require("./meridian-healing-stylist.js");

test("Healing Stylist: enhances acupuncture and meridian unblocking", () => {
  const raw = "Thần y lập tức ngân châm phong huyệt, khai thông kinh mạch, ép ra chất độc, khiến khí huyết bình phục.";
  const polished = polishHealingProse(raw);

  assert.match(polished, /đầu ngón tay thoăn thoắt hạ ngân châm chuẩn xác phong tỏa đại huyệt/i);
  assert.match(polished, /khai thông từng đường kinh mạch bế tắc/i);
  assert.match(polished, /ép toàn bộ độc tố đen kịt ra ngoài qua đầu ngón tay/i);
  assert.match(polished, /khí huyết vốn đang nghịch loạn dần dần bình ổn trở lại/i);
});
