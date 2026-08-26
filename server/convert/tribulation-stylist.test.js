"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishTribulationProse } = require("./tribulation-stylist.js");

test("Tribulation Stylist: elevates heavenly tribulations and breakthrough phenomena", () => {
  const raw = "Mây kiếp cuồn cuộn trên vòm trời, tử tiêu thần lôi đánh xuống, hắn đột phá bình cảnh, dẫn phát thiên địa dị tượng và hà quang vạn đạo.";
  const polished = polishTribulationProse(raw);

  assert.match(polished, /mây kiếp đen kịt cuồn cuộn giăng kín vòm trời/i);
  assert.match(polished, /tử tiêu thần lôi xé toạc tầng mây ầm ầm giáng xuống/i);
  assert.match(polished, /phá toang bình cảnh gông cùm xiềng xích/i);
  assert.match(polished, /thiên địa dị tượng chấn động cả bát hoang/i);
  assert.match(polished, /vạn trượng ráng mây hào quang rực rỡ chiếu rọi cửu thiên/i);
});
