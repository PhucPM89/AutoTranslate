"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishSupernaturalProse } = require("./supernatural-stylist.js");

test("Supernatural Stylist: enhances folklore ghosts and Taoist exorcisms", () => {
  const raw = "Hắn mở mắt âm dương, nhìn thấy lệ quỷ áo đỏ xuất hiện cùng đoàn rước dâu minh hôn, bèn rút kiếm gỗ đào đối phó thi biến.";
  const polished = polishSupernaturalProse(raw);

  assert.match(polished, /đôi mắt âm dương bẩm sinh có thể nhìn thấu âm hồn quỷ khí/i);
  assert.match(polished, /lệ quỷ áo đỏ oán khí ngút trời, sát khí nồng nặc rợn tóc gáy/i);
  assert.match(polished, /đoàn rước dâu minh hôn quỷ dị, hình nhân thế mạng nở nụ cười rùng rợn trong sương đêm/i);
  assert.match(polished, /kiếm gỗ đào ngàn năm cùng gương Bát Quái trấn áp tà ma/i);
  assert.match(polished, /thi thể đột ngột thi biến hóa thành cương thi khát máu bật dậy khỏi quan tài/i);
});
