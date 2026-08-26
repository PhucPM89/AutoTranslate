"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { adaptSatiricalBanter } = require("./banter-adapter.js");

test("Banter Adapter: sharpens sarcastic trash-talking and mockery in dialogue", () => {
  const raw = "Ngươi là đang cùng ta nói đùa sao? Cho mặt mà không cần mặt! Da mặt của ngươi thật dày, đúng là con cóc mà đòi ăn thịt thiên nga.";
  const adapted = adaptSatiricalBanter(raw);

  assert.match(adapted, /ngươi đang kể chuyện cười cho ta nghe đấy à\?/i);
  assert.match(adapted, /rượu mời không uống lại muốn uống rượu phạt/i);
  assert.match(adapted, /da mặt ngươi cũng dày bằng tường thành đấy nhỉ/i);
  assert.match(adapted, /cóc ghẻ mà đòi ăn thịt thiên nga/i);
});
