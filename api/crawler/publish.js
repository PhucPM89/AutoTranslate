"use strict";

const { del, head } = require("@vercel/blob");
const { isCrawlerRequest } = require("../../server/crawler-store");
const { readCatalog, writeCatalog } = require("../../server/library-catalog");
const { readJsonBody, methodNotAllowed, noStore } = require("../../server/http");

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  if (!isCrawlerRequest(req)) return res.status(401).json({ error: "Crawler token không hợp lệ." });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: "Vercel Blob chưa được kết nối." });

  try {
    const raw = await readJsonBody(req, 32 * 1024);
    const book = sanitizeCrawlerBook(raw);
    await Promise.all([
      validateBlob(book.epub, "library/books/", ["application/epub+zip", "application/octet-stream"]),
      book.cover ? validateBlob(book.cover, "library/covers/", ["image/jpeg", "image/png", "image/webp"]) : null
    ]);

    const catalog = await readCatalog();
    const existingIndex = catalog.books.findIndex((item) => item.source === "fanqie" && item.sourceId === book.sourceId);
    const existingBook = existingIndex >= 0 ? catalog.books[existingIndex] : null;
    if (existingIndex >= 0) catalog.books[existingIndex] = { ...existingBook, ...book };
    else catalog.books.unshift(book);
    catalog.books = catalog.books.slice(0, 500);
    const savedCatalog = await writeCatalog(catalog);
    await cleanupReplacedFiles(existingBook, book);
    return res.status(200).json({ book, catalog: savedCatalog });
  } catch (error) {
    console.error("Crawler publish error:", error.message);
    return res.status(error.status || 400).json({ error: error.publicMessage || "Không thể xuất bản truyện từ crawler." });
  }
};

function sanitizeCrawlerBook(value) {
  const sourceId = clean(value?.sourceId, 30).replace(/\D/g, "");
  const title = clean(value?.title, 120);
  const epub = cleanUrl(value?.epub);
  if (!/^\d{10,30}$/.test(sourceId) || !title || !epub) fail("Metadata crawler không hợp lệ.");
  return {
    id: `fanqie-${sourceId}`,
    title,
    author: clean(value?.author, 100),
    genre: clean(value?.genre, 60),
    status: clean(value?.status, 40) || "Đang cập nhật",
    description: clean(value?.description, 500),
    chapterCount: clampInteger(value?.chapterCount, 0, 100000),
    featured: false,
    cover: cleanUrl(value?.cover),
    epub,
    source: "fanqie",
    sourceId,
    sourceUrl: `https://fanqienovel.com/page/${sourceId}`,
    lastCrawledAt: new Date().toISOString(),
    updatedAt: new Date().toISOString().slice(0, 10)
  };
}

async function validateBlob(url, prefix, contentTypes) {
  let metadata;
  try {
    metadata = await head(url);
  } catch {
    fail("File không thuộc kho lưu trữ của website.");
  }
  if (!metadata.pathname.startsWith(prefix) || !contentTypes.includes(metadata.contentType)) fail("File crawler không đúng định dạng.");
}

async function cleanupReplacedFiles(previous, current) {
  if (!previous) return;
  const replaced = [previous.epub !== current.epub ? previous.epub : "", previous.cover && previous.cover !== current.cover ? previous.cover : ""].filter(Boolean);
  await Promise.allSettled(replaced.map((url) => del(url)));
}

function clean(value, max) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com") ? url.toString() : "";
  } catch {
    return "";
  }
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : 0;
}

function fail(publicMessage) {
  const error = new Error(publicMessage);
  error.publicMessage = publicMessage;
  error.status = 400;
  throw error;
}
