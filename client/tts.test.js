"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { TTSEngine, TTS_VOICE, splitLongParagraph } = require("./tts.js");

test("TTSEngine: exposes only the shared Hoai My Edge voice", () => {
  const tts = new TTSEngine();
  assert.equal(TTS_VOICE.voiceURI, "vi-VN-HoaiMyNeural");
  assert.deepEqual(tts.getAvailableVoices().map((voice) => voice.voiceURI), ["vi-VN-HoaiMyNeural"]);
});

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

test("TTSEngine: stop() cleans up active utterances", () => {
  const tts = new TTSEngine();
  tts._utterances.add({ mock: true });
  assert.equal(tts._utterances.size, 1);

  tts.stop();
  assert.equal(tts.isPlaying, false);
  assert.equal(tts.isPaused, false);
  assert.equal(tts._utterances.size, 0);
});

test("TTSEngine: splits oversized paragraphs before sending them to Edge-TTS", () => {
  const chunks = splitLongParagraph(`${"Một câu truyện dài. ".repeat(200)}`.trim());
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 2800));
  assert.equal(chunks.join(" ").replace(/\s+/g, " "), `${"Một câu truyện dài. ".repeat(200)}`.trim());
});

test("TTSEngine: reuses locally cached audio instead of synthesizing twice", async () => {
  const originalFetch = global.fetch;
  const originalCaches = global.caches;
  const entries = new Map();
  let requests = 0;
  global.caches = {
    async open() {
      return {
        async match(key) { return entries.get(key)?.clone(); },
        async put(key, response) { entries.set(key, response.clone()); }
      };
    }
  };
  global.fetch = async () => {
    requests += 1;
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
  };

  try {
    const first = new TTSEngine();
    const second = new TTSEngine();
    assert.equal((await first.getAudioBlob("Một đoạn truyện.")).size, 3);
    assert.equal((await second.getAudioBlob("Một đoạn truyện.")).size, 3);
    assert.equal(requests, 1);
  } finally {
    global.fetch = originalFetch;
    global.caches = originalCaches;
  }
});

