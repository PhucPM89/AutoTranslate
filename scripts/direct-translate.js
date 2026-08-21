"use strict";

// Script hỗ trợ dịch trực tiếp và đẩy bản dịch lên Cloudflare R2 + Supabase.
// Usage: node --env-file=.env --env-file=.env.local scripts/direct-translate.js --book <bookId> --chapter <n>

const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { chapterKey, originalKey, buildChapterDocument } = require("../server/ingest/documents");
const { publishIndex } = require("../server/ingest/ingest-book");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");
const { jobStateKey } = require("../server/ingest/translation-queue");

const storage = createStorage();
const db = createSupabase();

async function readJson(storage, key) {
  try {
    const raw = await storage.get(key);
    if (!raw) return null;
    return JSON.parse(raw.toString("utf8"));
  } catch (err) {
    return null;
  }
}

async function getOriginalChapter(bookId, chapterNumber, revision = 1) {
  const key = originalKey(bookId, revision, chapterNumber);
  const data = await readJson(storage, key);
  return data;
}

async function saveTranslatedChapter({ bookId, chapterNumber, revision = 1, translation, titleVi }) {
  const origKey = originalKey(bookId, revision, chapterNumber);
  const original = await readJson(storage, origKey);
  if (!original) throw new Error(`Không tìm thấy chương gốc: ${origKey}`);

  const chapterDoc = buildChapterDocument({
    bookId,
    revision,
    chapter: {
      chapterNumber,
      title: titleVi || original.title,
      content: original.content
    },
    translation,
    translationStatus: "completed"
  });

  const cKey = chapterKey(bookId, revision, chapterNumber);
  await storage.put(cKey, JSON.stringify(chapterDoc));

  // Update job state
  const jKey = jobStateKey(bookId);
  const jobState = (await readJson(storage, jKey)) || {};
  if (jobState.completed) {
    if (!jobState.completed.includes(chapterNumber)) {
      jobState.completed.push(chapterNumber);
      jobState.completed.sort((a, b) => a - b);
    }
  }
  if (jobState.pending) {
    jobState.pending = jobState.pending.filter((n) => n !== chapterNumber);
  }
  if (jobState.highPriority) {
    jobState.highPriority = jobState.highPriority.filter((n) => n !== chapterNumber);
  }
  jobState.updatedAt = new Date().toISOString();
  await storage.put(jKey, JSON.stringify(jobState));

  // Sync index and Supabase catalog
  const index = await readJson(storage, `books/${bookId}/r${revision}/index.json`);
  if (index && Array.isArray(index.chapters)) {
    const target = index.chapters.find((c) => c.n === chapterNumber);
    if (target) {
      target.status = "completed";
      if (titleVi) target.title = titleVi;
    }
    index.translatedChapters = index.chapters.filter((c) => c.status === "completed").length;
    index.updatedAt = new Date().toISOString();
    await storage.put(`books/${bookId}/r${revision}/index.json`, JSON.stringify(index));
  }

  // Update Supabase chapters & books row if configured
  if (db) {
    try {
      await db.upsertChapters(bookId, revision, [
        {
          chapterNumber,
          title: titleVi || original.title,
          translationStatus: "completed"
        }
      ]);
      await db.updateBookProgress(bookId, {
        totalChapters: index?.totalChapters || 2544,
        translatedChapters: index?.translatedChapters || 1,
        revision
      });
      await publishCatalogSnapshot({ storage, db });
    } catch (err) {
      console.warn("Supabase update error:", err.message);
    }
  }

  return { success: true, key: cKey, totalTranslated: index?.translatedChapters };
}

module.exports = {
  getOriginalChapter,
  saveTranslatedChapter,
  storage,
  db
};
