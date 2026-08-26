"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishTranscendenceProse } = require("./transcendence-stylist.js");

test("Transcendence Stylist: enhances thousand-year time skips and Daoist solitude", () => {
  const raw = "Búng tay ngàn năm đã qua, cố nhân sớm đã vật là người phi, hắn nhìn hết nhân gian phồn hoa, tiếp tục đại đạo độc hành.";
  const polished = polishTranscendenceProse(raw);

  assert.match(polished, /thấm thoắt ngàn năm trôi qua chỉ tựa một cái chớp mắt/i);
  assert.match(polished, /cảnh còn người mất, vật đổi sao dời/i);
  assert.match(polished, /ngắm nhìn hết thăng trầm dâu bể và phồn hoa chốn nhân gian/i);
  assert.match(polished, /độc bước trên con đường đại đạo thênh thang nhưng cô tịch lạnh lẽo/i);
});
