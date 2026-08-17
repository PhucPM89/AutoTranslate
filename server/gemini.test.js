const test = require("node:test");
const assert = require("node:assert/strict");
const { translateText, assessTranslation, splitTextIntoChunks } = require("./gemini");

const chineseSource = "这是一个需要翻译成越南语的中文段落。".repeat(20);

test("rejects a translation that repeats the Chinese source", () => {
  const result = assessTranslation(chineseSource, chineseSource);
  assert.equal(result.acceptable, false);
});

test("rejects output that is still mostly Chinese", () => {
  const result = assessTranslation(chineseSource, `Bản dịch: ${"这仍然是中文内容。".repeat(20)}`);
  assert.equal(result.acceptable, false);
});

test("accepts a substantial Vietnamese translation", () => {
  const vietnamese = "Đây là một đoạn văn đã được dịch đầy đủ sang tiếng Việt, giữ nguyên nội dung và cấu trúc. ".repeat(12);
  const result = assessTranslation(chineseSource, vietnamese);
  assert.equal(result.acceptable, true);
});

test("tries the next model when a model echoes Chinese text", async () => {
  const originalFetch = global.fetch;
  const vietnamese = "Đây là nội dung đã được dịch đầy đủ sang tiếng Việt và không còn lặp lại nguyên văn. ".repeat(12);
  const responses = [chineseSource, vietnamese];
  const calls = [];

  global.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: responses.shift() }] } }]
      })
    };
  };

  try {
    const result = await translateText(chineseSource, "test-key");
    assert.equal(result.translation, vietnamese.trim());
    assert.equal(calls.length, 2);
    const firstPrompt = calls[0].body.contents[0].parts[0].text;
    assert.match(firstPrompt, /âm Hán-Việt/);
    assert.match(firstPrompt, /không dùng Pinyin/i);
    assert.match(firstPrompt, /陈清 phải dịch là Trần Thanh/);
    assert.doesNotMatch(firstPrompt, /Phiên âm tên riêng sang chữ Latin/);
    assert.match(calls[1].body.contents[0].parts[0].text, /đã bị hệ thống từ chối/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("hard-splits a long paragraph without punctuation", () => {
  const chunks = splitTextIntoChunks("中".repeat(9500), 4000);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [4000, 4000, 1500]);
});
