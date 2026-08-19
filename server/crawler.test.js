"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const JSZip = require("jszip");
const { sanitizeCrawlerConfig, sanitizeCrawlerStatus, isCrawlerRequest } = require("./crawler-store");
const { discoverCandidates, parseRankBookIds, parseFanqieChapterCount, roundRobin, readEpubMetadata, selectWorkItems, selectNewBookCandidates } = require("../scripts/crawler-worker");

test("sanitizes crawler configuration and removes unknown categories", () => {
  assert.deepEqual(sanitizeCrawlerConfig({
    enabled: true,
    categories: ["xianxia", "unknown", "xianxia", "horror"],
    maxNewBooksPerRun: 99,
    minChapterCount: 20000,
    updateExisting: false,
    excludedSourceIds: ["1234567890123", "bad", "1234567890123"]
  }), {
    enabled: true,
    categories: ["xianxia", "horror"],
    maxNewBooksPerRun: 3,
    minChapterCount: 10000,
    updateExisting: false,
    excludedSourceIds: ["1234567890123"]
  });
});

test("authenticates crawler requests with a timing-safe bearer secret", async () => {
  const previous = process.env.CRAWLER_SECRET;
  process.env.CRAWLER_SECRET = "crawler-test-secret";
  try {
    assert.equal(await isCrawlerRequest({ headers: { authorization: "Bearer crawler-test-secret" } }), true);
    assert.equal(await isCrawlerRequest({ headers: { authorization: "Bearer wrong-secret" } }), false);
  } finally {
    if (previous === undefined) delete process.env.CRAWLER_SECRET;
    else process.env.CRAWLER_SECRET = previous;
  }
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
  const selected = await selectNewBookCandidates(candidates, 200, 2, async (url) => {
    const sourceId = url.split("/").pop();
    return `{"chapterTotal":${totals[sourceId]},"followStatus":0}`;
  });
  assert.deepEqual(selected, [
    { sourceId: "2", genre: "Tiên hiệp", listedChapterCount: 220 },
    { sourceId: "3", genre: "Tiên hiệp", listedChapterCount: 450 }
  ]);
});

test("scans past the first few Fanqie candidates when a high chapter minimum is configured", async () => {
  const candidates = Array.from({ length: 25 }, (_, index) => ({ sourceId: String(index + 1), genre: "Huyền huyễn" }));
  const seen = [];
  const selected = await selectNewBookCandidates(candidates, 1000, 1, async (url) => {
    const sourceId = Number(url.split("/").pop());
    seen.push(sourceId);
    return `{"chapterTotal":${sourceId === 18 ? 1200 : 300},"followStatus":0}`;
  });
  assert.equal(selected[0].sourceId, "18");
  assert.equal(seen.length, 18);
});

test("discovers long-novel candidates from deeper category rank pages", async () => {
  const urls = [];
  const candidates = await discoverCandidates(
    { categories: ["fantasy"], minChapterCount: 1000 },
    { fantasy: { label: "Huyền huyễn", ranks: ["rank-a"] } },
    async (url) => {
      urls.push(url);
      const offset = Number(new URL(url).searchParams.get("offset") || 0);
      return `<a href="/page/${"7".repeat(18)}${String(offset / 10).padStart(2, "0")}">book</a>`;
    }
  );

  assert.equal(urls.length, 20);
  assert.equal(urls[0], "https://fanqienovel.com/rank/rank-a");
  assert.equal(urls[19], "https://fanqienovel.com/rank/rank-a?offset=190");
  assert.equal(candidates.length, 20);
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

test("refreshes untranslated crawler metadata immediately", () => {
  const now = Date.parse("2026-08-19T12:00:00Z");
  const jobs = selectWorkItems(
    [{ sourceId: "9999999999999999999", genre: "Tiên hiệp" }],
    [{ sourceId: "1111111111111111111", genre: "Tiên hiệp", metadataVersion: 1, lastCrawledAt: "2026-08-19T11:55:00Z" }],
    true,
    now
  );
  assert.equal(jobs[0].sourceId, "1111111111111111111");
  assert.equal(jobs[0].isUpdate, true);
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
