"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { TTSEngine } = require("./tts.js");

test("TTSEngine: text segmentation and paragraph loading", () => {
  const tts = new TTSEngine();
  const sampleText = "Đoạn 1: Mở đầu câu chuyện.\n\nĐoạn 2: Nhân vật xuất hiện.\nĐoạn 3: Kết thúc chương.";
  tts.loadText(sampleText);

  assert.equal(tts.paragraphs.length, 3);
  assert.equal(tts.paragraphs[0], "Đoạn 1: Mở đầu câu chuyện.");
  assert.equal(tts.paragraphs[1], "Đoạn 2: Nhân vật xuất hiện.");
  assert.equal(tts.paragraphs[2], "Đoạn 3: Kết thúc chương.");
  assert.equal(tts.currentIndex, 0);
});

test("TTSEngine: speed adjustment bounds", () => {
  const tts = new TTSEngine();
  tts.setSpeed(1.25);
  assert.equal(tts.speed, 1.25);

  tts.setSpeed(0.1); // should clamp to 0.5
  assert.equal(tts.speed, 0.5);

  tts.setSpeed(5.0); // should clamp to 2.5
  assert.equal(tts.speed, 2.5);
});

test("TTSEngine: sleep timer countdown and chapter end mode", () => {
  const tts = new TTSEngine();
  let timerLabel = "";
  tts.onTimerTick = (str) => { timerLabel = str; };

  tts.setSleepTimer(15);
  assert.equal(tts.timerMinutes, 15);
  assert.equal(tts.timerRemainingSeconds, 15 * 60);
  assert.equal(timerLabel, "15:00");

  tts.setSleepTimer(-1); // Stop at chapter end
  assert.equal(tts.stopAtChapterEnd, true);
  assert.equal(timerLabel, "Hết chương");

  tts.setSleepTimer(0); // Turn off
  assert.equal(tts.stopAtChapterEnd, false);
  assert.equal(tts.timerRemainingSeconds, 0);
  assert.equal(timerLabel, "");
});
