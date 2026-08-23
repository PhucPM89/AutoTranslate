"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CONFIG_KEY,
  sanitizeTranslationConfig,
  readTranslationConfig,
  writeTranslationConfig
} = require("./translation-config");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, Buffer.from(value)]));
  return {
    values,
    async get(key) { return values.get(key) || null; },
    async put(key, value) { values.set(key, Buffer.from(value)); }
  };
}

test("translation focus defaults to automatic mode", async () => {
  assert.deepEqual(await readTranslationConfig(memoryStorage()), {
    schema: 1,
    focusBookId: "",
    updatedAt: ""
  });
});

test("translation focus accepts only safe book ids", () => {
  assert.equal(sanitizeTranslationConfig({ focusBookId: "fanqie-123" }).focusBookId, "fanqie-123");
  assert.equal(sanitizeTranslationConfig({ focusBookId: "../../secret" }).focusBookId, "");
});

test("translation focus persists to the shared config key", async () => {
  const storage = memoryStorage();
  const saved = await writeTranslationConfig(storage, { focusBookId: "book-1" });
  assert.equal(saved.focusBookId, "book-1");
  assert.ok(saved.updatedAt);
  assert.equal((await readTranslationConfig(storage)).focusBookId, "book-1");
  assert.ok(storage.values.has(CONFIG_KEY));
});
