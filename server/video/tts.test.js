"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  VOICES,
  convertVttToSrt
} = require("./tts");

test("TTS: voice constants exist for Vietnamese neural models", () => {
  assert.equal(VOICES.FEMALE, "vi-VN-HoaiMyNeural");
  assert.equal(VOICES.MALE, "vi-VN-NamMinhNeural");
});

test("TTS: convertVttToSrt handles WebVTT format and strips tags", () => {
  const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.500
<v Narrator>Chào mừng các bạn đến với <b>Trạm Chữ</b>.</v>

00:00:05.100 --> 00:00:08.200
Đây là một bộ truyện cực kỳ lôi cuốn.
`;

  const srt = convertVttToSrt(vtt);

  assert.match(srt, /^1\r?\n00:00:01,000 --> 00:00:04,500\r?\nChào mừng các bạn đến với Trạm Chữ\./m);
  assert.match(srt, /2\r?\n00:00:05,100 --> 00:00:08,200\r?\nĐây là một bộ truyện cực kỳ lôi cuốn\./m);
});

test("TTS: convertVttToSrt applies time offset accurately", () => {
  const vtt = `1
00:00:00,500 --> 00:00:03,000
Lời bình đầu tiên.
`;

  // Offset by 10.25 seconds
  const srt = convertVttToSrt(vtt, 10.25);

  assert.match(srt, /00:00:10,750 --> 00:00:13,250/);
  assert.match(srt, /Lời bình đầu tiên\./);
  // Ensure no stray line containing just "1" inside cue text
  assert.ok(!srt.includes("1\n1\n"));
});

test("TTS: convertVttToSrt ignores bare cue numbers inside cues", () => {
  const raw = `1
00:00:00,100 --> 00:00:02,000
Câu một.
Dòng phụ.
`;

  const srt = convertVttToSrt(raw);
  assert.ok(srt.includes("Câu một.\nDòng phụ."));
  assert.ok(!srt.includes("Câu một.\n1\n"));
});

test("TTS: convertVttToSrt splits long cues into dynamic rhythmic chunks for TikTok karaoke subtitles", () => {
  const raw = `WEBVTT

00:00:00.000 --> 00:00:04.000
Mở mắt ra trong căn nhà gỗ rách nát giữa rừng sâu ác mộng và chỉ có thể sống sót nếu làm theo quy tắc.
`;

  const srt = convertVttToSrt(raw);
  // Expect it to split into 2 cues for fast mobile readability
  assert.match(srt, /^1\r?\n00:00:00,000 --> 00:00:0/m);
  assert.match(srt, /^2\r?\n00:00:0[1-3],[0-9]{3} --> 00:00:04,000/m);
});

