"use strict";

const CONFIG_KEY = "config/translation.json";
const BOOK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function sanitizeTranslationConfig(value = {}) {
  const focusBookId = String(value?.focusBookId || "").trim();
  return {
    schema: 1,
    focusBookId: BOOK_ID_PATTERN.test(focusBookId) ? focusBookId : "",
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : ""
  };
}

async function readTranslationConfig(storage) {
  if (!storage) throw new Error("readTranslationConfig cần storage.");
  try {
    const raw = await storage.get(CONFIG_KEY);
    if (!raw) return sanitizeTranslationConfig();
    return sanitizeTranslationConfig(JSON.parse(raw.toString("utf8")));
  } catch {
    return sanitizeTranslationConfig();
  }
}

async function writeTranslationConfig(storage, patch = {}) {
  if (!storage) throw new Error("writeTranslationConfig cần storage.");
  const current = await readTranslationConfig(storage);
  const next = sanitizeTranslationConfig({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  });
  await storage.put(CONFIG_KEY, JSON.stringify(next, null, 2));
  return next;
}

module.exports = {
  CONFIG_KEY,
  BOOK_ID_PATTERN,
  sanitizeTranslationConfig,
  readTranslationConfig,
  writeTranslationConfig
};
