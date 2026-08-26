"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { adaptUrbanSlang } = require("./urban-slang-adapter.js");

test("Urban Slang Adapter: localizes modern memes and gaming tropes", () => {
  const raw = "Hắn không muốn thảng bình, nhưng công ty nội quyển quá mức. Đối thủ trong game khai quải và khắc kim, thích trang bức nhưng bị đánh mặt.";
  const adapted = adaptUrbanSlang(raw);

  assert.match(adapted, /buông xuôi mặc kệ đời/i);
  assert.match(adapted, /cạnh tranh khốc liệt/i);
  assert.match(adapted, /bật hack/i);
  assert.match(adapted, /nạp tiền cày game/i);
  assert.match(adapted, /làm màu ra vẻ/i);
  assert.match(adapted, /vả mặt bôm bốp/i);
});
