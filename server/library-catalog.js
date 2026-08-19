"use strict";

const fs = require("fs");
const path = require("path");
const { updateWithRetry } = require("./blob-concurrency");

const CATALOG_PATH = "library/catalog.json";
const DEFAULT_SITE = {
  name: "Trạm Chữ",
  tagline: "Một góc đọc truyện Trung được tuyển chọn, dịch và nghe ngay trong cùng một không gian.",
  contactEmail: "minhphuc2308031@gmail.com"
};

async function readCatalog() {
  // Reads for visitors ride the Blob edge cache; only the read-modify-write path
  // below needs a body that is guaranteed to match the etag it locks against.
  return (await readCatalogSnapshot({ allowSourceFallback: true, fresh: false })).catalog;
}

async function readCatalogSnapshot({ allowSourceFallback = false, fresh = true } = {}) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { list } = require("@vercel/blob");
      const result = await list({ prefix: CATALOG_PATH, limit: 10 });
      const blob = result.blobs.find((item) => item.pathname === CATALOG_PATH);
      if (blob) {
        const url = fresh ? `${blob.url}?v=${Date.now()}` : blob.url;
        const response = await fetch(url, fresh ? { cache: "no-store" } : undefined);
        if (!response.ok) throw new Error(`Blob catalog trả HTTP ${response.status}.`);
        return { catalog: normalizeCatalog(await response.json()), etag: blob.etag };
      }
    } catch (error) {
      console.error("Unable to read Blob catalog:", error.message);
      if (!allowSourceFallback) throw error;
    }
  }
  if (!allowSourceFallback && process.env.BLOB_READ_WRITE_TOKEN) {
    return { catalog: readSourceCatalog(), etag: "" };
  }
  return { catalog: readSourceCatalog(), etag: "" };
}

async function writeCatalog(catalog, { etag } = {}) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Vercel Blob chưa được kết nối.");
  const { put } = require("@vercel/blob");
  const normalized = normalizeCatalog(catalog);
  await put(CATALOG_PATH, JSON.stringify(normalized, null, 2), {
    access: "public",
    contentType: "application/json; charset=utf-8",
    ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
    cacheControlMaxAge: 30
  });
  return normalized;
}

async function updateCatalog(mutator, maxAttempts = 6) {
  return updateWithRetry({
    maxAttempts,
    read: async () => {
      const snapshot = await readCatalogSnapshot();
      return { value: snapshot.catalog, etag: snapshot.etag };
    },
    mutate: mutator,
    write: (catalog, etag) => writeCatalog(catalog, { etag })
  });
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
    site: value?.site && typeof value.site === "object" ? { ...DEFAULT_SITE, ...value.site, name: DEFAULT_SITE.name } : { ...DEFAULT_SITE },
    books: Array.isArray(value?.books) ? value.books.filter((book) => book && typeof book === "object").slice(0, 500) : []
  };
}

module.exports = { CATALOG_PATH, readCatalog, writeCatalog, updateCatalog, normalizeCatalog };
