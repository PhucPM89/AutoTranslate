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
  archiveStorage = null,
  requestBudget = Infinity,
  deadlineAt = Infinity,
  spacingMs = 0,
  // Uploads dominate ingest wall-clock: a 1,425-chapter book is ~2,850 objects,
  // which takes hours one at a time and minutes in parallel.
  uploadConcurrency = 24,
  log = () => {}
}) {
  if (!storage) throw new Error("ingestBook cần storage.");
  if (!book || !book.id) throw new Error("ingestBook cần book.id.");

  const rev = revision || 1;
  log({ event: "ingest.started", bookId: book.id, revision: rev });

  const epub = await readEpub(epubBuffer);

  // 1. Archive the EPUB itself. Never served to readers, kept so a book can be
  //    re-ingested later without going back to the original source. It goes to a
  //    private store when one is configured, because the reader bucket is public.
  await (archiveStorage || storage).put(LAYOUT.archive(book.id), epubBuffer);

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
  const sourceWrites = [];
  for await (const chapter of extractChapters(epub)) {
    sourceWrites.push(() =>
      storage.put(
        originalKey(book.id, rev, chapter.chapterNumber),
        JSON.stringify(buildOriginalDocument({ bookId: book.id, revision: rev, chapter }))
      )
    );
    chapterList.push({
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      characters: chapter.characters,
      translationStatus: "pending"
    });
  }
  await runPool(sourceWrites, uploadConcurrency);
  if (!chapterList.length) throw new Error("EPUB không có chương nào đọc được.");
  log({ event: "ingest.chapters_extracted", bookId: book.id, chapters: chapterList.length });

  // 4. Job state, merged so an interrupted run resumes rather than restarts.
  const existingState = await readJson(storage, jobStateKey(book.id));
  const state = mergeJobState(existingState, createJobState({ bookId: book.id, revision: rev, chapters: chapterList }));
  await storage.put(jobStateKey(book.id), JSON.stringify(state));

  // Carry the merged statuses onto the chapter list before anything is published.
  // This used to happen only when ingest also translated, so a crawler re-ingest -
  // which never translates - reported every chapter as pending and reset the
  // book's translated count to 0 in the database, hiding hundreds of finished
  // chapters from the reader.
  syncChapterStatuses(chapterList, state);

  // 5. Publish the index now. The book is browsable and every chapter is already
  //    readable in its source language while translation catches up.
  const bookRecord = { ...book, cover: coverUrl };
  await publishIndex({ storage, book: bookRecord, revision: rev, chapters: chapterList, state });

  // 6. Untranslated chapters are published as-is so no reader ever hits a 404.
  await runPool(
    chapterList.map((entry) => async () => {
      const key = chapterKey(book.id, rev, entry.chapterNumber);
      if (await storage.head(key)) return;
      const source = await readJson(storage, originalKey(book.id, rev, entry.chapterNumber));
      if (!source) return;
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
    }),
    uploadConcurrency
  );

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

    // Translation just moved several chapters on, so refresh the statuses.
    syncChapterStatuses(chapterList, state);
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
    // The genre is a label on the book; the database stores it as a category link.
    if (metadataStore.linkCategory) {
      await metadataStore
        .linkCategory(book.id, book.genre)
        .catch((error) => log({ event: "ingest.category_link_failed", message: error.message }));
    }
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

// The job state is the truth about what is translated; the chapter list is what
// gets published. Keeping them in step is what makes the counts in the index and
// the database agree.
function syncChapterStatuses(chapterList, state) {
  const byNumber = new Map(state.chapters.map((entry) => [entry.n, entry.status]));
  for (const entry of chapterList) {
    const status = byNumber.get(entry.chapterNumber);
    if (status) entry.translationStatus = status;
  }
  return chapterList;
}

async function publishIndex({ storage, book, revision, chapters, state }) {
  const withStatus = chapters.map((chapter) => {
    const jobEntry = state.chapters.find((entry) => entry.n === chapter.chapterNumber);
    return { ...chapter, translationStatus: jobEntry ? jobEntry.status : chapter.translationStatus };
  });
  // When no public hostname is configured yet the index still gets written, with a
  // relative template that the reader resolves against its configured CDN base.
  let publicUrlFor = null;
  try {
    storage.publicUrl(indexKey(book.id));
    publicUrlFor = (key) => storage.publicUrl(key);
  } catch {
    publicUrlFor = null;
  }
  await storage.put(
    indexKey(book.id),
    JSON.stringify(buildBookIndex({ book, revision, chapters: withStatus, publicUrlFor }))
  );
}

// Bounded parallelism: keeps `concurrency` uploads in flight without building a
// promise for every one of a book's thousands of chapters up front.
async function runPool(tasks, concurrency) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, tasks.length)) }, async () => {
    while (index < tasks.length) {
      const current = index;
      index += 1;
      await tasks[current]();
    }
  });
  await Promise.all(workers);
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
