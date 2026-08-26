"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishBeautyProse } = require("./courtly-beauty-stylist.js");

test("Beauty Stylist: elevates maiden descriptions and ethereal elegance", () => {
  const raw = "Nàng có da như mỡ đông, tóc đen như thác nước, mặc một thân bạch y thắng tuyết, ánh mắt lưu chuyển, quả thật khuynh quốc khuynh thành.";
  const polished = polishBeautyProse(raw);

  assert.match(polished, /làn da trắng ngần mịn màng như ngọc/i);
  assert.match(polished, /suối tóc đen tuyền buông xõa mượt mà/i);
  assert.match(polished, /tà áo trắng tinh khôi thanh khiết tựa tuyết đầu mùa/i);
  assert.match(polished, /ánh mắt long lanh tựa làn nước mùa thu/i);
  assert.match(polished, /nhan sắc tuyệt trần khuynh quốc khuynh thành/i);
});
