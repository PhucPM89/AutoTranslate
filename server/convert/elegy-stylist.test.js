"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { polishElegyProse } = require("./elegy-stylist.js");

test("Elegy Stylist: enhances memorial elegies and departed mentor farewells", () => {
  const raw = "Trước phần mộ sư phụ, hắn dập đầu: Hồn quy lai hề! Nguyện sư phụ ngậm cười nơi chín suối, anh hồn bất diệt, âm dung uyển tại.";
  const polished = polishElegyProse(raw);

  assert.match(polished, /hồn hỡi hồn ơi, xin hãy quy hồi nơi cố hương!/i);
  assert.match(polished, /nguyện cho người an lòng ngậm cười nơi chín suối/i);
  assert.match(polished, /anh hồn bất diệt, muôn đời khắc ghi công đức/i);
  assert.match(polished, /nụ cười và giọng nói ấm áp tựa như vẫn còn văng vẳng bên tai/i);
});
