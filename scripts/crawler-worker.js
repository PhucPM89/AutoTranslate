"use strict";

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { upload } = require("@vercel/blob/client");

const SITE_URL = String(process.env.SITE_URL || "https://auto-translate-xi.vercel.app").replace(/\/$/, "");
const CRAWLER_SECRET = process.env.CRAWLER_SECRET || "";
let crawlerAuthToken = CRAWLER_SECRET;
const TOMATO_URL = String(process.env.TOMATO_URL || "http://127.0.0.1:18423").replace(/\/$/, "");
const TOMATO_PASSWORD = process.env.TOMATO_PASSWORD || CRAWLER_SECRET;
const TOMATO_DATA_DIR = path.resolve(process.env.TOMATO_DATA_DIR || ".crawler-data");
const JOB_TIMEOUT_MS = clampNumber(process.env.CRAWLER_JOB_TIMEOUT_MINUTES, 15, 300, 180) * 60 * 1000;
const POLL_INTERVAL_MS = 10 * 1000;

async function main() {
  requireEnvironment();
  crawlerAuthToken = crawlerAuthToken || await requestGitHubOidcToken();
  const control = await siteRequest("/api/crawler/control");
  const { config, categories, catalog } = control;
  if (!config.enabled) {
    await updateStatus({ state: "disabled", message: "Crawler đang tắt trong trang quản trị.", finishedAt: new Date().toISOString() });
    return;
  }

  const startedAt = new Date().toISOString();
  const status = { state: "running", message: "Đang quét bảng xếp hạng Fanqie...", startedAt, finishedAt: "", currentBookId: "", discovered: 0, published: 0, failed: 0 };
  await updateStatus(status);

  try {
    await waitForTomato();
    await configureTomato();
    const candidates = await discoverCandidates(config, categories);
    const existingBooks = (catalog.books || []).filter((book) => book.source === "fanqie" && book.sourceId);
    const existingIds = new Set(existingBooks.map((book) => String(book.sourceId)));
    const newBooks = candidates.filter((item) => !existingIds.has(item.sourceId)).slice(0, config.maxNewBooksPerRun);
    const jobs = selectWorkItems(newBooks, existingBooks, config.updateExisting);
    status.discovered = jobs.filter((item) => !item.isUpdate).length;

    if (!jobs.length) {
      status.state = "success";
      status.message = "Không có truyện mới phù hợp trong bảng xếp hạng.";
      status.finishedAt = new Date().toISOString();
      await updateStatus(status);
      return;
    }

    for (const candidate of jobs) {
      status.currentBookId = candidate.sourceId;
      status.message = `Đang tải Fanqie book ${candidate.sourceId}...`;
      await updateStatus(status);
      try {
        const published = await downloadAndPublish(candidate, status);
        status.published += 1;
        status.message = candidate.isUpdate
          ? `Đã cập nhật ${published.title}.`
          : `Đã thêm ${published.title} vào thư viện.`;
      } catch (error) {
        status.failed += 1;
        status.message = `Book ${candidate.sourceId} thất bại: ${error.message}`;
        console.error(status.message);
      }
      await updateStatus(status);
    }

    status.state = status.published ? "success" : "error";
    status.message = status.published
      ? `Hoàn tất: thêm ${status.published} truyện, lỗi ${status.failed}.`
      : `Không thể thêm truyện; ${status.failed} tác vụ thất bại.`;
    status.currentBookId = "";
    status.finishedAt = new Date().toISOString();
    await updateStatus(status);
    if (!status.published) process.exitCode = 1;
  } catch (error) {
    status.state = "error";
    status.message = error.message;
    status.currentBookId = "";
    status.finishedAt = new Date().toISOString();
    await updateStatus(status).catch(() => {});
    throw error;
  }
}

function selectWorkItems(newBooks, existingBooks, updateExisting, now = Date.now()) {
  if (updateExisting) {
    const refreshBefore = now - 24 * 60 * 60 * 1000;
    const due = existingBooks
      .map((book) => ({ book, crawledAt: new Date(book.lastCrawledAt || 0).getTime() || 0 }))
      .filter((item) => item.book.metadataLanguage !== "vi" || item.crawledAt < refreshBefore)
      .sort((a, b) => a.crawledAt - b.crawledAt)[0]?.book;
    if (due) {
      return [{
        sourceId: String(due.sourceId),
        genre: due.genre || "Fanqie",
        category: "existing",
        isUpdate: true
      }];
    }
  }
  return newBooks;
}

async function discoverCandidates(config, categories) {
  const groups = await Promise.all(config.categories.map(async (key) => {
    const definition = categories[key];
    if (!definition) return [];
    const ids = [];
    for (const rank of definition.ranks || []) {
      const html = await fetchText(`https://fanqienovel.com/rank/${rank}`);
      ids.push(...parseRankBookIds(html));
    }
    return unique(ids).map((sourceId) => ({ sourceId, genre: definition.label, category: key }));
  }));
  return roundRobin(groups);
}

function parseRankBookIds(html) {
  return unique(Array.from(String(html || "").matchAll(/href=["']\/page\/(\d{10,30})["']/g), (match) => match[1]));
}

function roundRobin(groups) {
  const output = [];
  const maxLength = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < maxLength; index += 1) {
    groups.forEach((group) => {
      if (group[index]) output.push(group[index]);
    });
  }
  return output;
}

async function downloadAndPublish(candidate, status) {
  const before = new Map(findFiles(TOMATO_DATA_DIR, ".epub").map((file) => [file, fs.statSync(file).mtimeMs]));
  const startedAt = Date.now();
  const job = await tomatoRequest("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ book_id: candidate.sourceId })
  });
  const completedJob = await waitForJob(job.id, status);
  const epubPath = findProducedEpub(before, startedAt);
  if (!epubPath) throw new Error("Tomato báo hoàn tất nhưng không tìm thấy EPUB.");

  const epubBuffer = fs.readFileSync(epubPath);
  const metadata = await readEpubMetadata(epubBuffer);
  status.message = `Đang dịch thông tin Fanqie book ${candidate.sourceId}...`;
  await updateStatus(status);
  const translatedMetadata = await siteRequest("/api/crawler/control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: metadata.title || completedJob.title || `Fanqie ${candidate.sourceId}`,
      author: metadata.author || completedJob.author || "",
      description: metadata.description || ""
    })
  });
  const title = translatedMetadata.title;
  const epubBlob = await upload(`library/books/fanqie-${candidate.sourceId}.epub`, epubBuffer, {
    access: "public",
    contentType: "application/epub+zip",
    handleUploadUrl: `${SITE_URL}/api/crawler/upload`,
    headers: { Authorization: `Bearer ${crawlerAuthToken}` },
    clientPayload: JSON.stringify({ kind: "epub" }),
    multipart: true
  });

  let coverUrl = "";
  if (metadata.cover?.data) {
    const extension = coverExtension(metadata.cover.contentType);
    const coverBlob = await upload(`library/covers/fanqie-${candidate.sourceId}${extension}`, metadata.cover.data, {
      access: "public",
      contentType: metadata.cover.contentType,
      handleUploadUrl: `${SITE_URL}/api/crawler/upload`,
      headers: { Authorization: `Bearer ${crawlerAuthToken}` },
      clientPayload: JSON.stringify({ kind: "cover" })
    });
    coverUrl = coverBlob.url;
  }

  const result = await siteRequest("/api/crawler/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId: candidate.sourceId,
        title,
        author: translatedMetadata.author,
        genre: candidate.genre,
        status: "Đang cập nhật",
        description: translatedMetadata.description,
        chapterCount: metadata.chapterCount,
        epub: epubBlob.url,
        cover: coverUrl
      })
  });
  return result.book;
}

async function waitForJob(jobId, status) {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let lastStatusUpdate = 0;
  while (Date.now() < deadline) {
    const data = await tomatoRequest(`/api/jobs?id=${encodeURIComponent(jobId)}&all=true`);
    const job = data.items?.[0];
    if (!job) throw new Error("Tomato làm mất trạng thái download job.");
    if (job.book_name_options?.length) await submitTomatoChoice(jobId, "book_name", job.book_name_options[0].value);
    if (job.format_options?.length) {
      const epub = job.format_options.find((option) => String(option.value).toLowerCase() === "epub") || job.format_options[0];
      await submitTomatoChoice(jobId, "format", epub.value);
    }
    if (job.state === "done") return job;
    if (["failed", "canceled"].includes(job.state)) throw new Error(job.message || `Tomato job ${job.state}.`);
    if (Date.now() - lastStatusUpdate > 60 * 1000) {
      const progress = job.progress ? `${job.progress.saved_chapters || 0}/${job.progress.chapter_total || 0} chương` : "đang chuẩn bị";
      status.message = `Đang tải ${job.title || job.book_id}: ${progress}.`;
      await updateStatus(status);
      lastStatusUpdate = Date.now();
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Tomato không hoàn tất sau ${Math.round(JOB_TIMEOUT_MS / 60000)} phút.`);
}

async function submitTomatoChoice(jobId, kind, value) {
  await tomatoRequest(`/api/jobs/${encodeURIComponent(jobId)}/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value })
  });
}

async function configureTomato() {
  const config = await tomatoRequest("/api/config/full");
  Object.assign(config, {
    save_path: "/data/library",
    novel_format: "epub",
    bulk_files: false,
    ask_format_after_download: false,
    preferred_book_name_field: "book_name",
    enable_audiobook: false,
    auto_open: false
  });
  await tomatoRequest("/api/config/full", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config)
  });
}

async function waitForTomato() {
  const deadline = Date.now() + 2 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      await tomatoRequest("/api/status");
      return;
    } catch {
      await sleep(3000);
    }
  }
  throw new Error("Tomato Web API không khởi động sau 2 phút.");
}

async function readEpubMetadata(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const container = await zip.file("META-INF/container.xml")?.async("text");
  const opfPath = container?.match(/full-path=["']([^"']+)["']/i)?.[1];
  if (!opfPath || !zip.file(opfPath)) throw new Error("EPUB không có package document.");
  const opf = await zip.file(opfPath).async("text");
  const manifest = parseManifest(opf);
  const coverId = opf.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const coverItem = manifest.find((item) => item.id === coverId)
    || manifest.find((item) => /(?:^|\s)cover-image(?:\s|$)/.test(item.properties));
  let cover = null;
  if (coverItem) {
    const coverPath = path.posix.normalize(path.posix.join(path.posix.dirname(opfPath), coverItem.href));
    const coverFile = zip.file(coverPath);
    if (coverFile) cover = { data: await coverFile.async("nodebuffer"), contentType: normalizeImageType(coverItem.mediaType, coverItem.href) };
  }
  return {
    title: xmlText(opf, "title"),
    author: xmlText(opf, "creator"),
    description: xmlText(opf, "description"),
    chapterCount: Array.from(opf.matchAll(/<itemref\b/gi)).length,
    cover
  };
}

function parseManifest(opf) {
  return Array.from(opf.matchAll(/<item\b([^>]+)>?/gi), (match) => {
    const attrs = match[1];
    return {
      id: attribute(attrs, "id"),
      href: decodeXml(attribute(attrs, "href")),
      mediaType: attribute(attrs, "media-type"),
      properties: attribute(attrs, "properties")
    };
  });
}

function xmlText(xml, localName) {
  const match = String(xml).match(new RegExp(`<(?:(?:\\w+):)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:\\w+):)?${localName}>`, "i"));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : "";
}

function attribute(attrs, name) {
  return attrs.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] || "";
}

function decodeXml(value) {
  return String(value || "").replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function normalizeImageType(mediaType, href) {
  if (["image/jpeg", "image/png", "image/webp"].includes(mediaType)) return mediaType;
  if (/\.png$/i.test(href)) return "image/png";
  if (/\.webp$/i.test(href)) return "image/webp";
  return "image/jpeg";
}

function coverExtension(contentType) {
  return contentType === "image/png" ? ".png" : contentType === "image/webp" ? ".webp" : ".jpg";
}

function findProducedEpub(before, startedAt) {
  return findFiles(TOMATO_DATA_DIR, ".epub")
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .filter((item) => item.mtime >= startedAt - 5000 || item.mtime > (before.get(item.file) || 0))
    .sort((a, b) => b.mtime - a.mtime)[0]?.file || "";
}

function findFiles(root, extension) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) output.push(fullPath);
    }
  }
  return output;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; TangThuCrawler/1.0)", "Accept-Language": "zh-CN,zh;q=0.9" }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Fanqie trả HTTP ${response.status}.`);
  return response.text();
}

async function siteRequest(pathname, options = {}) {
  return jsonRequest(`${SITE_URL}${pathname}`, {
    ...options,
    headers: { Authorization: `Bearer ${crawlerAuthToken}`, ...(options.headers || {}) }
  });
}

async function tomatoRequest(pathname, options = {}) {
  return jsonRequest(`${TOMATO_URL}${pathname}`, {
    ...options,
    headers: { "x-tomato-password": TOMATO_PASSWORD, ...(options.headers || {}) }
  });
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(60000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `${url} trả HTTP ${response.status}.`);
  return body;
}

async function updateStatus(status) {
  return siteRequest("/api/crawler/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(status) });
}

function requireEnvironment() {
  if (!CRAWLER_SECRET && (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL || !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)) {
    throw new Error("Worker cần GitHub OIDC hoặc CRAWLER_SECRET khi chạy local.");
  }
}

async function requestGitHubOidcToken() {
  const url = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.set("audience", SITE_URL);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
    signal: AbortSignal.timeout(30000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.value) throw new Error("GitHub không cấp được OIDC token cho crawler.");
  return body.value;
}

function unique(values) {
  return Array.from(new Set(values));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { parseRankBookIds, roundRobin, readEpubMetadata, selectWorkItems };
