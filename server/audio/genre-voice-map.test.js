"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { GENRE_VOICE_CONFIG, resolveGenreVoice, NGUYEN_NGOC_NGAN_VOICE } = require("./genre-voice-map");

test("mọi thể loại đều sử dụng cấu hình giọng Nguyễn Ngọc Ngạn", () => {
  for (const config of Object.values(GENRE_VOICE_CONFIG)) {
    assert.equal(config.voiceName, "Nguyễn Ngọc Ngạn");
    assert.equal(config.engine, "nguyen-ngoc-ngan-ai");
    assert.equal(config.genreKey, "nguyen-ngoc-ngan");
  }
});

test("resolveGenreVoice luôn trả về giọng Nguyễn Ngọc Ngạn cho bất kỳ thể loại nào", () => {
  assert.equal(resolveGenreVoice("Linh dị / Kinh dị").voiceName, "Nguyễn Ngọc Ngạn");
  assert.equal(resolveGenreVoice("Tiên hiệp").voiceName, "Nguyễn Ngọc Ngạn");
  assert.equal(resolveGenreVoice("Mạt thế").voiceName, "Nguyễn Ngọc Ngạn");
  assert.equal(resolveGenreVoice("Trinh thám").voiceName, "Nguyễn Ngọc Ngạn");
  assert.equal(resolveGenreVoice("Đô thị").voiceName, "Nguyễn Ngọc Ngạn");
  assert.equal(resolveGenreVoice("Thể loại bất kỳ", "Tiêu đề bất kỳ").voiceName, "Nguyễn Ngọc Ngạn");
  assert.equal(resolveGenreVoice().voiceName, "Nguyễn Ngọc Ngạn");
});
