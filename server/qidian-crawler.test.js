"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  bookId,
  resolveTarget,
  parseCatalog,
  parseChapter,
  parseMobileMetadata,
  parseMirrorCatalog,
  parseMirrorChapter,
  findMirrorChapter,
  parseBianhuaCatalog,
  parseBianhuaChapter,
  fetchBianhuaFullChapter,
  searchBianhuaBook,
  createClient,
  crawlQidian
} = require("../scripts/qidian-crawler");
const { readEpub, extractChapters } = require("./ingest/epub");

test("Qidian target normalization rejects foreign hosts and malformed IDs", () => {
  for (const input of ["123", "qidian-123", "https://www.qidian.com/book/123/", "https://book.qidian.com/info/123/"]) assert.equal(bookId(input), "123");
  for (const input of ["", "fanqie-123", "https://www.qidian.com.evil.test/book/123/", "http://www.qidian.com/book/123/", "https://user@www.qidian.com/book/123/"]) assert.throws(() => bookId(input));
});

test("catalog preserves order, deduplicates, and fails closed on unknown access", () => {
  const entries = parseCatalog({ code: 0, data: { vs: [{ cs: [{ id: 1, cN: "一", sS: 0 }, { id: 2, cN: "二", sS: 1 }, { id: 3, cN: "三" }, { id: 4, cN: "四", sS: null }, { id: 1, cN: "一", sS: 0 }] }] } }, "123");
  assert.deepEqual(entries.map(c => c.public), [true, false, false, false]);
  assert.throws(() => parseCatalog({ code: 1 }, "123"));
});

test("chapter parser excludes UI and rejects locked, empty and encoded content", () => {
  assert.equal(parseChapter('<div>导航</div><div class="read-content j_readContent"><p>甲&amp;乙</p><p>你好</p></div><footer>广告</footer>'), "甲&乙\n\n你好");
  for (const html of ['<div>验证码</div>', '<div class="read-content"><p>订阅本章</p></div>', '<div class="read-content"></div>', '<div class="read-content"><p>\uE123</p></div>']) assert.throws(() => parseChapter(html));
});

test("HTTP challenges and malformed JSON fail without retries", async () => {
  let calls = 0;
  const request = createClient({ sleep: async () => {}, fetchImpl: async () => { calls++; return new Response("challenge", { status: 202 }); } });
  await assert.rejects(request("https://www.qidian.com/book/123/"), /HTTP 202/);
  assert.equal(calls, 1);
  await assert.rejects(request("https://example.com/"), /HTTPS/);
  assert.equal(calls, 1);
  const malformed = createClient({ sleep: async () => {}, fetchImpl: async () => new Response("<html>challenge</html>") });
  await assert.rejects(malformed("https://www.qidian.com/ajax/book/category", true), /JSON/);
});

test("catalog requests carry the anonymous CSRF cookie from the book page", async () => {
  const calls = [];
  const request = createClient({ sleep: async () => {}, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response("{}", { headers: { "set-cookie": "_csrfToken=test-token; Path=/; Secure" } });
  } });
  await request("https://www.qidian.com/book/123/");
  await request("https://www.qidian.com/ajax/book/category?_csrfToken=&bookId=123", true);
  assert.match(calls[1].url, /_csrfToken=test-token/);
  assert.equal(calls[1].options.headers.Cookie, "_csrfToken=test-token");
});

test("parseMobileMetadata extracts metadata from mobile Qidian HTML", () => {
  const html = '<script>var data = {"bookName":"宿命之环","authorName":"爱潜水的乌贼","desc":"诡秘世界第二部。\\u003cbr>1368之年"};</script>';
  const meta = parseMobileMetadata(html);
  assert.equal(meta.title, "宿命之环");
  assert.equal(meta.author, "爱潜水的乌贼");
  assert.match(meta.description, /诡秘世界第二部/);
});

test("parseMirrorCatalog and parseMirrorChapter extract clean chapter text", () => {
  const tocHtml = `
    <ul class="nav"><li><a href="/index.html">首页</a></li></ul>
    <div class="centent">
      <ul>
        <li><a href="101.html">第一章 序幕</a></li>
        <li><a href="102.html">第二章 迷雾</a></li>
      </ul>
    </div>
  `;
  const catalog = parseMirrorCatalog(tocHtml, "https://www.piaotia.com/html/1/100/index.html");
  assert.equal(catalog.length, 2);
  assert.equal(catalog[0].title, "第一章 序幕");
  assert.equal(catalog[0].url, "https://www.piaotia.com/html/1/100/101.html");

  const chapterHtml = `
    <div class="toplink"></div>
    <table width="100%"><tr><td></td></tr></table>
    <p>广告行</p>
    最快更新最新章节！<br /><br />
    清晨的雾气弥漫在街道上。<br /><br />
    马车缓缓行驶过来。<br />
    <div class="bottomlink"></div>
  `;
  const content = parseMirrorChapter(chapterHtml);
  assert.equal(content, "清晨的雾气弥漫在街道上。\n\n马车缓缓行驶过来。");
});

test("findMirrorChapter matches by title, chapter number, and fallback index", () => {
  const mirrorCatalog = [
    { title: "第一章 序幕", url: "https://example.com/1" },
    { title: "第二章 迷雾（求推荐）", url: "https://example.com/2" },
    { title: "第三章 惊变", url: "https://example.com/3" }
  ];
  const match1 = findMirrorChapter({ title: "第一章 序幕" }, 0, mirrorCatalog);
  assert.equal(match1.title, "第一章 序幕");

  const match2 = findMirrorChapter({ title: "第二章 迷雾" }, 1, mirrorCatalog);
  assert.equal(match2.url, "https://example.com/2");

  const match3 = findMirrorChapter({ title: "第三章 惊变" }, 0, mirrorCatalog);
  assert.equal(match3.title, "第三章 惊变");
});

test("mocked crawl produces an ingest-readable EPUB and never requests VIP chapters when allowVip is false", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "qidian-test-"));
  try {
    const urls = [];
    const result = await crawlQidian({ target: "123", outputDir, log: () => {}, allowVip: false, request: async url => {
      urls.push(url);
      if (url.includes("/book/123/")) return '<meta content="测试 &amp; 书" property="og:novel:book_name"><meta property="og:novel:author" content="作者">';
      if (url.includes("/ajax/")) return { code: 0, data: { vs: [{ cs: [{ id: 11, cN: "第一章 开始", sS: 0 }, { id: 12, cN: "第二章", sS: 1 }, { id: 13, cN: "第三章", sS: 0 }] }] } };
      if (url.endsWith("/11/")) return '<div class="read-content"><p>这是测试内容。</p></div>';
      throw new Error("Unexpected request");
    } });
    assert.equal(result.partial, true);
    assert.equal(result.downloadedChapters, 1);
    assert.equal(urls.length, 3);
    const epub = await readEpub(await fs.readFile(result.epubPath));
    assert.equal(epub.metadata.title, "测试 & 书");
    const chapters = [];
    for await (const chapter of extractChapters(epub)) chapters.push(chapter);
    assert.equal(chapters.length, 1);
    assert.equal(chapters[0].title, "第一章 开始");
    assert.match(chapters[0].content, /这是测试内容/);
  } finally {
    for (const file of await fs.readdir(outputDir)) await fs.unlink(path.join(outputDir, file));
    await fs.rmdir(outputDir);
  }
});

test("mocked crawl fetches VIP chapters from mirror provider when allowVip is true", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "qidian-vip-test-"));
  try {
    const qidianUrls = [];
    const mirrorUrls = [];

    const request = async url => {
      qidianUrls.push(url);
      if (url.includes("/book/123/")) return '<meta content="万族之劫" property="og:novel:book_name"><meta property="og:novel:author" content="老鹰吃小鸡">';
      if (url.includes("/ajax/")) {
        return {
          code: 0,
          data: {
            vs: [{
              cs: [
                { id: 101, cN: "第1章 模拟考试", sS: 0 },
                { id: 102, cN: "第2章 梦境之变", sS: 1 }
              ]
            }]
          }
        };
      }
      if (url.endsWith("/101/")) return '<div class="read-content"><p>第一章免费内容。</p></div>';
      throw new Error("Unexpected Qidian request: " + url);
    };

    const requestMirror = async url => {
      mirrorUrls.push(url);
      if (url.includes("search.php")) {
        return '<td class="odd"><a href="https://www.piaotia.com/bookinfo/10/10811.html">万族之劫</a></td>';
      }
      if (url.includes("/bookinfo/10/10811.html")) {
        return '<a href="https://www.piaotia.com/html/10/10811/index.html">查看全部章节</a>';
      }
      if (url.includes("/html/10/10811/index.html")) {
        return `
          <li><a href="1.html">第1章 模拟考试</a></li>
          <li><a href="2.html">第2章 梦境之变</a></li>
        `;
      }
      if (url.includes("2.html")) {
        return `
          <div class="toplink"></div>
          <table><tr><td></td></tr></table>
          第二章VIP精彩内容。<br /><br />苏宇深吸了一口气。<br />
          <div class="bottomlink"></div>
        `;
      }
      throw new Error("Unexpected mirror URL: " + url);
    };

    const result = await crawlQidian({
      target: "123",
      outputDir,
      maxChapters: 2,
      allowVip: true,
      request,
      requestMirror,
      log: () => {}
    });

    assert.equal(result.downloadedChapters, 2);
    assert.equal(result.catalogChapters, 2);
    assert.equal(result.partial, false);

    const epub = await readEpub(await fs.readFile(result.epubPath));
    assert.equal(epub.metadata.title, "万族之劫");
    assert.equal(epub.metadata.author, "老鹰吃小鸡");

    const chapters = [];
    for await (const chapter of extractChapters(epub)) chapters.push(chapter);
    assert.equal(chapters.length, 2);
    assert.equal(chapters[0].title, "第1章 模拟考试");
    assert.match(chapters[0].content, /第一章免费内容/);
    assert.equal(chapters[1].title, "第2章 梦境之变");
    assert.match(chapters[1].content, /第二章VIP精彩内容/);
    assert.match(chapters[1].content, /苏宇深吸了一口气/);
  } finally {
    for (const file of await fs.readdir(outputDir)) await fs.unlink(path.join(outputDir, file));
    await fs.rmdir(outputDir);
  }
});

test("resolveTarget parses qidian and bianhua IDs and URLs", () => {
  assert.deepEqual(resolveTarget("bianhua-1252180"), { source: "bianhua", id: "1252180" });
  assert.deepEqual(resolveTarget("https://www.bianhuaxs.com/1252180.html"), { source: "bianhua", id: "1252180" });
  assert.deepEqual(resolveTarget("qidian-1049745989"), { source: "qidian", id: "1049745989" });
  assert.deepEqual(resolveTarget("https://book.qidian.com/info/1049745989/"), { source: "qidian", id: "1049745989" });
  assert.deepEqual(resolveTarget("1049745989"), { source: "qidian", id: "1049745989" });
});

test("parseBianhuaCatalog extracts catalog starting from chapter 1 and deduplicates", () => {
  const html = `
    <div><a href="/1252180/100.html">第158章 监守自盗？</a></div>
    <div><a href="/1252180/1.html">第1章 阴阳借法</a></div>
    <div><a href="/1252180/2.html">第2章 鬼差索命</a></div>
    <div><a href="/1252180/2.html">第2章 鬼差索命</a></div>
  `;
  const catalog = parseBianhuaCatalog(html, "https://www.bianhuaxs.com/1252180.html");
  assert.equal(catalog.length, 2);
  assert.equal(catalog[0].title, "第1章 阴阳借法");
  assert.equal(catalog[0].url, "https://www.bianhuaxs.com/1252180/1.html");
  assert.equal(catalog[1].title, "第2章 鬼差索命");
});

test("fetchBianhuaFullChapter stitches subpages and removes boilerplate ads", async () => {
  const requests = [];
  const mockRequest = async (url) => {
    requests.push(url);
    if (url === "https://www.bianhuaxs.com/1252180/1.html") {
      return `
        <div id="htmlContent">
          天有三奇日月星，通天彻地鬼神惊。<br /><br />
          彼岸花中文文学阅读 最新章节。<br />
          急急如律令！
        </div>
        <a href="/1252180/1_2.html">下一页</a>
      `;
    }
    if (url === "https://www.bianhuaxs.com/1252180/1_2.html") {
      return `
        <div id="htmlContent">
          第二页继续念诀。<br /><br />
          本章完
        </div>
        <a href="/1252180/2.html">下一章</a>
      `;
    }
    throw new Error("Unexpected URL: " + url);
  };

  const text = await fetchBianhuaFullChapter("https://www.bianhuaxs.com/1252180/1.html", mockRequest);
  assert.equal(requests.length, 2);
  assert.match(text, /通天彻地鬼神惊/);
  assert.match(text, /第二页继续念诀/);
  assert.doesNotMatch(text, /彼岸花中文文学阅读/);
  assert.doesNotMatch(text, /本章完/);
});

test("mocked crawl can directly crawl from Bianhuaxs", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "bianhua-test-"));
  try {
    const requestBianhua = async (url) => {
      if (url.includes("/1252180.html")) {
        return `
          <meta property="og:title" content="急急如律令" />
          <meta property="og:novel:author" content="黑山老鬼" />
          <meta property="og:description" content="你们灵异才复苏啊？" />
          <a href="/1252180/1.html">第1章 阴阳借法</a>
        `;
      }
      if (url.includes("/1252180/1.html")) {
        return '<div id="htmlContent"><p>急急如律令正文内容。</p></div>';
      }
      throw new Error("Unexpected URL: " + url);
    };

    const result = await crawlQidian({
      target: "bianhua-1252180",
      outputDir,
      maxChapters: 1,
      requestBianhua,
      log: () => {}
    });

    assert.equal(result.source, "bianhua");
    assert.equal(result.sourceId, "1252180");
    assert.equal(result.title, "急急如律令");
    assert.equal(result.author, "黑山老鬼");
    assert.equal(result.downloadedChapters, 1);

    const epub = await readEpub(await fs.readFile(result.epubPath));
    assert.equal(epub.metadata.title, "急急如律令");
    assert.equal(epub.metadata.author, "黑山老鬼");
    const chapters = [];
    for await (const ch of extractChapters(epub)) chapters.push(ch);
    assert.equal(chapters.length, 1);
    assert.match(chapters[0].content, /急急如律令正文内容/);
  } finally {
    for (const file of await fs.readdir(outputDir)) await fs.unlink(path.join(outputDir, file));
    await fs.rmdir(outputDir);
  }
});

test("mocked crawl fetches VIP chapters from Bianhua mirror for Qidian novel", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "qidian-bianhua-mirror-"));
  try {
    const request = async (url) => {
      if (url.includes("/book/1049745989/")) {
        return '<meta content="急急如律令" property="og:novel:book_name"><meta property="og:novel:author" content="黑山老鬼">';
      }
      if (url.includes("/ajax/")) {
        return {
          code: 0,
          data: {
            vs: [{
              cs: [
                { id: 1, cN: "第1章 阴阳借法", sS: 0 },
                { id: 2, cN: "第2章 鬼差索命", sS: 1 }
              ]
            }]
          }
        };
      }
      if (url.endsWith("/1/")) return '<div class="read-content"><p>第1章免费正文。</p></div>';
      throw new Error("Unexpected Qidian URL: " + url);
    };

    const requestBianhua = async (url) => {
      if (url.includes("search.html")) {
        return '<a href="/1252180.html">急急如律令</a>';
      }
      if (url.includes("/1252180.html")) {
        return `
          <a href="/1252180/1.html">第1章 阴阳借法</a>
          <a href="/1252180/2.html">第2章 鬼差索命</a>
        `;
      }
      if (url.includes("/1252180/2.html")) {
        return '<div id="htmlContent"><p>第2章VIP正文内容，来自彼岸花。</p></div>';
      }
      throw new Error("Unexpected Bianhua URL: " + url);
    };

    const result = await crawlQidian({
      target: "1049745989",
      outputDir,
      maxChapters: 2,
      allowVip: true,
      request,
      requestBianhua,
      log: () => {}
    });

    assert.equal(result.source, "qidian");
    assert.equal(result.sourceId, "1049745989");
    assert.equal(result.downloadedChapters, 2);

    const epub = await readEpub(await fs.readFile(result.epubPath));
    const chapters = [];
    for await (const ch of extractChapters(epub)) chapters.push(ch);
    assert.equal(chapters.length, 2);
    assert.equal(chapters[0].title, "第1章 阴阳借法");
    assert.match(chapters[0].content, /第1章免费正文/);
    assert.equal(chapters[1].title, "第2章 鬼差索命");
    assert.match(chapters[1].content, /第2章VIP正文内容/);
  } finally {
    for (const file of await fs.readdir(outputDir)) await fs.unlink(path.join(outputDir, file));
    await fs.rmdir(outputDir);
  }
});


