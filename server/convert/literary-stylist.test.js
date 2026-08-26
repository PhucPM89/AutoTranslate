"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishLiteraryProse } = require("./literary-stylist.js");

test("Literary Stylist: polishes stiff Sino-Vietnamese grammar constructs", () => {
  // Test "nhất thời / một thời gian"
  assert.equal(
    polishLiteraryProse("Hắn nhất thời không biết phải làm sao trước tình thế này."),
    "Hắn thoáng chốc chẳng biết phải làm sao trước tình thế này."
  );

  // Test "bị... cấp..."
  assert.equal(
    polishLiteraryProse("Hắn bị đối phương cấp đánh trọng thương."),
    "Hắn bị đối phương đánh trọng thương."
  );

  // Test "không ngừng mà..."
  assert.equal(
    polishLiteraryProse("Tiếng kiếm minh không ngừng mà vang lên khắp quảng trường."),
    "Tiếng kiếm minh không ngừng vang lên khắp quảng trường."
  );

  // Test "mặt lộ vẻ cười lạnh"
  assert.equal(
    polishLiteraryProse("Diệp Phàm mặt lộ vẻ cười lạnh nhìn đối phương."),
    "Diệp Phàm nhếch mép cười khẩy nhìn đối phương."
  );

  // Test "trong lòng lộ ra vẻ kinh hãi"
  assert.equal(
    polishLiteraryProse("Mọi người trong lòng lộ ra vẻ kinh hãi."),
    "Mọi người trong lòng không khỏi kinh hãi."
  );

  // Test "nhịn không được mà"
  assert.equal(
    polishLiteraryProse("Nàng nhịn không được mà bật cười thành tiếng."),
    "Nàng không kìm được mà bật cười thành tiếng."
  );

  // Test "tại trong..."
  assert.equal(
    polishLiteraryProse("Hắn tại trong lòng thầm nghĩ."),
    "Hắn trong lòng thầm nghĩ."
  );
});

test("Literary Stylist: polishes punctuation spacing and rhythm", () => {
  const raw = "Hắn rút kiếm ra , ánh sáng lóa mắt ! ! ! ! Nàng nói:\"Đừng đi \" .";
  const polished = polishLiteraryProse(raw);
  assert.match(polished, /Hắn rút kiếm ra, ánh sáng lóa mắt!!! Nàng nói: "Đừng đi"./);
});
