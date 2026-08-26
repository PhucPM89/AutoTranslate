"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishDivineSenseProse } = require("./divine-sense-stylist.js");

test("Divine Sense Stylist: enhances soul pressure and domain expansions", () => {
  const raw = "Thần thức quét qua toàn bộ sơn mạch, một cỗ uy áp giáng lâm khiến thức hải chấn động, hắn lập tức mở ra lĩnh vực.";
  const polished = polishDivineSenseProse(raw);

  assert.match(polished, /thần thức mênh mông như thủy triều cuồn cuộn quét qua/i);
  assert.match(polished, /uy áp kinh thiên động địa ầm ầm giáng xuống đè nặng không gian/i);
  assert.match(polished, /thức hải dậy sóng dữ dội chấn động kịch liệt/i);
  assert.match(polished, /lĩnh vực tuyệt đối ầm ầm mở rộng bao trùm vạn dặm/i);
});
