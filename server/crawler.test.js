"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const JSZip = require("jszip");
const { sanitizeCrawlerConfig, sanitizeCrawlerStatus } = require("./crawler-store");
const { discoverCandidates, discoverFromLibrary, fetchLibraryPage, bucketChapterFloor, parseRankBookIds, parseRankBooks, estimateChapterCount, parseFanqieChapterCount, roundRobin, readEpubMetadata, selectWorkItems, selectResumeJob, selectNewBookCandidates, describeEmptyRun, fetchText } = require("../scripts/crawler-worker");

function jwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256" })}.${encode(payload)}.signature`;
}

// Mirrors the real /api/author/library/book_list/v0/ envelope. word_count comes
// back masked as "." from Fanqie, so the bucket floor is the only size signal.
function libraryResponse(books, hasMore = false, totalCount = books.length) {
  return {
    code: 0,
    message: "success",
    data: {
      book_list: books.map((book) => ({
        book_id: book.id,
        book_name: book.name || "Truyện",
        author: book.author || "Tác giả",
        creation_status: book.status ?? 1,
        word_count: ".",
        read_count: ".读",
        abstract: "Giới thiệu"
      })),
      has_more: hasMore,
      total_count: totalCount
    }
  };
}

// Shaped like the real rank payload: window.__INITIAL_STATE__ with a book record
// per listed novel, including the numbered latest-chapter title and word count.
function rankPage(books) {
  const state = {
    common: { id: "" },
    rank: {
      list: books.map((book, index) => ({
        bookId: book.id,
        bookName: book.name || `Truyện ${index}`,
        author: "Tác giả",
        abstract: "Giới thiệu có { dấu ngoặc } và \"trích dẫn\" để thử brace matching.",
        wordNumber: book.words ?? 0,
        creationStatus: book.status ?? 1,
        lastChapterTitle: book.lastChapter ?? "",
        currentPos: index + 1
      }))
    }
  };
  const links = books.map((book) => `<a href="/page/${book.id}">x</a>`).join("");
  return `<html><body>${links}<script>( function(){ window.__INITIAL_STATE__=${JSON.stringify(state)}; }())</script></body></html>`;
}

test("sanitizes crawler configuration and removes unknown categories", () => {
  assert.deepEqual(sanitizeCrawlerConfig({
    enabled: true,
    categories: ["xianxia", "unknown", "xianxia", "horror"],
    maxNewBooksPerRun: 99,
    wordCountBucket: 3,
    creationStatus: 0,
    updateExisting: false,
    excludedSourceIds: ["1234567890123", "bad", "1234567890123"]
  }), {
    enabled: true,
    categories: ["xianxia", "horror"],
    maxNewBooksPerRun: 3,
    wordCountBucket: 3,
    creationStatus: 0,
    updateExisting: false,
    excludedSourceIds: ["1234567890123"]
  });
});

test("falls back to safe defaults for unknown word-count and status choices", () => {
  const config = sanitizeCrawlerConfig({ wordCountBucket: 99, creationStatus: 7 });
  assert.equal(config.wordCountBucket, 4, "mặc định là bucket truyện dài nhất");
  assert.equal(config.creationStatus, -1);

  const kept = sanitizeCrawlerConfig({ wordCountBucket: "0", creationStatus: "1" });
  assert.equal(kept.wordCountBucket, 0, "chuỗi số vẫn được nhận");
  assert.equal(kept.creationStatus, 1);
});

test("sanitizes crawler status before it is persisted", () => {
  const status = sanitizeCrawlerStatus({ state: "running", message: "  downloading\nbook  ", currentBookId: "id: 1234567890123", discovered: -1, published: 2 });
  assert.equal(status.state, "running");
  assert.equal(status.message, "downloading book");
  assert.equal(status.currentBookId, "1234567890123");
  assert.equal(status.discovered, 0);
  assert.equal(status.published, 2);
});

test("extracts unique Fanqie book IDs and interleaves genres", () => {
  const html = '<a href="/page/7077516958534470656">A</a><a href="/page/7077516958534470656">A</a><a href="/page/7637464494632881214">B</a>';
  assert.deepEqual(parseRankBookIds(html), ["7077516958534470656", "7637464494632881214"]);
  assert.deepEqual(roundRobin([["a1", "a2", "a3"], ["b1", "b2"], ["c1"]]), ["a1", "b1", "c1", "a2", "b2", "a3"]);
});

test("reads Fanqie chapter totals and keeps only books above the configured minimum", async () => {
  assert.equal(parseFanqieChapterCount('<script>{"chapterTotal":321,"followStatus":0}</script>'), 321);
  assert.equal(parseFanqieChapterCount("<html>missing</html>"), null);
  const candidates = ["1", "2", "3"].map((sourceId) => ({ sourceId, genre: "Tiên hiệp" }));
  const totals = { 1: 80, 2: 220, 3: 450 };
  const result = await selectNewBookCandidates(candidates, 200, 2, async (url) => {
    const sourceId = url.split("/").pop();
    return `{"chapterTotal":${totals[sourceId]},"followStatus":0}`;
  });
  assert.deepEqual(result.selected, [
    { sourceId: "2", genre: "Tiên hiệp", listedChapterCount: 220 },
    { sourceId: "3", genre: "Tiên hiệp", listedChapterCount: 450 }
  ]);
  assert.equal(result.networkErrors, 0);
  assert.equal(result.bestChapterCount, 450);
});

test("reports why a chapter-minimum scan found nothing", async () => {
  const candidates = Array.from({ length: 6 }, (_, index) => ({ sourceId: String(index + 1), genre: "Huyền huyễn" }));

  const short = await selectNewBookCandidates(candidates, 1000, 1, async () => '{"chapterTotal":180,"followStatus":0}');
  assert.deepEqual(short.selected, []);
  assert.equal(short.bestChapterCount, 180);
  assert.equal(short.networkErrors, 0);

  const blocked = await selectNewBookCandidates(candidates, 1000, 1, async () => {
    throw new Error("Fanqie trả HTTP 403.");
  });
  assert.deepEqual(blocked.selected, []);
  assert.equal(blocked.networkErrors, 6);
  assert.equal(blocked.bestChapterCount, 0);
});

test("stops scanning early when Fanqie starts returning unusable pages", async () => {
  // Fanqie throttles with HTTP 200 and an empty body, which parses to null.
  const candidates = Array.from({ length: 40 }, (_, index) => ({ sourceId: String(index + 1), genre: "Huyền huyễn" }));
  let calls = 0;
  const result = await selectNewBookCandidates(candidates, 1000, 1, async () => {
    calls += 1;
    return "";
  });

  assert.deepEqual(result.selected, []);
  assert.equal(result.throttled, true);
  assert.equal(result.unreadable, 6, "should abort after the throttle streak");
  assert.equal(calls, 6, "must not burn the whole budget against a throttled host");
});

test("names throttling instead of blaming the length filter", () => {
  const throttledMessage = describeEmptyRun(
    { wordCountBucket: 4 },
    50,
    { scanned: 6, networkErrors: 0, unreadable: 6, bestChapterCount: 0, throttled: true }
  );
  assert.match(throttledMessage, /chặn tốc độ/);

  const shortMessage = describeEmptyRun(
    { wordCountBucket: 4 },
    50,
    { scanned: 40, networkErrors: 0, unreadable: 0, bestChapterCount: 228, throttled: false }
  );
  assert.match(shortMessage, /dài nhất 228 chương/);
  assert.doesNotMatch(shortMessage, /chặn tốc độ/);
});

test("finds a long novel buried deep in the candidate list at no request cost", async () => {
  // The rank payload describes every candidate, so depth no longer costs requests:
  // a match at position 40 is as cheap to find as one at position 1.
  const candidates = Array.from({ length: 50 }, (_, index) => ({
    sourceId: String(index + 1),
    genre: "Huyền huyễn",
    listedChapterCount: index === 39 ? 1200 : 300
  }));
  let detailRequests = 0;
  const { selected, detailProbes } = await selectNewBookCandidates(candidates, 1000, 1, async () => {
    detailRequests += 1;
    return "";
  });

  assert.equal(selected.length, 1);
  assert.equal(selected[0].sourceId, "40");
  assert.equal(detailRequests, 0);
  assert.equal(detailProbes, 0);
});

test("pages deeper into a rank board when a length filter is set", async () => {
  const urls = [];
  const candidates = await discoverCandidates(
    { categories: ["fantasy"], wordCountBucket: 4 },
    { fantasy: { label: "Huyền huyễn", ranks: ["rank-new"], longRanks: ["rank-a"] } },
    async (url) => {
      urls.push(url);
      const offset = Number(new URL(url).searchParams.get("offset") || 0);
      return `<a href="/page/${"7".repeat(18)}${String(offset / 10).padStart(2, "0")}">book</a>`;
    }
  );

  // Deep enough to give the chapter filter a real pool, shallow enough that a run
  // stays well under the request volume that gets the crawler throttled.
  assert.equal(urls.length, 5);
  assert.equal(urls[0], "https://fanqienovel.com/rank/rank-a");
  assert.equal(urls[4], "https://fanqienovel.com/rank/rank-a?offset=40");
  assert.equal(candidates.length, 5);
});

test("carries rank-page chapter counts through discovery into selection", async () => {
  const pages = {
    0: rankPage([{ id: "1".repeat(19), name: "Dài", words: 9000000, lastChapter: "第3200章 x" }]),
    10: rankPage([{ id: "2".repeat(19), name: "Ngắn", words: 300000, lastChapter: "第140章 x" }])
  };
  let rankRequests = 0;

  const candidates = await discoverCandidates(
    { categories: ["fantasy"], wordCountBucket: 4 },
    { fantasy: { label: "Huyền huyễn", ranks: ["new"], longRanks: ["long"] } },
    async (url) => {
      rankRequests += 1;
      const offset = Number(new URL(url).searchParams.get("offset") || 0);
      return pages[offset] || rankPage([]);
    }
  );

  const long = candidates.find((book) => book.sourceId === "1".repeat(19));
  const short = candidates.find((book) => book.sourceId === "2".repeat(19));
  assert.equal(long.listedChapterCount, 3200);
  assert.equal(short.listedChapterCount, 140);

  let detailRequests = 0;
  const result = await selectNewBookCandidates(candidates, 1000, 1, async () => {
    detailRequests += 1;
    return "";
  });
  assert.equal(detailRequests, 0);
  assert.deepEqual(result.selected.map((book) => book.sourceId), ["1".repeat(19)]);
  // Whole run costs a handful of rank requests, not hundreds of detail requests.
  assert.ok(rankRequests <= 5, `rank requests should stay small, got ${rankRequests}`);
});

test("falls back to plain link scraping when the rank payload is absent", async () => {
  const candidates = await discoverCandidates(
    { categories: ["fantasy"], wordCountBucket: 4 },
    { fantasy: { label: "Huyền huyễn", ranks: ["new"], longRanks: ["long"] } },
    async () => `<a href="/page/${"9".repeat(19)}">book</a>`
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].sourceId, "9".repeat(19));
  assert.equal(candidates[0].listedChapterCount, null);
});

test("reads a single page of the new-book board when the length filter is off", async () => {
  const urls = [];
  await discoverCandidates(
    { categories: ["fantasy"], wordCountBucket: -1 },
    { fantasy: { label: "Huyền huyễn", ranks: ["rank-new"], longRanks: ["rank-a"] } },
    async (url) => {
      urls.push(url);
      return `<a href="/page/${"7".repeat(19)}">book</a>`;
    }
  );
  assert.deepEqual(urls, ["https://fanqienovel.com/rank/rank-new"]);
});

test("maps Fanqie word-count buckets to a chapter floor", () => {
  assert.equal(bucketChapterFloor(4), Math.floor(2000000 / 2200), "trên 2 triệu chữ");
  assert.equal(bucketChapterFloor(3), Math.floor(1000000 / 2200), "1-2 triệu chữ");
  assert.equal(bucketChapterFloor(0), 0, "dưới 300k chữ có sàn 0");
  assert.equal(bucketChapterFloor(-1), 0, "tất cả độ dài không đảm bảo gì");
});

test("builds the library request with the configured filters", async () => {
  let requested = "";
  const page = await fetchLibraryPage(
    { categoryId: 258, wordCountBucket: 4, creationStatus: 0, pageIndex: 2 },
    async (url) => {
      requested = url;
      return libraryResponse([{ id: "1".repeat(19) }, { id: "not-a-id" }], true, 2104);
    }
  );

  const query = new URL(requested).searchParams;
  assert.equal(query.get("category_id"), "258");
  assert.equal(query.get("word_count"), "4");
  assert.equal(query.get("creation_status"), "0");
  assert.equal(query.get("page_index"), "2");
  assert.equal(query.get("page_count"), "100", "one request should pull 100 books");
  assert.equal(page.books.length, 1, "malformed ids are dropped");
  assert.equal(page.totalCount, 2104);
  assert.equal(page.hasMore, true);
});

test("surfaces a non-zero library API code as an error", async () => {
  await assert.rejects(
    () => fetchLibraryPage({ categoryId: -1, wordCountBucket: 4, creationStatus: -1, pageIndex: 0 },
      async () => ({ code: 8, message: "blocked" })),
    /code 8/
  );
});

test("discovers long novels from the library filter in one request per genre", async () => {
  const requests = [];
  const candidates = await discoverFromLibrary(
    { categories: ["fantasy"], wordCountBucket: 4, creationStatus: -1 },
    { fantasy: { label: "Huyền huyễn", categoryIds: [258, 257] } },
    async (url) => {
      requests.push(url);
      const categoryId = new URL(url).searchParams.get("category_id");
      return libraryResponse([{ id: `${categoryId}`.padEnd(19, "7") }], false, 2104);
    }
  );

  assert.equal(requests.length, 2, "one request per category id, no per-book probes");
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].genre, "Huyền huyễn");
  assert.equal(candidates[0].chapterCountIsFloor, true);
  assert.equal(candidates[0].listedChapterCount, bucketChapterFloor(4));
});

test("accepts word-count pre-filtered books even when the floor is under the minimum", async () => {
  // Bucket 4 floors at ~909 chapters but real books there run several thousand, so
  // a minimum of 1000 must not discard them; the EPUB check is the real gate.
  const candidates = [
    { sourceId: "1".repeat(19), genre: "Huyền huyễn", listedChapterCount: bucketChapterFloor(4), chapterCountIsFloor: true },
    { sourceId: "2".repeat(19), genre: "Huyền huyễn", listedChapterCount: bucketChapterFloor(4), chapterCountIsFloor: true }
  ];
  let detailRequests = 0;
  const result = await selectNewBookCandidates(candidates, 1000, 1, async () => {
    detailRequests += 1;
    return "";
  });

  assert.equal(detailRequests, 0);
  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].sourceId, "1".repeat(19));
});

test("prefers an exactly-known long novel over a merely pre-filtered one", async () => {
  const candidates = [
    { sourceId: "1".repeat(19), listedChapterCount: bucketChapterFloor(4), chapterCountIsFloor: true },
    { sourceId: "2".repeat(19), listedChapterCount: 3200 }
  ];
  const result = await selectNewBookCandidates(candidates, 1000, 1, async () => "");
  assert.equal(result.selected[0].sourceId, "2".repeat(19));
  assert.equal(result.bestChapterCount, 3200);
});

test("reads chapter counts straight out of the rank page payload", () => {
  const html = rankPage([
    { id: "6883748331202284558", name: "A", words: 9119940, lastChapter: "第4244章 abc" },
    { id: "7143134984532921382", name: "B", words: 3283566, lastChapter: "第1612回 def" },
    { id: "7064405896540982309", name: "C", words: 440000, lastChapter: "Ngoại truyện" },
    { id: "7180279419959774247", name: "D", words: 0, lastChapter: "" }
  ]);

  const books = parseRankBooks(html);
  assert.equal(books.length, 4);
  assert.equal(books[0].listedChapterCount, 4244, "numbered 章 title");
  assert.equal(books[1].listedChapterCount, 1612, "numbered 回 title");
  assert.equal(books[2].listedChapterCount, 200, "falls back to wordNumber / 2200");
  assert.equal(books[3].listedChapterCount, null, "no title number and no word count");
  assert.equal(books[0].title, "A");
});

test("estimates chapter counts from either the title number or the word count", () => {
  assert.equal(estimateChapterCount({ lastChapterTitle: "第 987 章 x", wordNumber: 1 }), 987);
  assert.equal(estimateChapterCount({ lastChapterTitle: "", wordNumber: 2200 }), 1);
  assert.equal(estimateChapterCount({ lastChapterTitle: "", wordNumber: 0 }), null);
  assert.equal(estimateChapterCount({}), null);
});

test("filters by chapter count without touching the rate-limited detail endpoint", async () => {
  const candidates = [
    { sourceId: "1", genre: "Huyền huyễn", listedChapterCount: 320 },
    { sourceId: "2", genre: "Huyền huyễn", listedChapterCount: 4244 },
    { sourceId: "3", genre: "Huyền huyễn", listedChapterCount: 1612 },
    { sourceId: "4", genre: "Huyền huyễn", listedChapterCount: 2900 }
  ];
  let detailRequests = 0;
  const result = await selectNewBookCandidates(candidates, 1000, 2, async () => {
    detailRequests += 1;
    return "";
  });

  assert.equal(detailRequests, 0, "rank metadata must make detail requests unnecessary");
  assert.equal(result.detailProbes, 0);
  assert.equal(result.fromRankMetadata, 4);
  // Longest first, so a run grabs the meatiest novels available.
  assert.deepEqual(result.selected.map((book) => book.sourceId), ["2", "4"]);
  assert.equal(result.bestChapterCount, 4244);
});

test("probes at most a small budget of detail pages for books the rank payload missed", async () => {
  const candidates = Array.from({ length: 50 }, (_, index) => ({ sourceId: String(index + 1), genre: "Tiên hiệp" }));
  let detailRequests = 0;
  const result = await selectNewBookCandidates(candidates, 1000, 1, async () => {
    detailRequests += 1;
    return '{"chapterTotal":120,"followStatus":0}';
  });

  assert.deepEqual(result.selected, []);
  assert.ok(detailRequests <= 12, `detail probes must stay bounded, got ${detailRequests}`);
  assert.equal(result.fromRankMetadata, 0);
  assert.equal(result.bestChapterCount, 120);
});

test("treats an empty HTTP 200 body as throttling rather than a valid page", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, status: 200, text: async () => "" };
  };
  try {
    await assert.rejects(
      () => fetchText("https://fanqienovel.com/page/1234567890123", 2),
      (error) => error.throttled === true && /rỗng/.test(error.message)
    );
    assert.equal(calls, 2, "should retry before giving up");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reads the established-novel boards when a length filter is set", async () => {
  const definitions = { fantasy: { label: "Huyền huyễn", ranks: ["1_1_258"], longRanks: ["1_2_258"] } };
  const load = (collected) => async (url) => {
    collected.push(url);
    return `<a href="/page/${"7".repeat(19)}">book</a>`;
  };

  const longUrls = [];
  await discoverCandidates({ categories: ["fantasy"], wordCountBucket: 4 }, definitions, load(longUrls));
  assert.ok(longUrls.every((url) => url.includes("/rank/1_2_258")), "length filter must use the _2_ board");

  const newUrls = [];
  await discoverCandidates({ categories: ["fantasy"], wordCountBucket: -1 }, definitions, load(newUrls));
  assert.ok(newUrls.every((url) => url.includes("/rank/1_1_258")), "no filter keeps the new-book board");
});

test("every crawler category has an established-novel board", () => {
  const { CATEGORY_DEFINITIONS } = require("./crawler-store");
  for (const [key, definition] of Object.entries(CATEGORY_DEFINITIONS)) {
    assert.ok(definition.longRanks?.length, `${key} thiếu longRanks`);
    assert.equal(definition.longRanks.length, definition.ranks.length, `${key} lệch số bảng xếp hạng`);
    definition.longRanks.forEach((rank) => assert.match(rank, /^\d+_2_\d+$/, `${key} longRanks phải là bảng _2_`));
  }
});

test("resumes the book an interrupted run was downloading", () => {
  // A run that died mid-download leaves state: "error" with the book still set.
  const job = selectResumeJob(
    { state: "error", currentBookId: "7143038691944959011", resumeAttempts: 0 },
    { books: [] }
  );
  assert.equal(job.sourceId, "7143038691944959011");
  assert.equal(job.isResume, true);
  assert.equal(job.attempts, 1, "attempt counter advances across runs");
});

test("gives up resuming a book that never finishes", () => {
  const status = { state: "error", currentBookId: "7143038691944959011" };
  assert.equal(selectResumeJob({ ...status, resumeAttempts: 2 }, { books: [] }).attempts, 3);
  assert.equal(selectResumeJob({ ...status, resumeAttempts: 3 }, { books: [] }), null, "capped at three tries");
});

test("does not resume when the previous run finished cleanly", () => {
  assert.equal(selectResumeJob({ state: "success", currentBookId: "7143038691944959011" }, { books: [] }), null);
  assert.equal(selectResumeJob({ state: "error", currentBookId: "" }, { books: [] }), null);
  assert.equal(selectResumeJob({ state: "error", currentBookId: "not-numeric" }, { books: [] }), null);
  assert.equal(selectResumeJob(undefined, { books: [] }), null);
});

test("treats a resumed book already in the catalog as a refresh", () => {
  const job = selectResumeJob(
    { state: "error", currentBookId: "7143038691944959011", resumeAttempts: 1 },
    { books: [{ source: "fanqie", sourceId: "7143038691944959011", genre: "Tiên hiệp" }] }
  );
  assert.equal(job.isUpdate, true);
  assert.equal(job.genre, "Tiên hiệp");
});

test("refreshes the oldest stale book before discovering a new one", () => {
  const now = Date.parse("2026-08-19T12:00:00Z");
  const jobs = selectWorkItems(
    [{ sourceId: "9999999999999999999", genre: "Tiên hiệp" }],
    [
      { sourceId: "1111111111111111111", genre: "Mạt thế", lastCrawledAt: "2026-08-19T06:00:00Z" },
      { sourceId: "2222222222222222222", genre: "Trinh thám", lastCrawledAt: "2026-08-17T06:00:00Z" }
    ],
    true,
    now
  );
  assert.deepEqual(jobs, [{ sourceId: "2222222222222222222", genre: "Trinh thám", category: "existing", isUpdate: true }]);
});

test("only refreshes a book once its last crawl is a day old", () => {
  const now = Date.parse("2026-08-20T12:00:00Z");
  const fresh = { sourceId: "1111111111111111111", genre: "Tiên hiệp", lastCrawledAt: "2026-08-20T11:55:00Z" };
  const stale = { sourceId: "2222222222222222222", genre: "Tiên hiệp", lastCrawledAt: "2026-08-18T09:00:00Z" };

  // The regression this guards: a book crawled minutes ago must not be picked for
  // refresh. It used to be, because the condition also accepted any book whose
  // metadataVersion was not 2 - a field the catalogue stopped carrying, so it was
  // always true. Every run then re-ingested a book it already had and never went
  // looking for a new one.
  assert.deepEqual(selectWorkItems([], [fresh], true, now), []);

  const picked = selectWorkItems([{ sourceId: "9999999999999999999" }], [stale], true, now);
  assert.equal(picked[0].sourceId, "2222222222222222222");
  assert.equal(picked[0].isUpdate, true);
});

test("a book that was never crawled counts as due", () => {
  const now = Date.parse("2026-08-20T12:00:00Z");
  const picked = selectWorkItems([], [{ sourceId: "3333333333333333333", lastCrawledAt: "" }], true, now);
  assert.equal(picked[0].sourceId, "3333333333333333333");
});

test("with nothing due, discovery candidates are returned instead", () => {
  const now = Date.parse("2026-08-20T12:00:00Z");
  const fresh = { sourceId: "1111111111111111111", lastCrawledAt: "2026-08-20T11:00:00Z" };
  const jobs = selectWorkItems([{ sourceId: "9999999999999999999" }], [fresh], true, now);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].sourceId, "9999999999999999999");
});

test("reads title, author, chapter count, and cover from an EPUB", async () => {
  const zip = new JSZip();
  zip.file("META-INF/container.xml", '<?xml version="1.0"?><container><rootfiles><rootfile full-path="EPUB/package.opf"/></rootfiles></container>');
  zip.file("EPUB/package.opf", `<?xml version="1.0"?>
    <package xmlns:dc="http://purl.org/dc/elements/1.1/">
      <metadata><dc:title>Tên truyện</dc:title><dc:creator>Tác giả</dc:creator><dc:description>Mô tả</dc:description><meta name="cover" content="cover"/></metadata>
      <manifest><item id="cover" href="cover.jpg" media-type="image/jpeg"/><item id="c1" href="1.xhtml" media-type="application/xhtml+xml"/></manifest>
      <spine><itemref idref="c1"/><itemref idref="c1"/></spine>
    </package>`);
  zip.file("EPUB/cover.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const metadata = await readEpubMetadata(await zip.generateAsync({ type: "nodebuffer" }));
  assert.equal(metadata.title, "Tên truyện");
  assert.equal(metadata.author, "Tác giả");
  assert.equal(metadata.description, "Mô tả");
  assert.equal(metadata.chapterCount, 2);
  assert.equal(metadata.cover.contentType, "image/jpeg");
});
