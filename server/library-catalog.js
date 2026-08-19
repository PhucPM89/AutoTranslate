"use strict";

const fs = require("fs");
const path = require("path");

const CATALOG_PATH = "library/catalog.json";
const DEFAULT_SITE = {
  name: "Tàng Thư",
  tagline: "Một góc đọc truyện Trung được tuyển chọn, dịch và nghe ngay trong cùng một không gian.",
  contactEmail: "minhphuc2308031@gmail.com"
};

async function readCatalog() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { list } = require("@vercel/blob");
      const result = await list({ prefix: CATALOG_PATH, limit: 10 });
      const blob = result.blobs.find((item) => item.pathname === CATALOG_PATH);
      if (blob) {
        const response = await fetch(`${blob.url}?v=${Date.now()}`, { cache: "no-store" });
        if (response.ok) return normalizeCatalog(await response.json());
      }
    } catch (error) {
      console.error("Unable to read Blob catalog:", error.message);
    }
  }
  return readSourceCatalog();
}

async function writeCatalog(catalog) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Vercel Blob chưa được kết nối.");
  const { put } = require("@vercel/blob");
  const normalized = normalizeCatalog(catalog);
  await put(CATALOG_PATH, JSON.stringify(normalized, null, 2), {
    access: "public",
    contentType: "application/json; charset=utf-8",
    allowOverwrite: true,
    cacheControlMaxAge: 30
  });
  return normalized;
}

function readSourceCatalog() {
  try {
    const filePath = path.join(__dirname, "..", "public", "library.json");
    return normalizeCatalog(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    return { site: { ...DEFAULT_SITE }, books: [] };
  }
}

function normalizeCatalog(value) {
  return {
    site: value?.site && typeof value.site === "object" ? { ...DEFAULT_SITE, ...value.site } : { ...DEFAULT_SITE },
    books: Array.isArray(value?.books) ? value.books.filter((book) => book && typeof book === "object").slice(0, 500) : []
  };
}

module.exports = { CATALOG_PATH, readCatalog, writeCatalog, normalizeCatalog };
