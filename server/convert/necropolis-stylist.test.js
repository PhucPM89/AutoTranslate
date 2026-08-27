"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishNecropolisProse } = require("./necropolis-stylist.js");

test("Necropolis Stylist: enhances ancient tombs and corpse miasma", () => {
  const raw = "Bên trong cổ mộ, cỗ quan quách tỏa ra sương mù, tử khí và thi khí bốc lên, cơ quan ám khí bỗng nhiên phát động.";
  const polished = polishNecropolisProse(raw);

  assert.match(polished, /bên trong cổ mộ âm u ngập tràn tử khí lạnh lẽo/i);
  assert.match(polished, /cỗ quan quách ngàn năm tỏa ra hàn khí lạnh thấu xương/i);
  assert.match(polished, /tử khí và thi khí độc hại nồng nặc đến nghẹt thở/i);
  assert.match(polished, /cơ quan cạm bẫy trùng trùng điệp điệp kích hoạt ám khí sắc lẹm/i);
});
