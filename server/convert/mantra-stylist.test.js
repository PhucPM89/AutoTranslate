"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishMantraProse } = require("./mantra-stylist.js");

test("Mantra Stylist: enhances hand seals and divine incantations", () => {
  const raw = "Hắn bắt quyết niệm chú, miệng tụng chân ngôn, kết thủ ấn triệu hoán lôi đình, đạt tới cảnh giới ngôn xuất pháp tùy.";
  const polished = polishMantraProse(raw);

  assert.match(polished, /mười ngón tay thoăn thoắt bấm niệm pháp quyết biến ảo khôn lường/i);
  assert.match(polished, /miệng ngâm xướng đại đạo chân ngôn vang vọng đất trời/i);
  assert.match(polished, /kết thủ ấn thần tốc triệu hoán sức mạnh thiên địa/i);
  assert.match(polished, /ngôn xuất pháp tùy, lời nói ra tức là quy tắc của thiên địa/i);
});
