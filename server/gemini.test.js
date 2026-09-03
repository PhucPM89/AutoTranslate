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
  keyFingerprint,
  getModelsForApiKey,
  classifyQuotaError,
  computeQuotaRecovery,
  nextPacificMidnightMs,
  providerPriority,
  prioritizeProviderFallback,
  rebalanceCollapsedParagraphs
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
  const source = Array.from({ length: 10 }, () => "这是需要完整翻译的中文内容。".repeat(10)).join("\n\n");
  const output = "Đây là một khối văn bản tiếng Việt đủ dài nhưng đã gộp toàn bộ cấu trúc đoạn của nguyên tác. ".repeat(12);
  const result = assessTranslation(source, output);
  assert.equal(result.acceptable, false);
  assert.match(result.reason, /cấu trúc đoạn/);
});

test("rebalanceCollapsedParagraphs rescues Gemini Web output that lost line breaks", () => {
  const source = Array.from({ length: 10 }, () => "这是需要完整翻译的中文内容。".repeat(10)).join("\n\n");
  const output = Array.from({ length: 20 }, (_, i) => `Đây là câu dịch thứ ${i + 1}, nội dung đã được chuyển sang tiếng Việt đầy đủ.`).join(" ");
  const rebalanced = rebalanceCollapsedParagraphs(source, output);
  const result = assessTranslation(source, rebalanced);
  assert.ok(rebalanced.split(/\n+/).filter(Boolean).length >= 2);
  assert.equal(result.acceptable, true);
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

test("rejects literal Han-Viet transliteration of everyday narration", () => {
  const source = `${"这是中文内容。".repeat(40)}爷爷教了我一身术数命理，却在我帮他算了三次命后，离开了我。`;
  const output = "Tên truyện: Ma Y Thần Toán Tử. Gia Gia Giáo cho ta một thân thuật số mệnh lý, sau khi Khước Tại Ngã Bang đã xem mệnh cho ông ba lần thì rời khỏi ta. ".repeat(6);
  const result = assessTranslation(source, output);
  assert.equal(result.acceptable, false);
  assert.match(result.reason, /chuyển âm máy móc/);
});

test("rejects title-only output for a full chapter", () => {
  const source = `${"这是一个完整章节，需要翻译全部正文内容。".repeat(80)}`;
  const output = "Chương 769: Tìm Kiếm Giang Thủy Hàn";
  const result = assessTranslation(source, output);
  assert.equal(result.acceptable, false);
  assert.match(result.reason, /chỉ trả tiêu đề/);
});

test("rejects Gemini Web UI and code chrome leaked into a chapter", () => {
  const output = [
    "Gemini said:",
    "Đây là bản dịch tiếng Việt đầy đủ của chương truyện, nội dung vẫn đang tiếp diễn với lời thoại và miêu tả. ".repeat(7),
    "Show code",
    "python"
  ].join("\n");
  const result = assessTranslation(chineseSource, output);
  assert.equal(result.acceptable, false);
  assert.match(result.reason, /rác giao diện/);
});

test("accepts a translation that expresses numbers in natural Vietnamese words", () => {
  const source = `${"这是中文内容。".repeat(40)}他等了10天，遇到了2个人。`;
  const output = "Đây là bản dịch tiếng Việt đầy đủ. Hắn đã chờ mười ngày và gặp được hai người. ".repeat(6);
  const result = assessTranslation(source, output);
  assert.equal(result.acceptable, true);
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
    assert.match(firstPrompt, /BỐI CẢNH VĂN HỌC GIẢ TƯỞNG/);
    assert.match(firstPrompt, /Hán-Việt/);
    assert.match(firstPrompt, /YÊU CẦU DỊCH/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("translates text using Google Gemini with Creative Fiction framing", async () => {
  const originalFetch = global.fetch;
  const vietnamese = "Đây là nội dung tiểu thuyết đã được dịch đầy đủ sang tiếng Việt, rõ ràng và tự nhiên. ".repeat(14);
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: vietnamese }] } }],
        usageMetadata: { totalTokenCount: 100 }
      })
    };
  };

  try {
    const result = await translateText(chineseSource, "AQ.test-key");
    assert.equal(result.translation, vietnamese.trim());
    assert.match(requestBody.contents[0].parts[0].text, /FICTION LITERATURE TRANSLATION/);
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
  assert.equal(outputTokenBudget("中".repeat(800)), 1600);
  assert.equal(outputTokenBudget("中".repeat(2000)), 4000);
  assert.equal(outputTokenBudget("中".repeat(10000)), 4096);
});

test("explicit cloud provider ignores a stale Hachimi environment setting", async () => {
  const originalFetch = global.fetch;
  const oldProvider = process.env.TRANSLATION_PROVIDER;
  const oldUrl = process.env.HACHIMI_API_URL;
  const vietnamese = "Đây là nội dung tiểu thuyết đã được dịch đầy đủ sang tiếng Việt, rõ ràng và tự nhiên. ".repeat(14);
  let calledUrl = "";
  global.fetch = async (url) => {
    calledUrl = String(url);
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: vietnamese }] } }] })
    };
  };
  process.env.TRANSLATION_PROVIDER = "hachimi";
  process.env.HACHIMI_API_URL = "https://dead-tunnel.invalid";
  try {
    const result = await translateText(chineseSource, "AQ.cloud-key", { provider: "cloud" });
    assert.equal(result.translation, vietnamese.trim());
    assert.match(calledUrl, /generativelanguage\.googleapis\.com/);
  } finally {
    global.fetch = originalFetch;
    if (oldProvider === undefined) delete process.env.TRANSLATION_PROVIDER; else process.env.TRANSLATION_PROVIDER = oldProvider;
    if (oldUrl === undefined) delete process.env.HACHIMI_API_URL; else process.env.HACHIMI_API_URL = oldUrl;
  }
});

test("gemini-web provider can translate without API keys", async () => {
  const oldMock = process.env.GEMINI_WEB_MOCK_RESPONSE;
  const oldProvider = process.env.TRANSLATION_PROVIDER;
  process.env.GEMINI_WEB_MOCK_RESPONSE = "Đây là nội dung tiểu thuyết đã được dịch đầy đủ sang tiếng Việt, rõ ràng và tự nhiên. ".repeat(14);
  delete process.env.TRANSLATION_PROVIDER;

  try {
    const result = await translateText(chineseSource, "", { provider: "gemini-web" });
    assert.equal(result.providersUsed[0], "gemini-web");
    assert.equal(result.modelsUsed[0], "gemini-web-mock");
    assert.ok(result.translation.includes("Đây là nội dung tiểu thuyết"));
  } finally {
    if (oldMock === undefined) delete process.env.GEMINI_WEB_MOCK_RESPONSE; else process.env.GEMINI_WEB_MOCK_RESPONSE = oldMock;
    if (oldProvider === undefined) delete process.env.TRANSLATION_PROVIDER; else process.env.TRANSLATION_PROVIDER = oldProvider;
  }
});

test("translates structural stub chapters locally without touching providers", async () => {
  const result = await translateText("目录", "", { provider: "gemini-web" });
  assert.equal(result.translation, "Mục lục");
  assert.deepEqual(result.providersUsed, ["local"]);
  assert.equal(result.tokensUsed, 0);

  const volume = await translateText("第一卷", "", { provider: "gemini-web" });
  assert.equal(volume.translation, "Quyển thứ nhất");
});

test("gemini-web quality failure is marked as translation_rejected", async () => {
  const oldMock = process.env.GEMINI_WEB_MOCK_RESPONSE;
  const oldProvider = process.env.TRANSLATION_PROVIDER;
  const oldAttempts = process.env.GEMINI_WEB_MAX_ATTEMPTS;
  process.env.GEMINI_WEB_MOCK_RESPONSE = "Bản dịch bị cụt.";
  process.env.GEMINI_WEB_MAX_ATTEMPTS = "1";
  delete process.env.TRANSLATION_PROVIDER;

  try {
    await assert.rejects(
      () => translateText(chineseSource, "", { provider: "gemini-web" }),
      (error) => {
        assert.equal(error.code, "translation_rejected");
        assert.equal(error.qualityRejected, true);
        assert.match(error.message, /Bản dịch Gemini Web chưa đạt yêu cầu/);
        return true;
      }
    );
  } finally {
    if (oldMock === undefined) delete process.env.GEMINI_WEB_MOCK_RESPONSE; else process.env.GEMINI_WEB_MOCK_RESPONSE = oldMock;
    if (oldProvider === undefined) delete process.env.TRANSLATION_PROVIDER; else process.env.TRANSLATION_PROVIDER = oldProvider;
    if (oldAttempts === undefined) delete process.env.GEMINI_WEB_MAX_ATTEMPTS; else process.env.GEMINI_WEB_MAX_ATTEMPTS = oldAttempts;
  }
});

test("explicit cloud provider ignores gemini-web environment setting", async () => {
  const originalFetch = global.fetch;
  const oldProvider = process.env.TRANSLATION_PROVIDER;
  const vietnamese = "Đây là nội dung tiểu thuyết đã được dịch đầy đủ sang tiếng Việt, rõ ràng và tự nhiên. ".repeat(14);
  let calledUrl = "";
  global.fetch = async (url) => {
    calledUrl = String(url);
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: vietnamese }] } }] })
    };
  };
  process.env.TRANSLATION_PROVIDER = "gemini-web";

  try {
    const result = await translateText(chineseSource, "AQ.cloud-key", { provider: "cloud" });
    assert.equal(result.translation, vietnamese.trim());
    assert.match(calledUrl, /generativelanguage\.googleapis\.com/);
  } finally {
    global.fetch = originalFetch;
    if (oldProvider === undefined) delete process.env.TRANSLATION_PROVIDER; else process.env.TRANSLATION_PROVIDER = oldProvider;
  }
});

test("selects the current Qwen model for Groq keys and Gemini models for Gemini keys", () => {
  const oldGroq = process.env.GROQ_MODEL;
  const oldGemini = process.env.GEMINI_MODEL;
  try {
    process.env.GROQ_MODEL = "qwen/qwen3.8-27b";
    process.env.GEMINI_MODEL = "gemini-test-model";
    assert.deepEqual(getModelsForApiKey("gsk_test"), ["qwen/qwen3.8-27b"]);
    assert.equal(getModelsForApiKey("AIza-test")[0], "gemini-test-model");
  } finally {
    if (oldGroq === undefined) delete process.env.GROQ_MODEL; else process.env.GROQ_MODEL = oldGroq;
    if (oldGemini === undefined) delete process.env.GEMINI_MODEL; else process.env.GEMINI_MODEL = oldGemini;
  }
});

test("falls through to Groq when Gemini keys have quota failure", async () => {
  const originalFetch = global.fetch;
  const vietnamese = "Đây là bản dịch tiếng Việt hoàn chỉnh, tự nhiên, đầy đủ và không còn bất kỳ chữ Hán nào. ".repeat(14);
  const urls = [];
  global.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes("googleapis.com")) {
      return {
        ok: false,
        status: 429,
        headers: new Headers(),
        json: async () => ({ error: { message: "RESOURCE_EXHAUSTED: quota exceeded" } })
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ choices: [{ message: { content: vietnamese } }] })
    };
  };
  try {
    const result = await translateText(chineseSource, [
      "AQ.provider-fallback-gemini-a",
      "AQ.provider-fallback-gemini-b",
      "gsk_provider-fallback-groq"
    ], { provider: "cloud" });
    assert.deepEqual(result.providersUsed, ["groq"]);
    assert.equal(urls.filter((url) => url.includes("googleapis.com")).length, 2);
    assert.equal(urls.filter((url) => url.includes("api.groq.com")).length, 1);
  } finally {
    global.fetch = originalFetch;
  }
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
    assert.equal(authorizations.length, 3, "429 must open the circuit without an immediate HTTP retry");
  } finally {
    global.fetch = originalFetch;
  }
});

test("key cooldown and rotation cursor survive a worker restart snapshot", () => {
  const keys = ["gsk_persist-a", "gsk_persist-b"];
  const future = Date.now() + 60_000;
  importKeyPoolState({
    schema: 2,
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

test("legacy short quota cooldown is upgraded before another provider call", () => {
  const keys = ["gsk_legacy-daily"];
  const now = Date.now();
  importKeyPoolState({
    schema: 1,
    keys: [{
      id: keyFingerprint(keys[0]),
      cooldownUntil: now + 30_000,
      consecutiveErrors: 3,
      lastErrorMsg: "TPD tokens per day exhausted; try again in 20s"
    }]
  }, keys);
  const saved = exportKeyPoolState(keys).keys[0];
  assert.ok(saved.cooldownUntil >= now + 24 * 60 * 60_000);
  assert.equal(saved.recoveryPolicy, "wait_full_daily_reset");
});

test("daily quota waits for a full reset instead of the provider next-request delay", () => {
  const recovery = computeQuotaRecovery(new Error("TPD limit reached; try again in 2m10s"), "gsk_daily-key", 1_700_000_000_000);
  assert.equal(recovery.quotaClass, "daily");
  assert.equal(recovery.policy, "wait_full_daily_reset");
  assert.ok(recovery.durationMs >= 24 * 60 * 60_000);
});

test("minute quota gets a quiet recovery window", () => {
  const recovery = computeQuotaRecovery(new Error("TPM limit reached; retry in 12s"), "gsk_minute-key");
  assert.equal(classifyQuotaError("requests per minute"), "minute");
  assert.equal(recovery.policy, "wait_full_minute_window");
  assert.ok(recovery.durationMs >= 90_000);
  assert.ok(recovery.durationMs < 2 * 60_000);
});

test("unknown quota dimension waits a conservative full cycle", () => {
  const recovery = computeQuotaRecovery(new Error("RESOURCE_EXHAUSTED: current quota unavailable"), "gemini-key");
  assert.equal(recovery.policy, "wait_conservative_full_cycle");
  assert.ok(recovery.durationMs >= 24 * 60 * 60_000);
});

test("Gemini daily quota resumes only after the next Pacific midnight", () => {
  const now = Date.parse("2026-08-23T12:00:00Z");
  const reset = nextPacificMidnightMs(now);
  const recovery = computeQuotaRecovery(new Error("Requests per day quota exceeded"), "gemini-key", now);
  assert.ok(reset > now);
  assert.ok(recovery.durationMs >= reset - now);
  assert.ok(recovery.durationMs <= 25 * 60 * 60_000);
});

test("importKeyPoolState with missing or invalid cursor does not corrupt globalKeyIndex with NaN", () => {
  const keys = ["key-alpha", "key-beta"];
  importKeyPoolState({ keys: [] }, keys); // no cursor property
  const order1 = reserveKeyOrder(keys);
  assert.equal(order1.length, 2);
  assert.equal(order1[0].key, "key-alpha");
  assert.ok(Number.isFinite(order1[0].index));

  importKeyPoolState({ keys: [], cursor: "invalid-nan" }, keys);
  const order2 = reserveKeyOrder(keys);
  assert.equal(order2.length, 2);
  assert.equal(order2[0].key, "key-alpha");
  assert.ok(Number.isFinite(order2[0].index));
});

test("cleanTranslatedTitle does not erase titles matching clean patterns completely", () => {
  const { cleanTranslatedTitle } = require("./gemini");
  if (typeof cleanTranslatedTitle === "function") {
    assert.equal(cleanTranslatedTitle("Bản Hoàn Chỉnh"), "Bản Hoàn Chỉnh");
    assert.equal(cleanTranslatedTitle("Tiểu Thuyết"), "Tiểu Thuyết");
    assert.equal(cleanTranslatedTitle("Võng Du Chi Tuyệt Đỉnh - Bản Hoàn Chỉnh"), "Võng Du Chi Tuyệt Đỉnh");
  }
});

test("keyPoolState produces non-colliding fingerprints for keys with identical prefix and suffix", () => {
  const keys = [
    "AIzaSyD-shared-prefix-123456789-suffix",
    "AIzaSyD-shared-prefix-987654321-suffix"
  ];
  const state = exportKeyPoolState(keys);
  assert.equal(state.keys.length, 2);
  assert.notEqual(state.keys[0].id, state.keys[1].id, "fingerprints must be unique even with common prefix/suffix");
  assert.match(state.keys[0].id, /^k_[a-f0-9]{16}$/);
});

test("providerPriority orders Gemini keys as Primary (0) and Groq as Fallback (1)", () => {
  assert.equal(providerPriority("AIzaSyD-gemini-key"), 0);
  assert.equal(providerPriority("AQ.gemini-key"), 0);
  assert.equal(providerPriority("gsk_groq-api-key"), 1);
});

test("prioritizeProviderFallback places all Gemini keys before Groq fallback keys", () => {
  const entries = [
    { key: "gsk_groq_1", index: 0 },
    { key: "AIza_gemini_1", index: 1 },
    { key: "gsk_groq_2", index: 2 },
    { key: "AQ_gemini_2", index: 3 }
  ];
  const ordered = prioritizeProviderFallback(entries);
  assert.deepEqual(
    ordered.map((e) => e.key),
    ["AIza_gemini_1", "AQ_gemini_2", "gsk_groq_1", "gsk_groq_2"]
  );
});

test("residual Han repair prompt demands a final no-Han pass", () => {
  const { buildResidualHanRepairPrompt } = require("./gemini");
  const prompt = buildResidualHanRepairPrompt("Bản dịch còn sót 漢.");
  assert.match(prompt, /tự kiểm tra từng dòng/);
  assert.match(prompt, /không còn bất kỳ chữ Hán/);
});

test("buildTargetedRepairPrompt injects both source and draft with specific repair directives", () => {
  const { buildTargetedRepairPrompt } = require("./gemini");
  const sourceText = "林动深吸了一口气，迈步走进了房间。";
  const draftTranslation = "Lâm Động hít sâu một hơi, 迈步 bước vào trong phòng.";
  const prompt = buildTargetedRepairPrompt({
    sourceText,
    draftTranslation,
    issueReason: "vẫn còn sót 2 chữ Hán chưa được chuyển ngữ",
    glossary: { "林动": "Lâm Động" },
    bookTitle: "Vũ Động Càn Khôn"
  });

  assert.match(prompt, /REFLECT/i);
  assert.match(prompt, /NGUYÊN TÁC TIẾNG TRUNG/);
  assert.match(prompt, /BẢN DỊCH NHÁP CẦN SỬA/);
  assert.match(prompt, /SỬA TRIỆT ĐỂ CHỮ HÁN CÒN SÓT/);
  assert.match(prompt, /Lâm Động/);
  assert.match(prompt, /Vũ Động Càn Khôn/);
});

test("cleanGeminiWebText strips Gemini UI/code labels but keeps translated prose", () => {
  const { cleanGeminiWebText, detectGeminiUiGarbage } = require("./gemini-web");
  const noisy = [
    "Gemini said:",
    "```python",
    "Đoạn dịch tiếng Việt cần được giữ lại.",
    "Show code",
    "Copy code",
    "```"
  ].join("\n");
  const cleaned = cleanGeminiWebText(noisy);
  assert.equal(cleaned, "Đoạn dịch tiếng Việt cần được giữ lại.");
  assert.equal(detectGeminiUiGarbage(noisy), "code fence");
  assert.equal(detectGeminiUiGarbage(cleaned), "");
});

test("cleanGeminiWebText strips inline Gemini file metadata", () => {
  const { cleanGeminiWebText, detectGeminiUiGarbage } = require("./gemini-web");
  const noisy = "Bản dịch tiếng Việt (phần 1/2 chương 1814) của tác phẩm Ma Y Thần Toán Tử đã hoàn thành [file-tag: code-generated-file-translation.txt] Chương 1814: Mưa lớn kéo dài.";
  const cleaned = cleanGeminiWebText(noisy);
  assert.equal(cleaned, "Chương 1814: Mưa lớn kéo dài.");
  assert.equal(detectGeminiUiGarbage(noisy), "[file-tag: code-generated-file-translation.txt]");
  assert.equal(detectGeminiUiGarbage(cleaned), "");
});

test("gemini-web config parses maxProfiles concurrency cleanly", () => {
  const { getConfig } = require("./gemini-web");
  assert.equal(getConfig().maxProfiles, 1);
  assert.equal(getConfig().lowResourceMode, true);
  const config = getConfig({ maxProfiles: 3 });
  assert.equal(config.maxProfiles, 3);
});
