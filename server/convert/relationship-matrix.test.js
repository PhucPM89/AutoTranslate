"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyScene, getScenePronounInstruction } = require("./relationship-matrix.js");

test("Relationship Matrix: classifies combat scenes", () => {
  const combatText = "李子夜一剑斩出，怒吼道：'狂妄小儿，受死吧！今日便是你的死期！' 轰然一声巨响，魔气破空。";
  assert.equal(classifyScene(combatText), "combat");

  const guide = getScenePronounInstruction("combat");
  assert.match(guide, /Ngươi - Ta/);
  assert.match(guide, /Đanh thép/);
});

test("Relationship Matrix: classifies romance scenes", () => {
  const romanceText = "她俏脸微红，美眸含情脉脉地望着他，将娇躯轻轻依偎在他的怀中，心跳不由自主地加快。";
  assert.equal(classifyScene(romanceText), "romance");

  const guide = getScenePronounInstruction("romance");
  assert.match(guide, /Chàng - Thiếp/);
});

test("Relationship Matrix: classifies master-disciple scenes", () => {
  const masterText = "弟子李子夜拜见师尊！谨遵师命，徒儿定当不负恩师重托。老夫微微点头，为其解惑。";
  assert.equal(classifyScene(masterText), "master_disciple");

  const guide = getScenePronounInstruction("master_disciple");
  assert.match(guide, /Sư tôn/);
});

test("Relationship Matrix: classifies modern urban scenes", () => {
  const modernText = "他拿出手里的苹果手机拨打了电话，随后开着汽车前往市中心的一家咖啡店，路上看到不少警察和出租车。";
  assert.equal(classifyScene(modernText), "modern_urban");

  const guide = getScenePronounInstruction("modern_urban");
  assert.match(guide, /Cậu - Tôi/);
});
