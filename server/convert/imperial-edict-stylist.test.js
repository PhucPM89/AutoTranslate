"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishImperialProse } = require("./imperial-edict-stylist.js");

test("Imperial Stylist: enhances imperial decrees and royal audiences", () => {
  const raw = "Thái giám tuyên đọc: Phụng thiên thừa vận, khâm thử! Toàn thể văn võ bá quan lãnh chỉ tạ ân, hô to vạn tuế vạn vạn tuế.";
  const polished = polishImperialProse(raw);

  assert.match(polished, /Phụng thiên thừa vận/i);
  assert.match(polished, /Khâm thử!/i);
  assert.match(polished, /khâm tuân thánh chỉ, khấu đầu tạ ơn long ân hạo đãng/i);
  assert.match(polished, /tiếng hô vạn tuế, vạn tuế, vạn vạn tuế vang dội khắp cung điện/i);
});
