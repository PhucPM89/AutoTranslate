"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishBeastContractProse } = require("./beast-contract-stylist.js");

test("Beast Contract Stylist: enhances soul contracts and familiar evolutions", () => {
  const raw = "Hắn mở ra trận pháp khế ước, ký kết khế ước bình đẳng, giúp bản mệnh linh thú tiến hóa.";
  const polished = polishBeastContractProse(raw);

  assert.match(polished, /trận pháp khế ước linh hồn rực sáng hào quang rực rỡ/i);
  assert.match(polished, /lạc ấn khế ước bình đẳng cộng sinh khắc sâu vào thức hải/i);
  assert.match(polished, /bản mệnh linh thú bứt phá tiến hóa lên đẳng cấp thần thoại/i);
});
