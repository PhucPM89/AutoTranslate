"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishMadnessProse } = require("./madness-stylist.js");

test("Madness Stylist: enhances demonic frenzy and qi deviation", () => {
  const raw = "Hắn tẩu hỏa nhập ma, hai mắt đỏ ngầu, sát ý ngập trời, rơi vào vạn kiếp bất phục.";
  const polished = polishMadnessProse(raw);

  assert.match(polished, /tẩu hỏa nhập ma, kinh mạch nghịch chuyển hỗn loạn/i);
  assert.match(polished, /đôi mắt đỏ ngầu rực lửa hằn lên từng tia máu điên dại/i);
  assert.match(polished, /sát ý ngút trời cuồng bạo tựa sóng thần giận dữ/i);
  assert.match(polished, /vạn kiếp bất phục, muôn đời không thể quay đầu/i);
});
