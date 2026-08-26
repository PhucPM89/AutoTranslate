"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishKarmaProse } = require("./karma-stylist.js");

test("Karma Stylist: enhances karmic bonds and past-life awakenings", () => {
  const raw = "Hai người nhân quả quấn quanh, trải qua chín kiếp luân hồi, hôm nay quyết đấu số mệnh để chém đứt nhân quả.";
  const polished = polishKarmaProse(raw);

  assert.match(polished, /sợi tơ nhân quả chằng chịt quấn quanh số phận/i);
  assert.match(polished, /trải qua chín kiếp luân hồi chìm nổi trong bể khổ/i);
  assert.match(polished, /trận quyết đấu định mệnh đã được an bài từ ngàn năm trước/i);
  assert.match(polished, /vung kiếm chém đứt mọi sợi tơ nhân quả nghiệp duyên/i);
});
