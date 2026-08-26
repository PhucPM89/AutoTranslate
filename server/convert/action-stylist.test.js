"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishActionProse } = require("./action-stylist.js");

test("Action Stylist: elevates martial strikes, sword clashes and impacts", () => {
  const raw = "Hắn một kiếm chém tới, kiếm khí chém rách không khí, đem đối phương đánh bay, đối phương phun ra một ngụm máu tươi, sắc mặt biến đổi lớn.";
  const polished = polishActionProse(raw);

  assert.ok(polished.includes("vung kiếm chém tới"));
  assert.ok(polished.includes("kiếm khí xé toạc không khí"));
  assert.ok(polished.includes("đánh văng đối phương bay ngược ra ngoài"));
  assert.ok(polished.includes("hộc ra một ngụm máu tươi"));
  assert.ok(polished.includes("sắc mặt đại biến"));
});

test("Action Stylist: enhances movement and auras", () => {
  const raw = "Thân hình lóe lên, khí thế bạo phát, uy áp bao phủ xuống cả ngọn núi.";
  const polished = polishActionProse(raw);

  assert.ok(polished.includes("thân hình thoắt lóe"));
  assert.ok(polished.includes("khí thế cuộn trào bùng nổ"));
  assert.ok(polished.includes("uy áp ngập tràn bao phủ xuống"));
});
