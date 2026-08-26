"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishSoulTokenProse } = require("./soul-token-stylist.js");

test("Soul Token Stylist: enhances shattering life tokens and extinguished lamps", () => {
  const raw = "Bên trong từ đường, mệnh bài vỡ vụn, hồn đăng dập tắt khiến tổ miếu chấn động.";
  const polished = polishSoulTokenProse(raw);

  assert.match(polished, /mệnh bài bản mệnh răng rắc vỡ vụn thành từng mảnh vụn/i);
  assert.match(polished, /ngọn hồn đăng đại diện cho sinh mệnh bỗng nhiên phụt tắt/i);
  assert.match(polished, /tổ miếu rung chuyển dữ dội, chấn động toàn bộ tông môn/i);
});
