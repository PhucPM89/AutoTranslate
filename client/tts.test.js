"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { TTSEngine, TTS_VOICE, splitLongParagraph, splitChapterForAudio, mergeMp3Blobs } = require("./tts.js");

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

test("TTSEngine: full-chapter cache changes when chapter text changes", async () => {
  const originalFetch = global.fetch;
  const originalCaches = global.caches;
  let requests = 0;
  global.caches = undefined;
  global.fetch = async () => {
    requests += 1;
    return new Response(new Uint8Array([requests]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
  };
  try {
    const tts = new TTSEngine();
    const options = { fullChapter: true, bookId: "book", chapterNumber: 1 };
    await tts.getAudioBlob("Nội dung cũ", options);
    await tts.getAudioBlob("Nội dung mới", options);
    assert.equal(requests, 2);
  } finally {
    global.fetch = originalFetch;
    global.caches = originalCaches;
  }
});

test("TTSEngine: builds long chapters in the browser and returns one MP3 blob", async () => {
  const originalFetch = global.fetch;
  const originalCaches = global.caches;
  const calls = [];
  global.caches = undefined;
  global.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body);
    calls.push(payload);
    const id3 = [0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0];
    return new Response(Uint8Array.from([...id3, calls.length, 0xff, 0xfb]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
  };
  try {
    const tts = new TTSEngine();
    const text = Array.from({ length: 80 }, (_, i) => `Đoạn ${i}: ${"nội dung ".repeat(8)}`).join("\n\n");
    assert.ok(splitChapterForAudio(text).length > 1);
    const blob = await tts.fetchAudioBlob(text, { fullChapter: true, bookId: "book", chapterNumber: 2 });
    const bytes = Buffer.from(await blob.arrayBuffer());
    assert.ok(calls.length > 1);
    assert.ok(calls.every((call) => call.fullChapter === false));
    assert.equal((bytes.toString("latin1").match(/ID3/g) || []).length, 1);
    assert.equal(blob.type, "audio/mpeg");
  } finally {
    global.fetch = originalFetch;
    global.caches = originalCaches;
  }
});

test("mergeMp3Blobs removes metadata between independently generated parts", async () => {
  const tag = Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
  const merged = await mergeMp3Blobs([new Blob([tag, Uint8Array.from([1, 2])]), new Blob([tag, Uint8Array.from([3, 4])])]);
  assert.deepEqual(Array.from(new Uint8Array(await merged.arrayBuffer())), [...tag, 1, 2, 3, 4]);
});

test("TTSEngine: retries transient Edge-TTS failures before giving up", async () => {
  const originalFetch = global.fetch;
  const originalCaches = global.caches;
  let requests = 0;
  global.caches = undefined;
  global.fetch = async () => {
    requests += 1;
    if (requests < 3) {
      return new Response(JSON.stringify({ error: "Edge đang bận" }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(new Uint8Array([4, 5, 6, 7]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
  };

  try {
    const tts = new TTSEngine();
    assert.equal((await tts.getAudioBlob("Một đoạn cần retry.")).size, 4);
    assert.equal(requests, 3);
  } finally {
    global.fetch = originalFetch;
    global.caches = originalCaches;
  }
});

test("TTSEngine: loadChapter configures offsets and calculates paragraph timestamps correctly", () => {
  const tts = new TTSEngine();
  const sample = "Đoạn 1.\n\nĐoạn 2 dài hơn nhiều.\n\nĐoạn 3 kết.";
  tts.loadChapter({
    bookId: "test-book-123",
    chapterNumber: 10,
    text: sample,
    title: "Chương 10: Khởi đầu"
  });

  assert.equal(tts.bookId, "test-book-123");
  assert.equal(tts.chapterNumber, 10);
  assert.equal(tts.isFullChapter, true);
  assert.equal(tts.paragraphs.length, 3);
  assert.ok(tts.totalChars > 0);
  assert.equal(tts.paragraphOffsets.length, 3);

  // Mock audio object with duration
  tts.audio = { duration: 100, currentTime: 0 };
  const p0Start = tts.getParagraphStartTime(0);
  const p1Start = tts.getParagraphStartTime(1);
  const p2Start = tts.getParagraphStartTime(2);

  assert.equal(p0Start, 0);
  assert.ok(p1Start > 0 && p1Start < p2Start);
  assert.ok(p2Start < 100);

  // Test reverse mapping from currentTime to paragraph index
  assert.equal(tts.getParagraphIndexFromTime(0), 0);
  assert.equal(tts.getParagraphIndexFromTime(p1Start + 1), 1);
  assert.equal(tts.getParagraphIndexFromTime(99), 2);
});

test("TTSEngine: halts and reports error on audio failure without falling back to device speechSynthesis", () => {
  const tts = new TTSEngine();
  tts.loadText("Đoạn văn bản kiểm thử.");

  let notice = "";
  tts.onError = (msg) => { notice = msg; };

  tts.fallbackToSpeechSynthesis("Lỗi phát audio từ Google Drive.");

  assert.notEqual(tts.mode, "speechSynthesis");
  assert.equal(tts.mode, "drive");
  assert.equal(notice, "Lỗi phát audio từ Google Drive.");
  assert.equal(tts.audio, null);
  assert.equal(tts.isPlaying, false);
});

test("TTSEngine: play() rejects and informs user if chapter has no Google Drive audio", () => {
  const tts = new TTSEngine();
  tts.loadChapter({ text: "Nội dung chương chưa có audio.", audioUrl: "" });

  let errorMessage = "";
  tts.onError = (msg) => { errorMessage = msg; };

  const started = tts.play(0);
  assert.equal(started, false);
  assert.equal(tts.isPlaying, false);
  assert.ok(errorMessage.includes("Google Drive"));
});



