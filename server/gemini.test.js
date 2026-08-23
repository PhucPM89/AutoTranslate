const test = require("node:test");
const assert = require("node:assert/strict");
const {
  translateText,
  translateMetadata,
  assessTranslation,
  splitTextIntoChunks,
  reserveKeyOrder,
  outputTokenBudget,
  exportKeyPoolState,
  importKeyPoolState,
  keyFingerprint
} = require("./gemini");

const chineseSource = "这是一个需要翻译成越南语的中文段落。".repeat(20);

test("rejects a translation that repeats the Chinese source", () => {
  const result = assessTranslation(chineseSource, chineseSource);
  assert.equal(result.acceptable, false);
});

test("rejects output that is still mostly Chinese", () => {
  const result = assessTranslation(chineseSource, `Bản dịch: ${"这仍然是中文内容。".repeat(20)}`);
  assert.equal(result.acceptable, false);
});

test("rejects even isolated Chinese characters in a published translation", () => {
  const vietnamese = "Đây là bản dịch đầy đủ nhưng còn sót một chữ 漢 trong nội dung. ".repeat(12);
  const result = assessTranslation(chineseSource, vietnamese);
  assert.equal(result.acceptable, false);
  assert.match(result.reason, /chữ Hán/);
});

test("rejects output whose abnormal length indicates repetition", () => {
  const repeated = "Đây là một câu bị lặp lại ngoài ý muốn. ".repeat(100);
  const result = assessTranslation(chineseSource, repeated);
  assert.equal(result.acceptable, false);
  assert.match(result.reason, /dài bất thường/);
});

test("rejects a translation that collapses most source paragraphs", () => {
  const source = Array.from({ length: 6 }, (_, i) => `第${i + 1}段，这是需要完整翻译的中文内容。`.repeat(5)).join("\n\n");
  const output = "Đây là một khối văn bản tiếng Việt đủ dài nhưng đã gộp toàn bộ cấu trúc đoạn của nguyên tác. ".repeat(12);
  const result = assessTranslation(source, output);
  assert.equal(result.acceptable, false);
  assert.match(result.reason, /cấu trúc đoạn/);
});

test("rejects duplicated long paragraphs", () => {
  const source = "这是一个需要完整翻译的中文段落。".repeat(50);
  const paragraph = "Đây là một đoạn dịch dài bị mô hình lặp nguyên văn ngoài ý muốn, làm nội dung sai lệch dù tổng chiều dài vẫn có vẻ hợp lệ. ".repeat(4);
  const result = assessTranslation(source, `${paragraph}\n\n${paragraph}`);
  assert.equal(result.acceptable, false);
  assert.match(result.reason, /lặp nguyên đoạn/);
});

test("rejects a translation that drops Arabic quantities", () => {
  const source = `${"这是中文内容。".repeat(40)}他得到了1200块灵石。`;
  const output = "Đây là bản dịch tiếng Việt đầy đủ về việc nhân vật nhận được rất nhiều linh thạch. ".repeat(12);
  const result = assessTranslation(source, output);
  assert.equal(result.acceptable, false);
  assert.match(result.reason, /làm mất số 1200/);
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
    const retryPrompt = calls[1].body.contents[0].parts[0].text;
    assert.match(firstPrompt, /âm Hán-Việt/);
    assert.match(firstPrompt, /Pinyin/i);
    assert.match(firstPrompt, /Lý Tử Dạ/);
    assert.doesNotMatch(firstPrompt, /Phiên âm tên riêng sang chữ Latin/);
    assert.match(retryPrompt, /Bản dịch trước đã bị hệ thống từ chối/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("Groq Qwen translation disables reasoning instead of only hiding it", async () => {
  const originalFetch = global.fetch;
  const vietnamese = "Đây là nội dung đã được dịch đầy đủ sang tiếng Việt, rõ ràng và tự nhiên. ".repeat(14);
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        choices: [{ finish_reason: "stop", message: { content: vietnamese } }],
        usage: { total_tokens: 100 }
      })
    };
  };

  try {
    const result = await translateText(chineseSource, "gsk_test-key");
    assert.equal(result.translation, vietnamese.trim());
    assert.equal(requestBody.reasoning_effort, "none");
    assert.equal(requestBody.reasoning_format, undefined);
  } finally {
    global.fetch = originalFetch;
  }
});

test("a nearly complete translation gets a focused residual-Han repair pass", async () => {
  const originalFetch = global.fetch;
  const almost = `Đây là bản dịch đầy đủ nhưng còn sót chữ 残 trong một cụm từ. ${"Nội dung tiếng Việt được giữ nguyên đầy đủ. ".repeat(16)}`;
  const repaired = almost.replace("残", "tàn");
  const responses = [almost, repaired];
  const prompts = [];
  global.fetch = async (_url, options) => {
    prompts.push(JSON.parse(options.body).messages[1].content);
    return {
      ok: true,
      json: async () => ({ choices: [{ finish_reason: "stop", message: { content: responses.shift() } }] })
    };
  };

  try {
    const result = await translateText(chineseSource, "gsk_test-key");
    assert.equal(result.translation, repaired.trim());
    assert.match(prompts[1], /còn sót một vài chữ Hán/);
    assert.match(prompts[1], /残/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("injects matching translation-memory terminology without an extra AI call", async () => {
  const originalFetch = global.fetch;
  const source = "众人倒吸一口凉气，谁也不敢继续向前。".repeat(20);
  const vietnamese = "Mọi người hít sâu một hơi khí lạnh, không ai dám tiếp tục tiến lên phía trước. ".repeat(15);
  let prompt = "";
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls += 1;
    prompt = JSON.parse(options.body).contents[0].parts[0].text;
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: vietnamese }] } }] })
    };
  };
  try {
    const result = await translateText(source, "test-key", { bookTitle: "Khí Lạnh Trường Sinh" });
    assert.equal(result.translation, vietnamese.trim());
    assert.equal(calls, 1);
    assert.match(prompt, /"倒吸一口凉气" ➔ "hít sâu một hơi khí lạnh"/);
    assert.match(prompt, /Tác phẩm: Khí Lạnh Trường Sinh/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("translates crawler metadata to strict Vietnamese JSON", async () => {
  const originalFetch = global.fetch;
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          title: "Muội Muội Nhặt Được Tu Tiên Trở Về Cướp Hôn",
          author: "Ỷ Trúc Thính Phong Ngâm",
          description: "Đêm Thượng Nguyên, ta tình cờ cứu một cô bé ăn xin."
        }) }] } }]
      })
    };
  };

  try {
    const result = await translateMetadata({
      title: "捡来的妹妹修仙后，回来抢亲了",
      author: "倚竹听风吟",
      description: "上元夜，我随手救了一个小乞丐。"
    }, "test-key");
    assert.equal(result.title, "Muội Muội Nhặt Được Tu Tiên Trở Về Cướp Hôn");
    assert.equal(result.author, "Ỷ Trúc Thính Phong Ngâm");
    assert.equal(requestBody.generationConfig.responseMimeType, "application/json");
    assert.doesNotMatch(`${result.title}${result.author}${result.description}`, /\p{Script=Han}/u);
  } finally {
    global.fetch = originalFetch;
  }
});

test("hard-splits a long paragraph without punctuation", () => {
  const chunks = splitTextIntoChunks("中".repeat(9500), 4000);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [4000, 4000, 1500]);
});

test("concurrent work reserves different starting keys before awaiting a response", () => {
  const keys = ["key-a", "key-b", "key-c", "key-d", "key-e"];
  const first = reserveKeyOrder(keys);
  const second = reserveKeyOrder(keys);
  assert.notEqual(first[0].key, second[0].key);
  assert.deepEqual(new Set(first.map((entry) => entry.key)), new Set(keys));
});

test("translation output budget follows source size instead of repeated prompt size", () => {
  assert.equal(outputTokenBudget("中".repeat(100)), 1200);
  assert.equal(outputTokenBudget("中".repeat(800)), 2400);
  assert.equal(outputTokenBudget("中".repeat(2000)), 4096);
});

test("one chunk tries only a bounded slice of the key pool", async () => {
  const originalFetch = global.fetch;
  const authorizations = [];
  global.fetch = async (_url, options) => {
    authorizations.push(options.headers.Authorization);
    return {
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "tokens per minute; retry in 30s" } })
    };
  };

  try {
    await assert.rejects(
      translateText(chineseSource, ["gsk_slice-a", "gsk_slice-b", "gsk_slice-c", "gsk_slice-d", "gsk_slice-e"]),
      (error) => error.code === "key_pool_slice_exhausted"
    );
    assert.equal(new Set(authorizations).size, 3);
    assert.equal(authorizations.length, 6, "each selected key gets the provider's one HTTP retry");
  } finally {
    global.fetch = originalFetch;
  }
});

test("key cooldown and rotation cursor survive a worker restart snapshot", () => {
  const keys = ["gsk_persist-a", "gsk_persist-b"];
  const future = Date.now() + 60_000;
  importKeyPoolState({
    cursor: 7,
    keys: [{
      id: keyFingerprint(keys[0]),
      cooldownUntil: future,
      consecutiveErrors: 2,
      lastErrorMsg: "quota"
    }]
  }, keys);
  const saved = exportKeyPoolState(keys);
  const first = saved.keys.find((entry) => entry.id === keyFingerprint(keys[0]));
  assert.equal(saved.cursor, 7);
  assert.equal(first.cooldownUntil, future);
  assert.equal(first.consecutiveErrors, 2);
});
