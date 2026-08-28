"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const {
  checkHachimiHealth,
  translateTextWithHachimi,
  translateBatchWithHachimi,
  translateChapterWithHachimi,
  cleanHachimiOutput
} = require("./hachimi");

test("cleanHachimiOutput normalizes punctuation and quotes correctly", () => {
  const raw = " “ Hắn  nhẹ nhàng  thở dài ， xoay người rời đi 。 ” \n\n\n\n Tiêu Viêm  nắm chặt  nắm đấm . ";
  const cleaned = cleanHachimiOutput(raw);
  assert.equal(cleaned.includes("“"), false);
  assert.equal(cleaned.includes("”"), false);
  assert.ok(cleaned.includes('"Hắn nhẹ nhàng thở dài'));
  assert.ok(cleaned.includes('Tiêu Viêm nắm chặt nắm đấm.'));
  assert.equal(cleaned.includes("\n\n\n"), false);
});

test("checkHachimiHealth returns error when no API URL is provided", async () => {
  const res = await checkHachimiHealth("");
  assert.equal(res.ok, false);
  assert.ok(res.error.includes("HACHIMI_API_URL"));
});

test("checkHachimiHealth and translateText work against mock server", async () => {
  let requestCount = 0;
  let receivedBody = null;

  // Create a lightweight local mock server
  const server = http.createServer((req, res) => {
    requestCount++;
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", ready: true, model: "ngocdang83/HachimiMT-60-QT", device: "cuda" }));
      return;
    }

    if (req.url === "/translate" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        receivedBody = JSON.parse(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          translation: "Hắn một kiếm đâm ra, kiếm khí tung hoành ba vạn dặm.",
          latency_ms: 45.2,
          model: "ngocdang83/HachimiMT-60-QT"
        }));
      });
      return;
    }

    if (req.url === "/translate-batch" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const parsed = JSON.parse(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          translations: parsed.texts.map((t) => `Bản dịch cho: ${t}`),
          latency_ms: 30.0,
          model: "ngocdang83/HachimiMT-60-QT"
        }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const mockApiUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Health check
    const health = await checkHachimiHealth(mockApiUrl);
    assert.equal(health.ok, true);
    assert.equal(health.data.model, "ngocdang83/HachimiMT-60-QT");

    // 2. Translate text
    const trans = await translateTextWithHachimi("他一剑刺出，剑气纵横三万里。", { apiUrl: mockApiUrl });
    assert.equal(trans.translation, "Hắn một kiếm đâm ra, kiếm khí tung hoành ba vạn dặm.");
    assert.equal(trans.model, "ngocdang83/HachimiMT-60-QT");
    assert.equal(receivedBody.text, "他一剑刺出，剑气纵横三万里。");

    // 3. Translate batch
    const batch = await translateBatchWithHachimi(["Câu 1", "Câu 2"], { apiUrl: mockApiUrl });
    assert.equal(batch.translations.length, 2);
    assert.equal(batch.translations[0], "Bản dịch cho: Câu 1");

    // 4. Translate chapter
    const chapterRes = await translateChapterWithHachimi(
      {
        chapterNumber: 1,
        title: "第一章 初始",
        content: "他一剑刺出，剑气纵横三万里。"
      },
      { apiUrl: mockApiUrl }
    );
    assert.equal(chapterRes.chapterNumber, 1);
    assert.equal(chapterRes.translationStatus, "completed");
    assert.equal(chapterRes.content, "Hắn một kiếm đâm ra, kiếm khí tung hoành ba vạn dặm.");
  } finally {
    server.close();
  }
});

test("translateTextWithHachimi handles retries on transient errors", async () => {
  let attempts = 0;
  const server = http.createServer((req, res) => {
    attempts++;
    if (attempts < 2) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: "Model loading" }));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ translation: "Thành công sau retry." }));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const mockApiUrl = `http://127.0.0.1:${port}`;

  try {
    const res = await translateTextWithHachimi("测试", { apiUrl: mockApiUrl, maxRetries: 3 });
    assert.equal(res.translation, "Thành công sau retry.");
    assert.equal(attempts, 2);
  } finally {
    server.close();
  }
});
