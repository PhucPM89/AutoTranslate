"use strict";

const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const iconv = require("iconv-lite");
const JSZip = require("jszip");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, ".crawler-data");
const CACHE_DIR = path.join(ROOT, ".cache", "clone-raw");

function xml(value) {
  return String(value || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
}

function plain(value) {
  return String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(x[\da-f]+|\d+);/gi, (all, n) => {
      const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
    })
    .replace(/&(lt|gt|quot|apos|amp);/g, (_, name) => ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" })[name])
    .trim();
}

async function buildEpub(metadata, chapters, bookId) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
  );

  const links = chapters.map((c, i) => `<li><a href="ch${i + 1}.xhtml">${xml(c.title)}</a></li>`).join("");
  zip.file(
    "OEBPS/nav.xhtml",
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head><body><nav epub:type="toc"><ol>${links}</ol></nav></body></html>`
  );

  chapters.forEach((c, i) => {
    const paragraphs = c.content.split(/\n\n+/).map(p => `<p>${xml(p.trim())}</p>`).join("");
    zip.file(
      `OEBPS/ch${i + 1}.xhtml`,
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${xml(c.title)}</title></head><body><h1>${xml(c.title)}</h1>${paragraphs}</body></html>`
    );
  });

  zip.file(
    "OEBPS/content.opf",
    `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${xml(bookId)}</dc:identifier>
<dc:title>${xml(metadata.title)}</dc:title>
<dc:creator>${xml(metadata.author)}</dc:creator>
<dc:description>${xml(metadata.description)}</dc:description>
<dc:language>zh-CN</dc:language>
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${chapters.map((_, i) => `<item id="c${i + 1}" href="ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join("\n")}
</manifest>
<spine>
${chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join("\n")}
</spine>
</package>`
  );

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// ============================================================================
// 1. CRAWLER: 《黄昏分界》 (Piaotia mirror)
// ============================================================================
async function fetchGbk(url, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://www.piaotia.com/"
        },
        signal: AbortSignal.timeout(30000)
      });
      if (res.status === 429 || res.status === 503) {
        const backoffMs = (i + 1) * 3500;
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      return iconv.decode(Buffer.from(buf), "gbk");
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

function parsePiaotiaChapter(html) {
  const bottomIdx = html.indexOf('<div class="bottomlink">');
  const beforeBottom = bottomIdx !== -1 ? html.slice(0, bottomIdx) : html;
  const toplinkIdx = beforeBottom.indexOf('<div class="toplink">');
  const afterToplink = toplinkIdx !== -1 ? beforeBottom.slice(toplinkIdx) : beforeBottom;
  const lastTableIdx = afterToplink.lastIndexOf("</table>");
  const rawBody = lastTableIdx !== -1 ? afterToplink.slice(lastTableIdx + 8) : afterToplink;

  const cleaned = rawBody
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/gi, "");

  const paragraphs = cleaned
    .split(/<br\s*\/?>/gi)
    .map(p => plain(p))
    .filter(p => {
      if (!p) return false;
      if (p.startsWith("ps:") || p.startsWith("PS:")) return false;
      if (/翻页上AD|飘天文学|最新章节|最快更新|手机用户请浏览/i.test(p)) return false;
      return true;
    });

  return paragraphs.join("\n\n");
}

async function cloneHuanghunFenjie({ maxChapters = Infinity, concurrency = 2 } = {}) {
  console.log("\n==================================================================");
  console.log(" [1/2] BẮT ĐẦU CLONE: 《Ranh Giới Hoàng Hôn》 (《黄昏分界》)");
  console.log("==================================================================");

  const bookCacheDir = path.join(CACHE_DIR, "huanghunfenjie");
  await fs.mkdir(bookCacheDir, { recursive: true });

  const tocUrl = "https://www.piaotia.com/html/15/15620/index.html";
  console.log(` Đang tải mục lục từ: ${tocUrl}...`);
  const tocHtml = await fetchGbk(tocUrl);

  const catalog = [];
  for (const m of tocHtml.matchAll(/<li[^>]*>\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/li>/gi)) {
    const href = m[1].trim();
    if (!href || href === "/" || href.includes("index.html") || href.includes("javascript:")) continue;
    catalog.push({
      title: plain(m[2]),
      url: new URL(href, tocUrl).href
    });
  }

  const totalToDownload = Math.min(catalog.length, maxChapters);
  console.log(` Tìm thấy tổng cộng ${catalog.length} chương. Mục tiêu tải: ${totalToDownload} chương.`);

  const chapters = new Array(totalToDownload);
  let downloadedCount = 0;
  let cachedCount = 0;

  // Batch worker
  const queue = catalog.slice(0, totalToDownload).map((item, idx) => ({ ...item, index: idx }));
  
  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      const cacheFile = path.join(bookCacheDir, `ch_${String(item.index + 1).padStart(4, "0")}.json`);
      
      let content = null;
      if (fsSync.existsSync(cacheFile)) {
        try {
          const cached = JSON.parse(await fs.readFile(cacheFile, "utf8"));
          if (cached.content && cached.content.length > 50) {
            content = cached.content;
            cachedCount++;
          }
        } catch {}
      }

      if (!content) {
        try {
          const chHtml = await fetchGbk(item.url);
          content = parsePiaotiaChapter(chHtml);
          if (!content || content.length < 50) {
            throw new Error("Nội dung chương quá ngắn hoặc rỗng");
          }
          await fs.writeFile(cacheFile, JSON.stringify({ index: item.index, title: item.title, content }), "utf8");
          downloadedCount++;
        } catch (err) {
          console.error(`  [LỖI] Chương ${item.index + 1} (${item.title}): ${err.message}`);
          throw err;
        }
        await new Promise(r => setTimeout(r, 350));
      }

      chapters[item.index] = {
        title: item.title,
        content
      };

      const done = downloadedCount + cachedCount;
      if (done % 20 === 0 || done === totalToDownload) {
        process.stdout.write(`\r  Tiến độ: ${done}/${totalToDownload} chương (Đã tải: ${downloadedCount}, Từ cache: ${cachedCount})...`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  console.log(`\n Hoàn tất tải ${totalToDownload} chương 《黄昏分界》!`);

  const metadata = {
    title: "黄昏分界",
    author: "黑山老鬼",
    description: "黄昏为界，阴阳二分。当邪神的血肉从大地的裂隙里拥挤了出来，当山脉一样的血肉出现在了各个地方。有人恐惧，有人膜拜，有人烧香上供。也有人尝了尝，咦，味道不错？于是，血肉变成了庄稼，人们贪婪的收割，争夺，走鬼问灵拜祖宗。胡麻自恐惧之中转生而来，食太岁，养火炉，历尽艰辛，与遍地的邪祟争命求活，然后……什么？我才是邪祟？"
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  const epubPath = path.join(DATA_DIR, "qidian-1036575193-huanghunfenjie.epub");
  console.log(` Đang đóng gói file EPUB: ${epubPath}...`);
  const epubBuffer = await buildEpub(metadata, chapters, "qidian-1036575193");
  await fs.writeFile(epubPath, epubBuffer);
  console.log(` Đã tạo EPUB thành công: ${(epubBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  return {
    bookId: "qidian-1036575193",
    epubPath,
    totalChapters: chapters.length,
    metadata
  };
}

// ============================================================================
// 2. CRAWLER: 《急急如律令》 (BianhuaXS mirror)
// ============================================================================
async function fetchUtf8(url, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        signal: AbortSignal.timeout(30000)
      });
      if (res.status === 429 || res.status === 503) {
        const backoffMs = (i + 1) * 3500;
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

async function fetchBianhuaFullChapter(startUrl) {
  let currentUrl = startUrl;
  let fullText = "";
  let pageCount = 0;

  while (currentUrl && pageCount < 8) {
    pageCount++;
    const html = await fetchUtf8(currentUrl);
    const contentMatch = html.match(/id=["']htmlContent["'][^>]*>([\s\S]*?)<\/div>/i);
    if (!contentMatch) break;

    const raw = contentMatch[1]
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

    const pText = raw
      .split(/<br\s*\/?>/gi)
      .map(p => plain(p))
      .filter(p => {
        if (!p) return false;
        if (/彼岸花中文文学阅读|本章完|加入书签|上一页|下一页|投票推荐/i.test(p)) return false;
        return true;
      })
      .join("\n\n");

    if (pText) {
      fullText = fullText ? `${fullText}\n\n${pText}` : pText;
    }

    // Check next page in this chapter
    const nextMatches = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map(m => ({ href: m[1], text: m[2].replace(/<[^>]+>/g, "").trim() }))
      .filter(l => l.text.includes("下一页"));

    if (nextMatches.length > 0) {
      const nextHref = nextMatches[0].href;
      // If it ends with _2.html or /2.html, it's the next subpage of this chapter
      if (/\/\d+\.html$/.test(nextHref) || /_\d+\.html$/.test(nextHref)) {
        currentUrl = new URL(nextHref, currentUrl).href;
        await new Promise(r => setTimeout(r, 100));
        continue;
      }
    }
    break;
  }

  return fullText;
}

async function cloneJiJiRuLuLing({ maxChapters = Infinity, concurrency = 4 } = {}) {
  console.log("\n==================================================================");
  console.log(" [2/2] BẮT ĐẦU CLONE: 《Cấp Cấp Như Luật Lệnh》 (《急急如律令》)");
  console.log("==================================================================");

  const bookCacheDir = path.join(CACHE_DIR, "jijirululing");
  await fs.mkdir(bookCacheDir, { recursive: true });

  const bookUrl = "https://www.bianhuaxs.com/1252180.html";
  console.log(` Đang tải mục lục từ: ${bookUrl}...`);
  const bookHtml = await fetchUtf8(bookUrl);

  const allMatches = [...bookHtml.matchAll(/<a\b[^>]*href=["'](\/1252180\/\d+\/?)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m => ({ href: m[1], title: m[2].replace(/<[^>]+>/g, "").trim() }));

  // Filter and sort catalog
  // Notice: The page has the latest chapters on top, and then the catalog from Ch 1 upwards.
  // We can find where Chapter 1 starts!
  const ch1Idx = allMatches.findIndex(m => m.title.includes("第1章") || m.title.includes("第一章"));
  let catalogEntries = [];
  if (ch1Idx !== -1) {
    catalogEntries = allMatches.slice(ch1Idx);
  } else {
    catalogEntries = allMatches;
  }

  // Deduplicate by href preserving order
  const seen = new Set();
  const catalog = [];
  for (const item of catalogEntries) {
    if (seen.has(item.href)) continue;
    seen.add(item.href);
    catalog.push({
      title: item.title,
      url: new URL(item.href, bookUrl).href
    });
  }

  const totalToDownload = Math.min(catalog.length, maxChapters);
  console.log(` Tìm thấy tổng cộng ${catalog.length} chương. Mục tiêu tải: ${totalToDownload} chương.`);

  const chapters = new Array(totalToDownload);
  let downloadedCount = 0;
  let cachedCount = 0;

  const queue = catalog.slice(0, totalToDownload).map((item, idx) => ({ ...item, index: idx }));

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      const cacheFile = path.join(bookCacheDir, `ch_${String(item.index + 1).padStart(4, "0")}.json`);

      let content = null;
      if (fsSync.existsSync(cacheFile)) {
        try {
          const cached = JSON.parse(await fs.readFile(cacheFile, "utf8"));
          if (cached.content && cached.content.length > 50) {
            content = cached.content;
            cachedCount++;
          }
        } catch {}
      }

      if (!content) {
        try {
          content = await fetchBianhuaFullChapter(item.url);
          if (!content || content.length < 50) {
            throw new Error("Nội dung chương rỗng hoặc không tải đủ trang");
          }
          await fs.writeFile(cacheFile, JSON.stringify({ index: item.index, title: item.title, content }), "utf8");
          downloadedCount++;
        } catch (err) {
          console.error(`  [LỖI] Chương ${item.index + 1} (${item.title}): ${err.message}`);
          throw err;
        }
        await new Promise(r => setTimeout(r, 150));
      }

      chapters[item.index] = {
        title: item.title,
        content
      };

      const done = downloadedCount + cachedCount;
      if (done % 10 === 0 || done === totalToDownload) {
        process.stdout.write(`\r  Tiến độ: ${done}/${totalToDownload} chương (Đã tải: ${downloadedCount}, Từ cache: ${cachedCount})...`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  console.log(`\n Hoàn tất tải ${totalToDownload} chương 《急急如律令》!`);

  const metadata = {
    title: "急急如律令",
    author: "黑山老鬼",
    description: "二月廿三，辛未年，壬辰月，丁未日，诸事不宜。你们灵异才复苏啊？我都被鬼缠了两年多了！另外，你说这世界上最凶的法，是我造的？"
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  const epubPath = path.join(DATA_DIR, "qidian-1049745989-jijirululing.epub");
  console.log(` Đang đóng gói file EPUB: ${epubPath}...`);
  const epubBuffer = await buildEpub(metadata, chapters, "qidian-1049745989");
  await fs.writeFile(epubPath, epubBuffer);
  console.log(` Đã tạo EPUB thành công: ${(epubBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  return {
    bookId: "qidian-1049745989",
    epubPath,
    totalChapters: chapters.length,
    metadata
  };
}

async function main() {
  console.log("=== BẮT ĐẦU CLONE 2 BỘ TRUYỆN CỦA HẮC SƠN LÃO QUỶ ===");
  const t0 = Date.now();

  const res1 = await cloneHuanghunFenjie();
  const res2 = await cloneJiJiRuLuLing();

  console.log("\n==================================================================");
  console.log(` HOÀN THÀNH TẤT CẢ TRONG ${((Date.now() - t0) / 1000).toFixed(1)}s!`);
  console.log(` 1. 《Ranh Giới Hoàng Hôn》: ${res1.totalChapters} chương -> ${res1.epubPath}`);
  console.log(` 2. 《Cấp Cấp Như Luật Lệnh》: ${res2.totalChapters} chương -> ${res2.epubPath}`);
  console.log("==================================================================");
}

if (require.main === module) {
  main().catch(err => {
    console.error("\n[THẤT BẠI]:", err.message);
    process.exit(1);
  });
}

module.exports = {
  cloneHuanghunFenjie,
  cloneJiJiRuLuLing
};
