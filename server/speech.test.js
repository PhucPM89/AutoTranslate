const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generateSpeech,
  buildSpeechPrompt,
  pcmToWavBase64
} = require("./speech");

test("builds a Vietnamese-only reading prompt from translated text", () => {
  const prompt = buildSpeechPrompt("Tran Thanh nhin ve phia truoc.", "1.2", "detective", "Charon", 2, 6);
  assert.match(prompt, /bang tieng Viet/);
  assert.match(prompt, /khong dich/);
  assert.match(prompt, /hoi nhanh/);
  assert.match(prompt, /manh moi/);
  assert.match(prompt, /doan 3\/6/);
  assert.match(prompt, /chi dung mot nguoi ke/);
  assert.match(prompt, /Khong doi sang giong nhan vat/);
  assert.match(prompt, /Tran Thanh nhin ve phia truoc/);
});

test("wraps Gemini PCM data in a playable WAV container", () => {
  const wav = Buffer.from(pcmToWavBase64(Buffer.from([0, 1, 2, 3]).toString("base64")), "base64");
  assert.equal(wav.subarray(0, 4).toString(), "RIFF");
  assert.equal(wav.subarray(8, 12).toString(), "WAVE");
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt32LE(40), 4);
});

test("requests Gemini TTS with the selected voice and returns WAV audio", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: "AAECAw==" } }]
            }
          }
        ]
      })
    };
  };

  try {
    const result = await generateSpeech("Day la ban dich tieng Viet.", "test-key", {
      genre: "horror",
      voice: "Aoede",
      rate: "0.8",
      segmentIndex: 1,
      segmentCount: 4
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers["x-goog-api-key"], "test-key");
    assert.equal(
      calls[0].body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
      "Aoede"
    );
    assert.equal(calls[0].body.generationConfig.temperature, 0.2);
    assert.match(calls[0].body.contents[0].parts[0].text, /Day la ban dich tieng Viet/);
    assert.match(calls[0].body.contents[0].parts[0].text, /tao khoang lang/);
    assert.match(calls[0].body.contents[0].parts[0].text, /doan 2\/4/);
    assert.equal(result.genre, "horror");
    assert.equal(Buffer.from(result.audio, "base64").subarray(0, 4).toString(), "RIFF");
    assert.equal(result.mimeType, "audio/wav");
  } finally {
    global.fetch = originalFetch;
  }
});

test("does not retry when the account quota is exhausted", async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 429,
      json: async () => ({
        error: { message: "You exceeded your current quota, please check your plan and billing details." }
      })
    };
  };

  try {
    await assert.rejects(
      () => generateSpeech("Day la ban dich tieng Viet.", "test-key"),
      (error) => error.status === 429 && error.code === "quota_exceeded"
    );
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
