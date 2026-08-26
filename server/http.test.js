"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { readJsonBody } = require("./http");

function createMockRequest(chunks = [], headers = {}) {
  const req = new EventEmitter();
  req.headers = headers;
  req.destroy = () => {
    req.destroyed = true;
  };
  process.nextTick(() => {
    for (const chunk of chunks) {
      req.emit("data", chunk);
    }
    req.emit("end");
  });
  return req;
}

test("readJsonBody parses standard JSON payload", async () => {
  const payload = { title: "Tiên Hiệp", chapters: 10 };
  const jsonBuf = Buffer.from(JSON.stringify(payload), "utf8");
  const req = createMockRequest([jsonBuf]);
  const result = await readJsonBody(req);
  assert.deepEqual(result, payload);
});

test("readJsonBody correctly reconstructs multibyte UTF-8 characters split across buffer chunks", async () => {
  const payload = { text: "Tu Chân Giới: 这是一个修仙故事，tiếng Việt chuẩn UTF-8." };
  const fullBuf = Buffer.from(JSON.stringify(payload), "utf8");

  // Intentionally split the buffer at every single byte boundary
  const chunks = [];
  for (let i = 0; i < fullBuf.length; i += 3) {
    chunks.push(fullBuf.subarray(i, Math.min(i + 3, fullBuf.length)));
  }

  const req = createMockRequest(chunks);
  const result = await readJsonBody(req);
  assert.deepEqual(result, payload);
  assert.equal(result.text, payload.text);
});

test("readJsonBody rejects payloads exceeding byte limit with 413", async () => {
  const largeBuf = Buffer.alloc(1000, 65);
  const req = createMockRequest([largeBuf]);
  await assert.rejects(
    () => readJsonBody(req, 500),
    (err) => {
      assert.equal(err.status, 413);
      assert.match(err.message, /too large/i);
      return true;
    }
  );
});

test("readJsonBody rejects invalid JSON syntax with 400", async () => {
  const invalidBuf = Buffer.from("not-a-valid-json", "utf8");
  const req = createMockRequest([invalidBuf]);
  await assert.rejects(
    () => readJsonBody(req),
    (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /JSON không hợp lệ/);
      return true;
    }
  );
});
