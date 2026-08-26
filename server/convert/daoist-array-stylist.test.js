"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishDaoistArrayProse } = require("./daoist-array-stylist.js");

test("Daoist Array Stylist: enhances array triggers and talisman invocations", () => {
  const raw = "Hắn tìm ra mắt trận, bùa chú tự bốc cháy, khởi động đại trận làm đảo lộn càn khôn.";
  const polished = polishDaoistArrayProse(raw);

  assert.match(polished, /trận nhãn cốt lõi/i);
  assert.match(polished, /bùa chú tự bốc cháy thành tro bụi/i);
  assert.match(polished, /đại trận ầm ầm kích hoạt/i);
  assert.match(polished, /đảo lộn Càn Khôn, xoay chuyển đất trời/i);
});
