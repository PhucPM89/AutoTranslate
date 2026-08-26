"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishChessProse } = require("./cosmic-chess-stylist.js");

test("Chess Stylist: enhances cosmic chessboards and decisive moves", () => {
  const raw = "Hai vị đại năng lấy trời đất làm cờ, hạ cờ không hối hận, cuối cùng bỏ xe giữ tướng khi thắng bại đã phân.";
  const polished = polishChessProse(raw);

  assert.match(polished, /lấy trời đất làm bàn cờ, coi vạn vật chúng sinh tựa như những quân cờ/i);
  assert.match(polished, /hạ cờ không hối hận, một bước đi định đoạt càn khôn/i);
  assert.match(polished, /chấp nhận bỏ xe giữ tướng, bảo toàn đại cục/i);
  assert.match(polished, /thắng bại đã ngã ngũ, thế cờ đã định đoạt sinh tử/i);
});
