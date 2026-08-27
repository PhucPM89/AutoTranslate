"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishCyberProse } = require("./cyber-scifi-stylist.js");

test("Cyber Sci-Fi Stylist: enhances neural links, VR, and mecha deployment", () => {
  const raw = "Hắn kích hoạt giao diện não máy để lặn vào ảo, trước mắt bật mở hình chiếu toàn tức, điều khiển cơ giáp sau khi nạp điện cơ giáp.";
  const polished = polishCyberProse(raw);

  assert.match(polished, /giao diện thần kinh não bộ đồng bộ 100%/i);
  assert.match(polished, /thâm nhập không gian thực tế ảo toàn phần/i);
  assert.match(polished, /hình chiếu không gian ba chiều holographic lập thể hiện lên sắc nét/i);
  assert.match(polished, /cơ giáp chiến đấu nạp đầy năng lượng nguyên tử sẵn sàng xuất kích/i);
});
