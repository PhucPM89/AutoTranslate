"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishGrimoireProse } = require("./grimoire-magic-stylist.js");

test("Grimoire Stylist: enhances arcane spells and grand forbidden curses", () => {
  const raw = "Pháp sư ngâm xướng chú ngữ, ma lực dâng trào kích hoạt ma pháp trận để giải phóng cấm chú.";
  const polished = polishGrimoireProse(raw);

  assert.match(polished, /cất giọng ngâm xướng cổ ngữ ma pháp âm vang trang nghiêm/i);
  assert.match(polished, /ma lực vô tận cuồn cuộn dâng trào như bão táp đại dương/i);
  assert.match(polished, /ma pháp trận rực sáng những ký tự cổ ngữ thần bí/i);
  assert.match(polished, /đại cấm chú ma pháp hủy thiên diệt địa/i);
});
