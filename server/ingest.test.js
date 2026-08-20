"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const JSZip = require("jszip");

const { createStorage, hasR2Credentials } = require("./storage");
const { cacheControlFor, LAYOUT } = require("./storage/keys");
const { readEpub, extractChapters, extractReadableText } = require("./ingest/epub");
const { buildChapterDocument, buildBookIndex, chapterUrlFromTemplate } = require("./ingest/documents");
const {
  createJobState,
  mergeJobState,
  nextChapter,
  backoffFor,
  runTranslationJobs,
  isQuotaError,
  summarize
} = require("./ingest/translation-queue");
const { ingestBook } = require("./ingest/ingest-book");

function tempStorage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-test-"));
  return { storage: createStorage({ LOCAL_STORAGE_DIR: dir, LOCAL_PUBLIC_BASE_URL: "https://cdn.test" }), dir };
}

async function buildEpub({ chapters = 3, withCover = true, withNav = true } = {}) {
  const zip = new JSZip();
  zip.file(
    "META-INF/container.xml",
    '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'
  );
  const items = [];
  const refs = [];
  for (let i = 1; i <= chapters; i += 1) {
    items.push(`<item id="c${i}" href="ch${i}.xhtml" media-type="application/xhtml+xml"/>`);
    refs.push(`<itemref idref="c${i}"/>`);
    zip.file(
      `OEBPS/ch${i}.xhtml`,
      `<html><body><h2>Nguon ${i}</h2><p>Doan mot cua chuong ${i}.</p><p>Doan hai&nbsp;cua chuong ${i}.</p><script>bad()</script></body></html>`
    );
  }
  if (withCover) {
    items.push('<item id="cover" href="cover.jpg" media-type="image/jpeg"/>');
    zip.file("OEBPS/cover.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  }
  if (withNav) {
    items.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
    const links = Array.from({ length: chapters }, (_, i) => `<a href="ch${i + 1}.xhtml">Chuong ${i + 1} tu nav</a>`).join("");
    zip.file("OEBPS/nav.xhtml", `<html><body><nav>${links}</nav></body></html>`);
  }
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?><package xmlns:dc="http://purl.org/dc/elements/1.1/">
      <metadata><dc:title>Sach Test</dc:title><dc:creator>Tac Gia</dc:creator><dc:description>Mo ta</dc:description>
      ${withCover ? '<meta name="cover" content="cover"/>' : ""}</metadata>
      <manifest>${items.join("")}</manifest>
      <spine>${refs.join("")}</spine>
    </package>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

test("extracts chapters, titles and cover from an EPUB", async () => {
  const epub = await readEpub(await buildEpub({ chapters: 3 }));
  assert.equal(epub.metadata.title, "Sach Test");
  assert.equal(epub.metadata.author, "Tac Gia");
  assert.equal(epub.cover.contentType, "image/jpeg");

  const chapters = [];
  for await (const chapter of extractChapters(epub)) chapters.push(chapter);
  assert.equal(chapters.length, 3);
  assert.deepEqual(chapters.map((c) => c.chapterNumber), [1, 2, 3]);
  assert.equal(chapters[0].title, "Chuong 1 tu nav", "nav title wins over the heading");
  assert.match(chapters[0].content, /Doan mot cua chuong 1/);
  assert.doesNotMatch(chapters[0].content, /bad\(\)/, "script contents must be dropped");
  assert.doesNotMatch(chapters[0].content, /<|>/, "no markup may survive");
});

test("falls back to the heading when the EPUB has no nav", async () => {
  const epub = await readEpub(await buildEpub({ chapters: 2, withNav: false }));
  const chapters = [];
  for await (const chapter of extractChapters(epub)) chapters.push(chapter);
  assert.equal(chapters[0].title, "Nguon 1");
});

test("keeps paragraph breaks and decodes entities", () => {
  const text = extractReadableText("<body><p>Mot&nbsp;hai</p><p>Ba &amp; bon</p></body>");
  assert.deepEqual(text.split("\n\n"), ["Mot hai", "Ba & bon"]);
});

test("assigns immutable cache only to versioned chapter objects", () => {
  assert.match(cacheControlFor("books/b/r1/ch/9.json"), /immutable/);
  assert.match(cacheControlFor("books/b/r1/ch/9.original.json"), /immutable/);
  assert.doesNotMatch(cacheControlFor("books/b/index.json"), /immutable/);
  assert.match(cacheControlFor("archives/b.epub"), /no-store/, "archives are never reader-facing");
  assert.match(cacheControlFor("covers/b.webp"), /max-age=604800/);
});

test("rejects a book id that would escape its prefix", () => {
  assert.throws(() => LAYOUT.chapter("../../etc", 1, 1), /bookId/);
  assert.equal(LAYOUT.chapter("fanqie-123", 2, 7), "books/fanqie-123/r2/ch/7.json");
  assert.throws(() => LAYOUT.chapter("ok", 1, 0), /Chapter number/);
});

test("a chapter document carries the source text until a translation exists", () => {
  const chapter = { chapterNumber: 4, title: "T", content: "nguon" };
  const pending = buildChapterDocument({ bookId: "b", revision: 1, chapter, translation: null });
  assert.equal(pending.translationStatus, "pending");
  assert.equal(pending.content, "nguon", "reader still gets something to read");

  const done = buildChapterDocument({ bookId: "b", revision: 1, chapter, translation: "dich", translationStatus: "completed" });
  assert.equal(done.content, "dich");
  assert.equal(done.characters, 4);
});

test("the index ships a url template instead of one url per chapter", () => {
  const chapters = Array.from({ length: 50 }, (_, i) => ({
    chapterNumber: i + 1,
    title: `C${i + 1}`,
    translationStatus: i < 10 ? "completed" : "pending"
  }));
  const index = buildBookIndex({
    book: { id: "b", title: "T" },
    revision: 3,
    chapters,
    publicUrlFor: (key) => `https://cdn.test/${key}`
  });
  assert.equal(index.chapterUrlTemplate, "https://cdn.test/books/b/r3/ch/{n}.json");
  assert.equal(index.totalChapters, 50);
  assert.equal(index.translatedChapters, 10);
  assert.equal(chapterUrlFromTemplate(index.chapterUrlTemplate, 42), "https://cdn.test/books/b/r3/ch/42.json");
  assert.ok(!("url" in index.chapters[0]), "per-chapter urls would bloat the hot path");
});

test("local storage put/get/head/list/remove round trip", async () => {
  const { storage } = tempStorage();
  assert.equal(await storage.get("missing/x.json"), null);
  assert.equal(await storage.head("missing/x.json"), null);

  await storage.put("books/b/r1/ch/1.json", JSON.stringify({ a: 1 }));
  const head = await storage.head("books/b/r1/ch/1.json");
  assert.equal(head.contentType, "application/json; charset=utf-8");
  assert.match(head.cacheControl, /immutable/);
  assert.deepEqual(JSON.parse((await storage.get("books/b/r1/ch/1.json")).toString()), { a: 1 });
  assert.equal(storage.publicUrl("books/b/r1/ch/1.json"), "https://cdn.test/books/b/r1/ch/1.json");

  const listed = await storage.list("books/b/");
  assert.equal(listed.length, 1);
  await storage.remove("books/b/r1/ch/1.json");
  assert.equal(await storage.head("books/b/r1/ch/1.json"), null);
});

test("R2 driver is selected only when every credential is present", () => {
  assert.equal(hasR2Credentials({}), false);
  assert.equal(hasR2Credentials({ R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c" }), false);
  assert.equal(
    hasR2Credentials({ R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c", R2_BUCKET: "d" }),
    true
  );
});

test("queue hands out the lowest pending chapter first", () => {
  const state = createJobState({ bookId: "b", revision: 1, chapters: [{ chapterNumber: 3 }, { chapterNumber: 1 }, { chapterNumber: 2 }] });
  assert.equal(nextChapter(state).n, 1);
  state.chapters.find((c) => c.n === 1).status = "completed";
  assert.equal(nextChapter(state).n, 2);
});

test("queue respects backoff and gives up after max attempts", () => {
  assert.equal(backoffFor(1, 1000), 1000);
  assert.equal(backoffFor(3, 1000), 4000);
  const state = createJobState({ bookId: "b", revision: 1, chapters: [{ chapterNumber: 1 }] });
  const entry = state.chapters[0];
  entry.status = "retrying";
  entry.nextAttemptAt = 10_000;
  assert.equal(nextChapter(state, { now: 5_000 }), null, "still backing off");
  assert.equal(nextChapter(state, { now: 10_000 }).n, 1);
  entry.status = "failed";
  entry.attempts = 4;
  entry.nextAttemptAt = 0;
  assert.equal(nextChapter(state, { now: 20_000, maxAttempts: 4 }), null, "exhausted");
});

test("a chapter is never completed when the upload fails", async () => {
  const state = createJobState({ bookId: "b", revision: 1, chapters: [{ chapterNumber: 1 }] });
  const result = await runTranslationJobs({
    state,
    loadChapter: async () => ({ chapterNumber: 1, title: "t", content: "c" }),
    translateChapter: async () => "dich",
    publishChapter: async () => { throw new Error("R2 PUT lỗi HTTP 500"); },
    saveState: async () => {},
    maxAttempts: 1,
    backoffBaseMs: 1
  });
  assert.equal(result.translated, 0);
  assert.equal(state.chapters[0].status, "failed");
  assert.match(state.chapters[0].lastError, /R2 PUT/);
});

test("quota exhaustion pauses the run without burning an attempt", async () => {
  const state = createJobState({ bookId: "b", revision: 1, chapters: [{ chapterNumber: 1 }, { chapterNumber: 2 }] });
  const quota = Object.assign(new Error("Resource exhausted"), { code: "quota_exceeded" });
  const result = await runTranslationJobs({
    state,
    loadChapter: async (n) => ({ chapterNumber: n, title: "t", content: "c" }),
    translateChapter: async () => { throw quota; },
    publishChapter: async () => {},
    saveState: async () => {},
    backoffBaseMs: 1
  });
  assert.equal(result.quotaExhausted, true);
  assert.equal(state.chapters[0].status, "pending", "returned to the queue");
  assert.equal(state.chapters[0].attempts, 0, "attempt refunded");
  assert.equal(state.chapters[1].status, "pending", "run stopped instead of hammering");
  assert.ok(isQuotaError({ status: 429 }));
  assert.ok(!isQuotaError(new Error("mạng lỗi")));
});

test("a request budget stops the run early and leaves the rest resumable", async () => {
  const state = createJobState({ bookId: "b", revision: 1, chapters: Array.from({ length: 10 }, (_, i) => ({ chapterNumber: i + 1 })) });
  const seen = [];
  const result = await runTranslationJobs({
    state,
    requestBudget: 3,
    loadChapter: async (n) => ({ chapterNumber: n, title: "t", content: "c" }),
    translateChapter: async (chapter) => { seen.push(chapter.chapterNumber); return "d"; },
    publishChapter: async () => {},
    saveState: async () => {}
  });
  assert.deepEqual(seen, [1, 2, 3]);
  assert.equal(result.summary.completed, 3);
  assert.equal(result.summary.pending, 7);
  assert.equal(result.done, false);
});

test("merging job state keeps completed chapters across a re-ingest", () => {
  const first = createJobState({ bookId: "b", revision: 1, chapters: [{ chapterNumber: 1 }, { chapterNumber: 2 }] });
  first.chapters[0].status = "completed";
  const merged = mergeJobState(first, createJobState({ bookId: "b", revision: 1, chapters: [{ chapterNumber: 1 }, { chapterNumber: 2 }] }));
  assert.equal(merged.chapters[0].status, "completed");
  assert.equal(merged.chapters[1].status, "pending");

  const newRevision = mergeJobState(first, createJobState({ bookId: "b", revision: 2, chapters: [{ chapterNumber: 1 }] }));
  assert.equal(newRevision.chapters[0].status, "pending", "a new revision starts fresh");
});

test("ingest is idempotent: running twice does not duplicate or re-translate", async () => {
  const { storage } = tempStorage();
  const buffer = await buildEpub({ chapters: 6 });
  const book = { id: "book-1", title: "Sach", author: "A" };
  const calls = [];
  const options = {
    storage,
    epubBuffer: buffer,
    book,
    revision: 1,
    translate: async (chapter) => { calls.push(chapter.chapterNumber); return `VI ${chapter.chapterNumber}`; },
    requestBudget: 2
  };

  const first = await ingestBook(options);
  assert.equal(first.totalChapters, 6);
  assert.deepEqual(calls, [1, 2]);

  const second = await ingestBook(options);
  assert.equal(second.totalChapters, 6, "no duplicated chapters");
  assert.deepEqual(calls, [1, 2, 3, 4], "resumed instead of restarting");

  const objects = await storage.list("books/book-1/");
  assert.equal(objects.filter((o) => /\/ch\/\d+\.json$/.test(o.key)).length, 6, "one object per chapter");
  const index = JSON.parse((await storage.get("books/book-1/index.json")).toString());
  assert.equal(index.totalChapters, 6);
  assert.equal(index.translatedChapters, 4);
  assert.equal(JSON.parse((await storage.get("books/book-1/r1/ch/1.json")).toString()).content, "VI 1");
  assert.equal(
    JSON.parse((await storage.get("books/book-1/r1/ch/6.json")).toString()).translationStatus,
    "pending",
    "untranslated chapters are still published so the reader never 404s"
  );
});

test("ingest writes the archive, the cover and a resumable job state", async () => {
  const { storage } = tempStorage();
  await ingestBook({
    storage,
    epubBuffer: await buildEpub({ chapters: 2 }),
    book: { id: "book-2", title: "S" },
    revision: 1
  });
  assert.ok(await storage.head("archives/book-2.epub"));
  assert.ok(await storage.head("covers/book-2.jpg"));
  const state = JSON.parse((await storage.get("jobs/book-2/translation.json")).toString());
  assert.equal(summarize(state).total, 2);
  assert.equal(summarize(state).pending, 2);
});

test("a new revision publishes to new immutable keys and leaves the old ones", async () => {
  const { storage } = tempStorage();
  const book = { id: "book-3", title: "S" };
  await ingestBook({ storage, epubBuffer: await buildEpub({ chapters: 2 }), book, revision: 1 });
  await ingestBook({ storage, epubBuffer: await buildEpub({ chapters: 2 }), book, revision: 2 });
  assert.ok(await storage.head("books/book-3/r1/ch/1.json"), "old revision survives for cached clients");
  assert.ok(await storage.head("books/book-3/r2/ch/1.json"));
  const index = JSON.parse((await storage.get("books/book-3/index.json")).toString());
  assert.equal(index.revision, 2);
  assert.match(index.chapterUrlTemplate, /\/r2\/ch\/\{n\}\.json$/);
});
