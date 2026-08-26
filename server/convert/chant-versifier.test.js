"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { versifyClassicalChants } = require("./chant-versifier.js");

test("Chant Versifier: elevates famous heroic battle chants and couplets", () => {
  const raw = "Trời không sinh ta Lý Thuần Cương, kiếm đạo vạn cổ như đêm dài! Hắn một kiếm vung ra, Một kiếm ánh sáng lạnh mười chín châu.";
  const versified = versifyClassicalChants(raw);

  assert.ok(versified.includes("Trời không sinh ta Lý Thuần Cương, Kiếm đạo muôn đời tựa đêm trường."));
  assert.ok(versified.includes("Một kiếm hàn quang rực chín châu"));
});

test("Chant Versifier: elevates Daoist philosophy declarations", () => {
  const raw = "Mệnh ta do ta không do trời! Thuận vi phàm, nghịch tắc tiên!";
  const versified = versifyClassicalChants(raw);

  assert.ok(versified.includes("Mệnh ta do ta định, chẳng do trời!"));
  assert.ok(versified.includes("Thuận là phàm nhân, nghịch ắt thành tiên!"));
});
