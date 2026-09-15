"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
let iconv;
try { iconv = require("iconv-lite"); } catch { iconv = null; }
const JSZip = require("jszip");

function bookId(input) {
  const value = String(input || "").trim();
  if (/^(?:qidian-)?\d{1,20}$/.test(value)) return value.replace(/^qidian-/, "");
  let url;
  try { url = new URL(value); } catch { throw new Error("Qidian cần ID hoặc URL sách hợp lệ."); }
  const match = url.pathname.match(/^\/(?:book|info)\/(\d{1,20})\/?$/);
  if (url.protocol !== "https:" || !["www.qidian.com", "book.qidian.com"].includes(url.hostname) || !match || url.port || url.username || url.password) {
    throw new Error("URL sách phải thuộc www.qidian.com/book/ hoặc book.qidian.com/info/.");
  }
  return match[1];
}

function decode(value) {
  return String(value).replace(/&#(x[\da-f]+|\d+);/gi, (all, n) => {
    const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
  }).replace(/&(lt|gt|quot|apos|nbsp|amp);/g, (_, name) => ({ lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", amp: "&" })[name]);
}

function plain(value) {
  return decode(String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, "")).trim();
}

function xml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
}

function gbkEncodeUriComponent(str) {
  if (iconv) {
    const buf = iconv.encode(String(str || ""), "gbk");
    return Array.from(buf).map(b => "%" + b.toString(16).toUpperCase().padStart(2, "0")).join("");
  }
  return encodeURIComponent(str || "");
}

function parseMetadata(html) {
  const metadata = {};
  for (const tag of html.matchAll(/<meta\b([^>]+)>/gi)) {
    const attrs = {};
    for (const m of tag[1].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)) attrs[m[1].toLowerCase()] = decode(m[3]);
    metadata[attrs.property || attrs.name] = attrs.content;
  }
  const title = metadata["og:novel:book_name"] || metadata["og:title"];
  if (!title) throw new Error("Không đọc được metadata Qidian; trang có thể yêu cầu xác minh hoặc đã đổi cấu trúc.");
  return { title, author: metadata["og:novel:author"] || "", description: metadata["og:description"] || metadata.description || "" };
}

function parseMobileMetadata(html) {
  const title = html.match(/"bookName":"([^"]+)"/)?.[1] ||
                html.match(/<meta\s+name="keywords"\s+content="([^",]+)/i)?.[1] ||
                html.match(/<title>([^<]+)<\/title>/i)?.[1];
  if (!title) throw new Error("Không đọc được metadata từ m.qidian.com.");
  const author = html.match(/"authorName":"([^"]+)"/)?.[1] || html.match(/"author":"([^"]+)"/)?.[1] || "";
  const desc = html.match(/"desc":"([^"]+)"/)?.[1] || html.match(/"description":"([^"]+)"/)?.[1] || "";
  return {
    title: decode(title).replace(/_.*$/, "").trim(),
    author: decode(author).trim(),
    description: decode(desc.replace(/\\u003cbr\s*\/?>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")).trim()
  };
}

function parseCatalog(payload, id) {
  if (payload.code !== 0 || !Array.isArray(payload.data?.vs)) throw new Error("Qidian không trả mục lục hợp lệ hoặc đã đổi cấu trúc API.");
  const seen = new Set();
  const chapters = [];
  for (const volume of payload.data.vs) {
    if (!Array.isArray(volume.cs)) throw new Error("Volume Qidian thiếu danh sách chương.");
    for (const chapter of volume.cs) {
      const cid = String(chapter.id || "");
      if (!/^\d+$/.test(cid) || !chapter.cN) throw new Error("Thông tin chương Qidian không hợp lệ.");
      if (seen.has(cid)) continue;
      seen.add(cid);
      const publicChapter = chapter.sS === 0 || chapter.sS === "0";
      chapters.push({ id: cid, title: String(chapter.cN), public: publicChapter, url: `https://www.qidian.com/chapter/${id}/${cid}/` });
    }
  }
  if (!chapters.length) throw new Error("Mục lục Qidian rỗng.");
  return chapters;
}

function parseChapter(html) {
  if (/class=["'][^"']*(?:subscribe|vip-limit|pay-wall)|请先登录|订阅本章|安全验证|验证码/i.test(html)) {
    throw new Error("Chương Qidian yêu cầu đăng nhập, đăng ký hoặc xác minh.");
  }
  const body = html.match(/<div\b[^>]*class=["'][^"']*\bread-content\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
  if (!body) throw new Error("Không thấy nội dung chương Qidian; không lưu trang lỗi thành chương.");
  const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m => plain(m[1].replace(/<br\s*\/?\s*>/gi, "\n"))).filter(Boolean);
  const text = paragraphs.join("\n\n");
  if (!text || /[\uE000-\uF8FF]/u.test(text)) throw new Error("Nội dung Qidian rỗng hoặc sử dụng font mã hóa không được hỗ trợ.");
  return text;
}

function createClient({ fetchImpl = fetch, spacingMs = 1500, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let lastRequest = 0;
  let csrf = "";
  return async function request(url, json = false) {
    const parsed = new URL(url);
    if (parsed.origin !== "https://www.qidian.com" && parsed.origin !== "https://m.qidian.com") {
      throw new Error("Chỉ chấp nhận nguồn Qidian HTTPS.");
    }
    if (parsed.searchParams.has("_csrfToken")) parsed.searchParams.set("_csrfToken", csrf);
    await sleep(Math.max(0, lastRequest + spacingMs - Date.now()));
    lastRequest = Date.now();
    const response = await fetchImpl(parsed.href, {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: json ? "application/json" : "text/html",
        ...(csrf ? { Cookie: `_csrfToken=${csrf}` } : {})
      }
    });
    if (response.status !== 200) throw new Error(`Qidian HTTP ${response.status}: dừng tải; có thể cần xác minh hoặc bị giới hạn tốc độ.`);
    const cookie = response.headers.get("set-cookie")?.match(/(?:^|[,;]\s*)_csrfToken=([^;,\s]+)/)?.[1];
    if (cookie) csrf = cookie;
    const text = await response.text();
    if (!json) return text;
    try { return JSON.parse(text); } catch { throw new Error("Qidian trả trang HTML/xác minh thay vì mục lục JSON."); }
  };
}

function createMirrorClient({ fetchImpl = fetch, spacingMs = 300, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let lastRequest = 0;
  return async function requestMirror(url, options = {}) {
    await sleep(Math.max(0, lastRequest + spacingMs - Date.now()));
    lastRequest = Date.now();
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.piaotia.com/",
        ...(options.headers || {})
      },
      ...options
    });
    if (response.status !== 200) throw new Error(`Mirror HTTP ${response.status}: không thể tải trang từ mirror.`);
    const buf = await response.arrayBuffer();
    if (iconv) return iconv.decode(Buffer.from(buf), "gbk");
    return new TextDecoder("gbk").decode(buf);
  };
}

function extractTocUrl(html, baseUrl) {
  const match = html.match(/href="([^"]*\/html\/\d+\/\d+\/(?:index\.html)?)"/i);
  if (match) {
    const raw = match[1].endsWith("/index.html") ? match[1] : match[1].replace(/\/$/, "") + "/index.html";
    return new URL(raw, baseUrl).href;
  }
  const allLink = html.match(/<a[^>]+href="([^"]+)"[^>]*>[^<]*查看全部章节[^<]*<\/a>/i);
  if (allLink) {
    return new URL(allLink[1], baseUrl).href;
  }
  return null;
}

async function searchMirrorBook(title, requestMirror = createMirrorClient()) {
  const gbkQuery = gbkEncodeUriComponent(title);
  const searchUrl = "https://www.piaotia.com/modules/article/search.php";
  const html = await requestMirror(searchUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `searchtype=articlename&searchkey=${gbkQuery}`
  });

  const directToc = extractTocUrl(html, searchUrl);
  if (directToc) return directToc;

  const matches = [...html.matchAll(/<td[^>]*class="odd"[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/td>/gi)].map(m => ({
    url: m[1],
    title: plain(m[2])
  }));

  const exact = matches.find(m => m.title === title) || matches[0];
  if (!exact) throw new Error(`Không tìm thấy truyện "${title}" trên mirror.`);

  const bookInfoUrl = new URL(exact.url, "https://www.piaotia.com/").href;
  const infoHtml = await requestMirror(bookInfoUrl);
  const tocUrl = extractTocUrl(infoHtml, bookInfoUrl);
  if (!tocUrl) throw new Error(`Không thấy mục lục truyện "${title}" trên mirror.`);
  return tocUrl;
}

function parseMirrorCatalog(html, tocUrl) {
  const chapters = [];
  for (const m of html.matchAll(/<li[^>]*>\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/li>/gi)) {
    const href = m[1].trim();
    if (!href || href === "/" || href.includes("index.html") || href.includes("javascript:")) continue;
    chapters.push({ title: plain(m[2]), url: new URL(href, tocUrl).href, public: true });
  }
  if (!chapters.length) throw new Error("Mục lục mirror rỗng.");
  return chapters;
}

function parseMirrorChapter(html) {
  const bottomIdx = html.indexOf('<div class="bottomlink">');
  const beforeBottom = bottomIdx !== -1 ? html.slice(0, bottomIdx) : html;
  const toplinkIdx = beforeBottom.indexOf('<div class="toplink">');
  const afterToplink = toplinkIdx !== -1 ? beforeBottom.slice(toplinkIdx) : beforeBottom;
  const lastTableIdx = afterToplink.lastIndexOf("</table>");
  const rawBody = lastTableIdx !== -1 ? afterToplink.slice(lastTableIdx + 8) : afterToplink;

  const cleaned = rawBody
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&");

  const paragraphs = cleaned
    .split(/<br\s*\/?>/gi)
    .map(p => plain(p))
    .filter(p => {
      if (p.length === 0) return false;
      if (p.startsWith("ps:") || p.startsWith("PS:")) return false;
      if (/翻页上AD|飘天文学|最新章节|最快更新|手机用户请浏览/i.test(p)) return false;
      return true;
    });

  const text = paragraphs.join("\n\n");
  if (!text || /[\uE000-\uF8FF]/u.test(text)) throw new Error("Nội dung mirror rỗng hoặc chứa ký tự không hợp lệ.");
  return text;
}

function normalizeChapterTitle(title) {
  return String(title || "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

function findMirrorChapter(chapter, index, mirrorCatalog) {
  if (!Array.isArray(mirrorCatalog) || !mirrorCatalog.length) return null;

  if (mirrorCatalog[index]) {
    const qNorm = normalizeChapterTitle(chapter?.title);
    const mNorm = normalizeChapterTitle(mirrorCatalog[index].title);
    if (qNorm && mNorm && (qNorm.includes(mNorm) || mNorm.includes(qNorm))) {
      return mirrorCatalog[index];
    }
  }

  const targetTitle = normalizeChapterTitle(chapter?.title);
  if (targetTitle) {
    const found = mirrorCatalog.find(m => {
      const mNorm = normalizeChapterTitle(m.title);
      return mNorm === targetTitle || (mNorm.length >= 4 && targetTitle.includes(mNorm)) || (targetTitle.length >= 4 && mNorm.includes(targetTitle));
    });
    if (found) return found;

    const chNumMatch = String(chapter?.title || "").match(/第([0-9一二三四五六七八九十百千万]+)章/);
    if (chNumMatch) {
      const chNum = chNumMatch[1];
      const foundByNum = mirrorCatalog.find(m => m.title.includes(`第${chNum}章`));
      if (foundByNum) return foundByNum;
    }
  }

  return mirrorCatalog[index] || null;
}

function resolveTarget(input, defaultSource = "qidian") {
  const value = String(input || "").trim();
  if (/^bianhua-\d{1,20}$/i.test(value)) {
    return { source: "bianhua", id: value.replace(/^bianhua-/i, "") };
  }
  if (/^qidian-\d{1,20}$/i.test(value)) {
    return { source: "qidian", id: value.replace(/^qidian-/i, "") };
  }
  if (/https?:\/\/(?:www|m)\.bianhuaxs\.com\//i.test(value)) {
    const match = value.match(/bianhuaxs\.com\/(\d{1,20})(?:\.html)?/i);
    if (match) return { source: "bianhua", id: match[1] };
  }
  if (/https?:\/\/(?:www|book|m)\.qidian\.com\//i.test(value)) {
    const match = value.match(/\/(?:book|info)\/(\d{1,20})\/?/i);
    if (match) return { source: "qidian", id: match[1] };
  }
  if (/^\d{1,20}$/.test(value)) {
    return { source: defaultSource, id: value };
  }
  return { source: defaultSource, id: bookId(input) };
}

function createBianhuaClient({ fetchImpl = fetch, spacingMs = 150, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let lastRequest = 0;
  return async function requestBianhua(url, options = {}) {
    await sleep(Math.max(0, lastRequest + spacingMs - Date.now()));
    lastRequest = Date.now();
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.bianhuaxs.com/",
        ...(options.headers || {})
      },
      ...options
    });
    if (response.status !== 200) throw new Error(`Bianhua HTTP ${response.status}: không thể tải trang.`);
    return await response.text();
  };
}

async function searchBianhuaBook(title, requestBianhua = createBianhuaClient()) {
  const cleanTitle = String(title || "").trim();
  const searchUrl = `https://www.bianhuaxs.com/page/search.html?searchkey=${encodeURIComponent(cleanTitle)}`;
  const html = await requestBianhua(searchUrl);
  const regex = /<a\b[^>]*href=["'](?:https:\/\/www\.bianhuaxs\.com)?\/(\d{3,20})\.html["'][^>]*>([\s\S]*?)<\/a>/gi;
  const candidates = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    const rawText = plain(match[2]);
    if (!rawText || rawText.length < 2) continue;
    const itemUrl = new URL(`/${match[1]}.html`, "https://www.bianhuaxs.com/").href;
    candidates.push({ title: rawText, url: itemUrl });
  }
  if (!candidates.length) return null;
  const normTitle = normalizeChapterTitle(cleanTitle);
  const exact = candidates.find(c => {
    const cNorm = normalizeChapterTitle(c.title);
    return cNorm === normTitle || cNorm.includes(normTitle) || normTitle.includes(cNorm);
  }) || candidates[0];
  return exact ? exact.url : null;
}

function parseBianhuaCatalog(html, bookUrl) {
  const allMatches = [...html.matchAll(/<a\b[^>]*href=["'](\/\d+\/\d+(?:\.html|\/)?|\/\d+\/\d+_\d+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m => ({ href: m[1], title: plain(m[2]) }))
    .filter(m => m.title && !/最新章节|返回首页|目录/i.test(m.title));

  const ch1Idx = allMatches.findIndex(m => /第[1一]章|第0*1章/i.test(m.title));
  const catalogEntries = ch1Idx !== -1 ? allMatches.slice(ch1Idx) : allMatches;

  const seen = new Set();
  const catalog = [];
  for (const item of catalogEntries) {
    if (seen.has(item.href)) continue;
    seen.add(item.href);
    catalog.push({
      title: item.title,
      url: new URL(item.href, bookUrl).href,
      public: true
    });
  }
  return catalog;
}

function parseBianhuaChapter(html) {
  const contentMatch = html.match(/id=["']htmlContent["'][^>]*>([\s\S]*?)<\/div>/i);
  if (!contentMatch) return "";

  const raw = contentMatch[1]
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

  const paragraphs = raw
    .split(/<br\s*\/?>/gi)
    .map(p => plain(p))
    .filter(p => {
      if (!p) return false;
      if (/彼岸花中文文学阅读|本章完|加入书签|上一页|下一页|投票推荐|手机用户请浏览/i.test(p)) return false;
      return true;
    });

  return paragraphs.join("\n\n");
}

async function fetchBianhuaFullChapter(startUrl, requestBianhua = createBianhuaClient()) {
  let currentUrl = startUrl;
  let fullText = "";
  let pageCount = 0;

  while (currentUrl && pageCount < 8) {
    pageCount++;
    const html = await requestBianhua(currentUrl);
    const pText = parseBianhuaChapter(html);
    if (pText) {
      fullText = fullText ? `${fullText}\n\n${pText}` : pText;
    }

    const nextMatches = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map(m => ({ href: m[1], text: plain(m[2]) }))
      .filter(l => l.text.includes("下一页"));

    if (nextMatches.length > 0) {
      const nextHref = nextMatches[0].href;
      if (/\/\d+\.html$/.test(nextHref) || /_\d+\.html$/.test(nextHref) || /\/\d+\/\d+_\d+\/?$/.test(nextHref)) {
        currentUrl = new URL(nextHref, currentUrl).href;
        continue;
      }
    }
    break;
  }
  if (!fullText || /[\uE000-\uF8FF]/u.test(fullText)) {
    throw new Error("Nội dung Bianhua rỗng hoặc chứa ký tự không hợp lệ.");
  }
  return fullText;
}

async function buildEpub(metadata, chapters, id) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  const links = chapters.map((c, i) => `<li><a href="ch${i + 1}.xhtml">${xml(c.title)}</a></li>`).join("");
  zip.file("OEBPS/nav.xhtml", `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol>${links}</ol></nav></body></html>`);
  chapters.forEach((c, i) => zip.file(`OEBPS/ch${i + 1}.xhtml`, `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${xml(c.title)}</title></head><body><h1>${xml(c.title)}</h1>${c.content.split(/\n\n/).map(p => `<p>${xml(p)}</p>`).join("")}</body></html>`));
  const docId = String(id).startsWith("qidian-") || String(id).startsWith("bianhua-") ? id : `qidian-${id}`;
  zip.file("OEBPS/content.opf", `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${xml(docId)}</dc:identifier><dc:title>${xml(metadata.title)}</dc:title><dc:creator>${xml(metadata.author)}</dc:creator><dc:description>${xml(metadata.description)}</dc:description><dc:language>zh-CN</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${chapters.map((_, i) => `<item id="c${i + 1}" href="ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join("")}</manifest><spine>${chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join("")}</spine></package>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

async function crawlQidian(options = {}) {
  const {
    target,
    outputDir = ".crawler-data/qidian",
    maxChapters = 20,
    request = createClient(),
    requestMirror = createMirrorClient(),
    requestBianhua = options.requestBianhua || createBianhuaClient(),
    log = console.log,
    onProgress = null
  } = options;

  if (!Number.isInteger(maxChapters) || maxChapters < 1) throw new Error("maxChapters phải là số nguyên dương.");

  const targetStr = String(target || "").trim();
  const isDirectBianhua = /^bianhua-\d+$/i.test(targetStr) || /https?:\/\/(?:www|m)\.bianhuaxs\.com\//i.test(targetStr) || options.source === "bianhua";

  if (isDirectBianhua) {
    let bianhuaId = targetStr.replace(/^bianhua-/i, "");
    const urlMatch = targetStr.match(/bianhuaxs\.com\/(\d+)(?:\.html)?/i);
    if (urlMatch) bianhuaId = urlMatch[1];
    const sourceId = bianhuaId;
    const sourceUrl = `https://www.bianhuaxs.com/${sourceId}.html`;

    log(`Đang tải metadata từ Bianhuaxs: ${sourceUrl}...`);
    const bookHtml = await requestBianhua(sourceUrl);
    const metadata = parseMetadata(bookHtml);
    const catalog = parseBianhuaCatalog(bookHtml, sourceUrl);
    if (!catalog.length) throw new Error("Mục lục Bianhuaxs rỗng.");

    const selected = catalog.slice(0, maxChapters);
    const chapters = [];
    for (let i = 0; i < selected.length; i++) {
      const chapter = selected[i];
      const content = await fetchBianhuaFullChapter(chapter.url, requestBianhua);
      chapters.push({ ...chapter, content });
      log(`Bianhua ${sourceId}: ${chapters.length}/${selected.length} - ${chapter.title}`);
      if (typeof onProgress === "function") {
        await onProgress({
          chapter: chapters.length,
          total: selected.length,
          title: chapter.title,
          metadata
        });
      }
    }

    const epubBuffer = await buildEpub(metadata, chapters, `bianhua-${sourceId}`);
    const directory = path.resolve(outputDir);
    await fs.mkdir(directory, { recursive: true });
    const epubPath = path.join(directory, `bianhua-${sourceId}-${Date.now()}.epub`);
    await fs.writeFile(epubPath, epubBuffer, { flag: "wx" });

    return {
      epubPath,
      source: "bianhua",
      sourceId,
      sourceUrl,
      ...metadata,
      downloadedChapters: chapters.length,
      catalogChapters: catalog.length,
      partial: chapters.length !== catalog.length
    };
  }

  const id = bookId(target);

  const allowVip = options.allowVip !== undefined
    ? Boolean(options.allowVip)
    : (Boolean(options.requestMirror) || !options.request);

  // 1. Resolve Metadata
  let metadata = null;
  try {
    metadata = parseMetadata(await request(`https://www.qidian.com/book/${id}/`));
  } catch (err) {
    try {
      const mobileHtml = await request(`https://m.qidian.com/book/${id}/`);
      metadata = parseMobileMetadata(mobileHtml);
    } catch (mErr) {
      throw new Error(`Không đọc được metadata Qidian; trang có thể yêu cầu xác minh (${err.message}).`);
    }
  }

  // 2. Resolve Catalog
  let catalog = null;
  try {
    const payload = await request(`https://www.qidian.com/ajax/book/category?_csrfToken=&bookId=${id}`, true);
    catalog = parseCatalog(payload, id);
  } catch (err) {
    log(`Mục lục Qidian API không khả dụng (${err.message}); chuyển sang tìm kiếm mirror.`);
  }

  // 3. Mirror Catalog Provider (Bianhua first, Piaotia second)
  let mirrorProvider = null; // 'bianhua' | 'piaotia'
  let mirrorCatalog = null;

  async function getMirrorCatalog() {
    if (mirrorCatalog) return { catalog: mirrorCatalog, provider: mirrorProvider };

    // If caller specifically provided requestMirror and NOT requestBianhua (e.g. unit tests), prioritize requestMirror!
    if (options.requestMirror && !options.requestBianhua) {
      try {
        log(`Đang tìm kiếm mirror Piaotia cho: "${metadata.title}"...`);
        const tocUrl = await searchMirrorBook(metadata.title, requestMirror);
        const tocHtml = await requestMirror(tocUrl);
        mirrorCatalog = parseMirrorCatalog(tocHtml, tocUrl);
        mirrorProvider = "piaotia";
        log(`Piaotia tìm thấy ${mirrorCatalog.length} chương.`);
        return { catalog: mirrorCatalog, provider: mirrorProvider };
      } catch (pErr) {
        log(`Piaotia không tìm thấy (${pErr.message}).`);
      }
    }

    // 1. Try Bianhua first
    try {
      log(`Đang tìm kiếm mirror Bianhuaxs cho: "${metadata.title}"...`);
      const bianhuaUrl = await searchBianhuaBook(metadata.title, requestBianhua);
      if (bianhuaUrl) {
        const tocHtml = await requestBianhua(bianhuaUrl);
        const bCat = parseBianhuaCatalog(tocHtml, bianhuaUrl);
        if (bCat && bCat.length > 0) {
          mirrorProvider = "bianhua";
          mirrorCatalog = bCat;
          log(`Bianhuaxs tìm thấy ${mirrorCatalog.length} chương.`);
          return { catalog: mirrorCatalog, provider: mirrorProvider };
        }
      }
    } catch (bErr) {
      log(`Tìm Bianhuaxs không thành công (${bErr.message}), thử Piaotia...`);
    }

    // 2. Fallback to Piaotia
    try {
      log(`Đang tìm kiếm mirror Piaotia cho: "${metadata.title}"...`);
      const tocUrl = await searchMirrorBook(metadata.title, requestMirror);
      const tocHtml = await requestMirror(tocUrl);
      mirrorCatalog = parseMirrorCatalog(tocHtml, tocUrl);
      mirrorProvider = "piaotia";
      log(`Piaotia tìm thấy ${mirrorCatalog.length} chương.`);
      return { catalog: mirrorCatalog, provider: mirrorProvider };
    } catch (pErr) {
      log(`Piaotia cũng không tìm thấy (${pErr.message}).`);
    }

    return { catalog: [], provider: null };
  }

  let selected = [];
  if (catalog && catalog.length > 0) {
    if (!allowVip) {
      const stop = catalog.findIndex(c => !c.public);
      selected = catalog.slice(0, stop < 0 ? catalog.length : stop).slice(0, maxChapters);
      if (!selected.length) throw new Error("Không có chương công khai ở đầu mục lục.");
    } else {
      selected = catalog.slice(0, maxChapters);
    }
  } else {
    const { catalog: mCat } = await getMirrorCatalog();
    selected = mCat.slice(0, maxChapters);
  }

  // 4. Download Chapters
  const chapters = [];
  for (let i = 0; i < selected.length; i++) {
    const chapter = selected[i];
    let content = null;

    if (chapter.public && chapter.url && chapter.url.includes("qidian.com")) {
      try {
        content = parseChapter(await request(chapter.url));
      } catch (err) {
        if (!allowVip) throw err;
        log(`Tải chương ${i + 1} từ Qidian lỗi (${err.message}), thử qua mirror...`);
      }
    }

    if (!content) {
      if (!allowVip) throw new Error(`Chương ${chapter.title || i + 1} là VIP và allowVip=false.`);
      const { catalog: mCat, provider } = await getMirrorCatalog();
      const mirrorCh = findMirrorChapter(chapter, i, mCat);
      if (!mirrorCh) throw new Error(`Không tìm thấy chương "${chapter.title || i + 1}" trên mirror.`);
      if (provider === "bianhua") {
        content = await fetchBianhuaFullChapter(mirrorCh.url, requestBianhua);
      } else {
        const chHtml = await requestMirror(mirrorCh.url);
        content = parseMirrorChapter(chHtml);
      }
    }

    chapters.push({ ...chapter, content });
    log(`Qidian ${id}: ${chapters.length}/${selected.length} - ${chapter.title}`);
    if (typeof onProgress === "function") {
      try {
        await onProgress({
          chapter: chapters.length,
          total: selected.length,
          title: chapter.title,
          metadata
        });
      } catch {}
    }
  }

  const totalCatalogChapters = catalog ? catalog.length : (mirrorCatalog ? mirrorCatalog.length : chapters.length);
  const epubBuffer = await buildEpub(metadata, chapters, id);
  const directory = path.resolve(outputDir);
  await fs.mkdir(directory, { recursive: true });
  const epubPath = path.join(directory, `qidian-${id}-${Date.now()}.epub`);
  await fs.writeFile(epubPath, epubBuffer, { flag: "wx" });

  return {
    epubPath,
    source: "qidian",
    sourceId: id,
    sourceUrl: `https://www.qidian.com/book/${id}/`,
    ...metadata,
    downloadedChapters: chapters.length,
    catalogChapters: totalCatalogChapters,
    partial: chapters.length !== totalCatalogChapters
  };
}

async function main(env = process.env) {
  const result = await crawlQidian({
    target: env.TARGET_BOOK_ID || env.TARGET_SOURCE_ID,
    outputDir: env.QIDIAN_OUTPUT_DIR,
    maxChapters: Number(env.QIDIAN_MAX_CHAPTERS || 20),
    allowVip: env.QIDIAN_ALLOW_VIP !== "false"
  });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = {
  bookId,
  resolveTarget,
  parseMetadata,
  parseMobileMetadata,
  parseCatalog,
  parseChapter,
  createClient,
  createMirrorClient,
  searchMirrorBook,
  parseMirrorCatalog,
  parseMirrorChapter,
  findMirrorChapter,
  createBianhuaClient,
  searchBianhuaBook,
  parseBianhuaCatalog,
  parseBianhuaChapter,
  fetchBianhuaFullChapter,
  buildEpub,
  crawlQidian,
  main
};
