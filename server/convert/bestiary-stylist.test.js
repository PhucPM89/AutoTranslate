"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishBestiaryProse } = require("./bestiary-stylist.js");

test("Bestiary Stylist: infuses demonic roars and claws with primal power", () => {
  const raw = "Yêu khí ngập trời cuộn trào, hung thú gầm thét, đồng tử dựng đứng nhìn chăm chú, móng vuốt xé rách không gian mang theo huyết mạch áp chế.";
  const polished = polishBestiaryProse(raw);

  assert.match(polished, /yêu khí cuồn cuộn ngút trời/i);
  assert.match(polished, /hung thú gầm rống rung chuyển sơn hà/i);
  assert.match(polished, /đồng tử dựng đứng lóe lên hung quang dữ tợn/i);
  assert.match(polished, /móng vuốt sắc lẹm xé toạc hư không/i);
  assert.match(polished, /huyết mạch thượng cổ áp chế tuyệt đối/i);
});
