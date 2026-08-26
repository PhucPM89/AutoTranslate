"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { enhanceSensoryImagery } = require("./sensory-enhancer.js");

test("Sensory Enhancer: enhances moonlight and scents", () => {
  const raw = "Đêm khuya thanh vắng, nguyệt hoa như thủy, u hương trận trận phiêu tán khắp phòng.";
  const polished = enhanceSensoryImagery(raw);

  assert.ok(polished.includes("ánh trăng vằng vặc như dòng nước bạc"));
  assert.ok(polished.includes("hương thơm thoang thoảng dịu ngọt"));
});

test("Sensory Enhancer: enhances mist, chill and killing intent", () => {
  const raw = "Trong cốc bạch vụ nhân uân, sát khí sâm nhiên khiến người khác run sợ.";
  const polished = enhanceSensoryImagery(raw);

  assert.ok(polished.includes("mây mù trắng xóa lượn lờ bao phủ"));
  assert.ok(polished.includes("sát khí lạnh thấu xương"));
});
