"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishAuctionProse } = require("./auction-stylist.js");

test("Auction Stylist: elevates auction tension and hammer strikes", () => {
  const raw = "Toàn trường yên tĩnh, mọi người hít một ngụm khí lạnh, hắn thế tất phải có bảo vật này, cuối cùng một búa định giá.";
  const polished = polishAuctionProse(raw);

  assert.match(polished, /toàn bộ hội trường im phăng phắc như tờ/i);
  assert.match(polished, /hít vào một hơi khí lạnh/i);
  assert.match(polished, /ánh mắt rực lửa quyết tâm đoạt bằng được/i);
  assert.match(polished, /tiếng búa chốt giá dứt khoát vang lên giòn giã/i);
});
