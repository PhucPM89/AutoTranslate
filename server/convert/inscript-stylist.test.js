"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishInscriptProse } = require("./inscript-stylist.js");

test("Inscript Stylist: enhances jade slips and soul inheritances", () => {
  const raw = "Ngọc giản ghi lại bí thuật, nét chữ trên bia đá phát ra ánh sáng, phù văn lập lòe, lạc ấn truyền thừa xuất hiện.";
  const polished = polishInscriptProse(raw);

  assert.match(polished, /bên trong ngọc giản cổ xưa lưu lại thông tin ngàn năm/i);
  assert.match(polished, /những nét chữ rồng bay phượng múa cứng cáp khắc sâu trên bia đá cổ/i);
  assert.match(polished, /phù văn cổ xưa lập lòe phát ra vầng sáng kỳ bí/i);
  assert.match(polished, /lạc ấn truyền thừa khắc sâu vào tận linh hồn/i);
});
