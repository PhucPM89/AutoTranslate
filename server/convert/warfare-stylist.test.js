"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishWarfareProse } = require("./warfare-stylist.js");

test("Warfare Stylist: elevates battlefield charges and war drums", () => {
  const raw = "Quân lính đánh trống trợ uy, thiên quân vạn mã xung phong, khói lửa ngập trời, các tướng sĩ huyết chiến sa trường.";
  const polished = polishWarfareProse(raw);

  assert.match(polished, /tiếng trống trận dồn dập rền vang rung chuyển trời đất/i);
  assert.match(polished, /thiên quân vạn mã gầm thét ầm ầm xông pha trận mạc/i);
  assert.match(polished, /khói lửa ngút trời bao trùm cả một vùng biên cương quan ải/i);
  assert.match(polished, /quyết tử huyết chiến nơi sa trường đẫm máu/i);
});
