"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { handleApiRequest } = require("../worker/api.js");

function createMockEnv() {
  const store = new Map();
  return {
    R2_ARCHIVE: {
      async get(key) {
        if (!store.has(key)) return null;
        const val = store.get(key);
        return {
          async text() { return val; },
          async arrayBuffer() { return Buffer.from(val).buffer; }
        };
      },
      async put(key, value) {
        store.set(key, typeof value === "string" ? value : Buffer.from(value).toString("utf8"));
      }
    },
    store
  };
}

test("Reader Term Feedback: validates required fields", async () => {
  const env = createMockEnv();
  const req = new Request("https://tram-chu.online/api/reader/term-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId: "", originalTerm: "" })
  });

  const res = await handleApiRequest({ request: req, env });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /Thiếu thông tin/);
});

test("Reader Term Feedback: saves suggested term to book glossary", async () => {
  const env = createMockEnv();
  const req = new Request("https://tram-chu.online/api/reader/term-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bookId: "kiem-lai-123",
      originalTerm: "落井下石",
      suggestedTranslation: "giậu đổ bìm leo"
    })
  });

  const res = await handleApiRequest({ request: req, env });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.match(data.message, /thành công/);

  // Check stored in mock R2
  const storedJson = env.store.get("glossary/kiem-lai-123.json");
  assert.ok(storedJson);
  const parsed = JSON.parse(storedJson);
  assert.equal(parsed["落井下石"], "giậu đổ bìm leo");
});
