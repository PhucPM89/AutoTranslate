const { del, head } = require("@vercel/blob");
const { isAdmin, isSameOrigin } = require("../../server/admin-auth");
const { readCatalog, writeCatalog } = require("../../server/library-catalog");
const { readJsonBody, methodNotAllowed, noStore } = require("../../server/http");

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  if (!isSameOrigin(req) || !isAdmin(req)) return res.status(401).json({ error: "Phiên quản trị đã hết hạn." });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: "Vercel Blob chưa được kết nối." });

  try {
    const raw = await readJsonBody(req, 32 * 1024);
    const book = sanitizeBook(raw);
    await Promise.all([
      validateBlob(book.epub, "library/books/", ["application/epub+zip", "application/octet-stream"]),
      book.cover ? validateBlob(book.cover, "library/covers/", ["image/jpeg", "image/png", "image/webp"]) : null
    ]);

    let catalog = await readCatalog();
    const existingIndex = catalog.books.findIndex((item) => item.id === book.id);
    const existingBook = existingIndex >= 0 ? catalog.books[existingIndex] : null;
    if (existingBook?.source === "fanqie") {
      book.source = existingBook.source;
      book.sourceId = existingBook.sourceId;
      book.sourceUrl = existingBook.sourceUrl;
      book.lastCrawledAt = existingBook.lastCrawledAt;
      book.metadataLanguage = existingBook.metadataLanguage;
    }
    if (existingIndex >= 0) catalog.books[existingIndex] = book;
    else catalog.books.unshift(book);
    catalog.books = catalog.books.slice(0, 500);

    catalog = await writeCatalog(catalog);
    await cleanupReplacedFiles(existingBook, book);
    return res.status(200).json({ book, catalog });
  } catch (error) {
    console.error("Catalog update error:", error.message);
    return res.status(error.status || 400).json({ error: error.publicMessage || "Không thể cập nhật thư viện." });
  }
};

async function cleanupReplacedFiles(previous, current) {
  if (!previous) return;
  const replaced = [
    previous.epub && previous.epub !== current.epub ? previous.epub : "",
    previous.cover && previous.cover !== current.cover ? previous.cover : ""
  ].filter(Boolean);
  await Promise.allSettled(replaced.map((url) => del(url)));
}

function sanitizeBook(value) {
  const title = clean(value?.title, 120);
  const id = slug(clean(value?.id || title, 100));
  const epub = cleanUrl(value?.epub);
  if (!title || !id || !epub) fail("Thiếu tên truyện hoặc file EPUB.");
  return {
    id,
    title,
    author: clean(value?.author, 100),
    genre: clean(value?.genre, 60),
    status: clean(value?.status, 40) || "Có sẵn",
    description: clean(value?.description, 500),
    chapterCount: clampInteger(value?.chapterCount, 0, 100000),
    featured: Boolean(value?.featured),
    cover: cleanUrl(value?.cover),
    epub,
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
  if (!metadata.pathname.startsWith(prefix) || !contentTypes.includes(metadata.contentType)) fail("File upload không đúng định dạng.");
}

function clean(value, max) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".public.blob.vercel-storage.com")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function slug(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
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
