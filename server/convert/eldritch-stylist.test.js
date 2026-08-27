"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishEldritchProse } = require("./eldritch-stylist.js");

test("Eldritch Stylist: enhances cosmic horrors and sanity collapse", () => {
  const raw = "Sinh vật bất khả danh trạng xuất hiện, bên tai vang lên tiếng lẩm bẩm điên cuồng, khiến lý trí sụp đổ, thân thể ô nhiễm biến dạng.";
  const polished = polishEldritchProse(raw);

  assert.match(polished, /bất khả danh trạng, quái dị vượt xa tầm hiểu biết của nhân loại/i);
  assert.match(polished, /những lời thì thầm điên loạn tà ác vang vọng từ cõi vô tận/i);
  assert.match(polished, /tâm trí điên cuồng sụp đổ, hoàn toàn mất đi nhân tính/i);
  assert.match(polished, /bị tà năng ăn mòn làm biến dị méo mó kinh tởm/i);
});
