"use strict";

const { readEpub, extractChapters } = require("./epub");
const { buildChapterDocument, buildOriginalDocument, buildBookIndex, chapterKey, originalKey, indexKey } = require("./documents");
const {
  jobStateKey,
  createJobState,
  mergeJobState,
  runTranslationJobs,
  summarize,
  isDone
} = require("./translation-queue");
const { LAYOUT } = require("../storage/keys");

// The single ingest path. Both the admin upload and the Fanqie crawler call this
// so there is exactly one implementation of "EPUB in, readable book out".
//
//   EPUB -> extract -> store source chapters + archive + cover
//        -> publish an index immediately (book is browsable right away)
//        -> translate in the background, chapter by chapter, resumable
//
// Chapters are written under a revision prefix, so a re-ingest of the same book
// produces new immutable URLs instead of overwriting CDN-cached objects.

async function ingestBook({
  storage,
  epubBuffer,
  book,
  revision,
  translate = null,
  metadataStore = null,
  requestBudget = Infinity,
  deadlineAt = Infinity,
  spacingMs = 0,
  log = () => {}
}) {
  if (!storage) throw new Error("ingestBook cần storage.");
  if (!book || !book.id) throw new Error("ingestBook cần book.id.");

  const rev = revision || 1;
  log({ event: "ingest.started", bookId: book.id, revision: rev });

  const epub = await readEpub(epubBuffer);

  // 1. Archive the EPUB itself. Never served to readers, kept so a book can be
  //    re-ingested later without going back to the original source.
  await storage.put(LAYOUT.archive(book.id), epubBuffer);

  // 2. Cover, if the EPUB carries one and the catalog has none.
  let coverUrl = book.cover || "";
  if (!coverUrl && epub.cover) {
    const extension = epub.cover.contentType === "image/png" ? ".png" : epub.cover.contentType === "image/webp" ? ".webp" : ".jpg";
    const put = await storage.put(LAYOUT.cover(book.id, extension), epub.cover.data, {
      contentType: epub.cover.contentType
    });
    coverUrl = put.url;
  }

  // 3. Source chapters. Written first so translation can resume from storage
  //    without re-parsing the EPUB.
  const chapterList = [];
  for await (const chapter of extractChapters(epub)) {
    await storage.put(
      originalKey(book.id, rev, chapter.chapterNumber),
      JSON.stringify(buildOriginalDocument({ bookId: book.id, revision: rev, chapter }))
    );
    chapterList.push({
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      characters: chapter.characters,
      translationStatus: "pending"
    });
  }
  if (!chapterList.length) throw new Error("EPUB không có chương nào đọc được.");
  log({ event: "ingest.chapters_extracted", bookId: book.id, chapters: chapterList.length });

  // 4. Job state, merged so an interrupted run resumes rather than restarts.
  const existingState = await readJson(storage, jobStateKey(book.id));
  const state = mergeJobState(existingState, createJobState({ bookId: book.id, revision: rev, chapters: chapterList }));
  await storage.put(jobStateKey(book.id), JSON.stringify(state));

  // 5. Publish the index now. The book is browsable and every chapter is already
  //    readable in its source language while translation catches up.
  const bookRecord = { ...book, cover: coverUrl };
  await publishIndex({ storage, book: bookRecord, revision: rev, chapters: chapterList, state });

  // 6. Untranslated chapters are published as-is so no reader ever hits a 404.
  for (const entry of chapterList) {
    const key = chapterKey(book.id, rev, entry.chapterNumber);
    if (await storage.head(key)) continue;
    const source = await readJson(storage, originalKey(book.id, rev, entry.chapterNumber));
    await storage.put(
      key,
      JSON.stringify(
        buildChapterDocument({
          bookId: book.id,
          revision: rev,
          chapter: source,
          translation: null,
          translationStatus: "pending"
        })
      )
    );
  }

  // 7. Translate, if a translator was supplied and there is budget for it.
  let translationResult = { translated: 0, failed: 0, quotaExhausted: false, spent: 0, summary: summarize(state), done: isDone(state) };
  if (translate) {
    translationResult = await runTranslationJobs({
      state,
      requestBudget,
      deadlineAt,
      spacingMs,
      loadChapter: (n) => readJson(storage, originalKey(book.id, rev, n)),
      translateChapter: (chapter) => translate(chapter),
      publishChapter: async (chapter, translation) => {
        await storage.put(
          chapterKey(book.id, rev, chapter.chapterNumber),
          JSON.stringify(
            buildChapterDocument({
              bookId: book.id,
              revision: rev,
              chapter,
              translation,
              translationStatus: "completed"
            })
          )
        );
      },
      saveState: (next) => storage.put(jobStateKey(book.id), JSON.stringify(next)),
      onProgress: (progress) => log({ event: "ingest.chapter_translated", bookId: book.id, ...progress })
    });

    // Reflect finished chapters in the index so the reader sees real statuses.
    for (const entry of chapterList) {
      const jobEntry = state.chapters.find((c) => c.n === entry.chapterNumber);
      if (jobEntry && jobEntry.status === "completed") entry.translationStatus = "completed";
      else if (jobEntry) entry.translationStatus = jobEntry.status;
    }
    await publishIndex({ storage, book: bookRecord, revision: rev, chapters: chapterList, state });
  }

  // 8. Metadata last, so the database only ever describes objects that exist.
  if (metadataStore) {
    await metadataStore.upsertBook({
      ...bookRecord,
      revision: rev,
      totalChapters: chapterList.length,
      translatedChapters: chapterList.filter((c) => c.translationStatus === "completed").length
    });
    await metadataStore.upsertChapters(book.id, rev, chapterList);
  }

  const result = {
    bookId: book.id,
    revision: rev,
    coverUrl,
    totalChapters: chapterList.length,
    indexKey: indexKey(book.id),
    ...translationResult
  };
  log({ event: "ingest.completed", ...result });
  return result;
}

async function publishIndex({ storage, book, revision, chapters, state }) {
  const withStatus = chapters.map((chapter) => {
    const jobEntry = state.chapters.find((entry) => entry.n === chapter.chapterNumber);
    return { ...chapter, translationStatus: jobEntry ? jobEntry.status : chapter.translationStatus };
  });
  await storage.put(
    indexKey(book.id),
    JSON.stringify(buildBookIndex({ book, revision, chapters: withStatus, publicUrlFor: (key) => storage.publicUrl(key) }))
  );
}

async function readJson(storage, key) {
  const buffer = await storage.get(key);
  if (!buffer) return null;
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    return null;
  }
}

module.exports = { ingestBook, publishIndex };
