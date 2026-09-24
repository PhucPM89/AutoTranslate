"use strict";

const { LAYOUT } = require("../storage");
const { jobStateKey } = require("./translation-queue");

const JSON_OPTIONS = {
  contentType: "application/json; charset=utf-8",
  cacheControl: "public, max-age=60, stale-while-revalidate=600"
};

function isPreconditionFailure(error) {
  return Number(error?.status || error?.statusCode) === 412 || /\b412\b/.test(String(error?.message || ""));
}

async function updateJson(storage, key, mutate, { attempts = 5, options = JSON_OPTIONS } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const head = await storage.head(key);
    const raw = await storage.get(key);
    if (!head || !raw) return null;
    const current = JSON.parse(raw.toString("utf8"));
    const next = mutate(current);
    if (!next) return current;
    try {
      await storage.put(key, JSON.stringify(next, null, 2), { ...options, ifMatch: head.etag });
      return next;
    } catch (error) {
      if (!isPreconditionFailure(error) || attempt === attempts - 1) throw error;
    }
  }
  return null;
}

async function syncCompletedChapter({ storage, bookId, revision, chapterNumber, title, provider, model, manualEdited = false }) {
  const n = Number(chapterNumber);
  const now = new Date().toISOString();

  const state = await updateJson(storage, jobStateKey(bookId), (doc) => {
    if (Number(doc.revision) !== Number(revision) || !Array.isArray(doc.chapters)) return null;
    const entry = doc.chapters.find((chapter) => Number(chapter.n) === n);
    if (!entry) return null;
    entry.status = "completed";
    entry.lastError = "";
    entry.nextAttemptAt = 0;
    entry.completedAt = now;
    doc.updatedAt = now;
    return doc;
  }, { options: { contentType: JSON_OPTIONS.contentType, cacheControl: "private, no-store" } });

  const index = await updateJson(storage, LAYOUT.bookIndex(bookId), (doc) => {
    if (Number(doc.revision) !== Number(revision) || !Array.isArray(doc.chapters)) return null;
    const entry = doc.chapters.find((chapter) => Number(chapter.n) === n);
    if (!entry) return null;
    entry.status = "completed";
    if (title) entry.title = String(title).trim();
    if (provider) entry.provider = provider;
    if (model) entry.model = model;
    if (manualEdited) entry.manualEdited = true;
    doc.translatedChapters = doc.chapters.filter((chapter) => chapter.status === "completed").length;
    if (doc.totalChapters && doc.translatedChapters >= doc.totalChapters) doc.status = "Hoàn thành";
    doc.updatedAt = now;
    return doc;
  });

  return { state, index };
}

module.exports = { syncCompletedChapter };
