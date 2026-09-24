"use strict";

const crypto = require("node:crypto");
const { cacheControlFor, contentTypeFor } = require("./keys");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

let KNOWN_BOOK_TITLES = {
  "qidian-1036575193": "Ranh Giới Hoàng Hôn",
  "fanqie-7143038691944959011": "Thập Nhật Chung Yên",
  "qidian-1041637443": "Vớt Thi Nhân",
  "qidian-1049745989": "Cấp Cấp Như Luật Lệnh",
  "fanqie-7027679289931729920": "Sinh Tồn Kinh Hoàng Trong Thế Giới Ác Mộng",
  "fanqie-7379865527998483480": "Ban Ngày Bán Quần Áo, Ban Đêm Khâu Thi Thể",
  "qidian-1024868626": "Bắt Đầu Từ Trăng Đỏ",
  "mieu-cuong-co-su": "Miêu Cương Cổ Sự"
};

try {
  const fs = require("node:fs");
  const path = require("node:path");
  const knownPath = path.resolve(__dirname, "../../data/known-books.json");
  if (fs.existsSync(knownPath)) {
    const custom = JSON.parse(fs.readFileSync(knownPath, "utf8"));
    KNOWN_BOOK_TITLES = { ...KNOWN_BOOK_TITLES, ...custom };
  }
} catch (_) {}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 60; // Max ~16 QPS to stay safely within Google Drive 20 QPS quota

async function fetchWithRetry(url, options = {}, maxRetries = 5) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const now = Date.now();
    const waitTime = Math.max(0, lastRequestTime + MIN_REQUEST_INTERVAL_MS - now);
    if (waitTime > 0) {
      await sleep(waitTime);
    }
    lastRequestTime = Date.now();

    try {
      const response = await fetch(url, options);
      if (response.status === 429 || (response.status === 403 && attempt < maxRetries)) {
        const errorText = await response.clone().text().catch(() => "");
        const isRateLimit = response.status === 429 || errorText.includes("userRateLimitExceeded") || errorText.includes("rateLimitExceeded") || errorText.includes("Rate Limit") || response.status === 403;
        if (isRateLimit) {
          const backoff = Math.min(10000, 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 500));
          console.warn(`[DRIVE RATE LIMIT] HTTP ${response.status} on ${url}. Retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})...`);
          await sleep(backoff);
          continue;
        }
      }
      return response;
    } catch (err) {
      if (attempt < maxRetries) {
        const backoff = Math.min(10000, 1000 * Math.pow(2, attempt));
        console.warn(`[DRIVE FETCH ERROR] ${err.message}. Retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
}

function createDriveStorage(env = process.env) {
  const clientId = env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET;
  const refreshToken = env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const rootFolderId = env.GOOGLE_DRIVE_STORAGE_FOLDER_ID || "1-TvHLKA7z_hyt90BdJpRBsjmCQGW3z8P";
  const publicBase = (env.R2_PUBLIC_BASE_URL || env.DRIVE_PUBLIC_BASE_URL || "").replace(/\/$/, "");

  let cachedToken = null;
  let tokenExpiresAt = 0;
  const folderCache = new Map();

  async function getAccessToken() {
    const now = Date.now();
    if (cachedToken && now < tokenExpiresAt - 60000) {
      return cachedToken;
    }

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error("Thiếu cấu hình Google Drive (CLIENT_ID, CLIENT_SECRET hoặc REFRESH_TOKEN).");
    }

    const response = await fetchWithRetry(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      throw new Error(`Google OAuth thất bại (${response.status}): ${data.error || "unknown"}`);
    }

    cachedToken = data.access_token;
    tokenExpiresAt = now + (Number(data.expires_in) || 3600) * 1000;
    return cachedToken;
  }

  const folderPromises = new Map();

  async function getOrCreateFolder(parentFolderId, folderName) {
    const cacheKey = `${parentFolderId}::${folderName}`;
    if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);
    if (folderPromises.has(cacheKey)) return folderPromises.get(cacheKey);

    const promise = (async () => {
      try {
        const token = await getAccessToken();
        const q = `'${escapeDriveQuery(parentFolderId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false and name = '${escapeDriveQuery(folderName)}'`;
        const findUrl = new URL(DRIVE_FILES_URL);
        findUrl.searchParams.set("q", q);
        findUrl.searchParams.set("fields", "files(id,name)");
        findUrl.searchParams.set("pageSize", "1");

        const findRes = await fetchWithRetry(findUrl, { headers: { Authorization: `Bearer ${token}` } });
        const findData = await findRes.json();
        if (findData.files?.[0]) {
          folderCache.set(cacheKey, findData.files[0].id);
          return findData.files[0].id;
        }

        const createRes = await fetchWithRetry(`${DRIVE_FILES_URL}?fields=id,name`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentFolderId]
          })
        });
        const folder = await createRes.json();
        folderCache.set(cacheKey, folder.id);
        return folder.id;
      } finally {
        folderPromises.delete(cacheKey);
      }
    })();

    folderPromises.set(cacheKey, promise);
    return promise;
  }

  async function resolveFolderAndName(key, options = {}) {
    // 1. catalog files
    if (key.startsWith("catalog/") || key === "books/index.json") {
      const catalogFolderId = await getOrCreateFolder(rootFolderId, "catalog");
      const filename = key.split("/").pop();
      return { targetFolderId: catalogFolderId, fileName: filename };
    }

    // 2. covers
    if (key.startsWith("covers/")) {
      const coversFolderId = await getOrCreateFolder(rootFolderId, "covers");
      const filename = key.split("/").pop();
      return { targetFolderId: coversFolderId, fileName: filename };
    }

    // 3. Source EPUBs stay in a private Drive subfolder. They deliberately do
    // not match any public Pages route, but keeping them together also makes
    // Drive retention and cleanup auditable.
    if (key.startsWith("uploads/")) {
      const uploadsFolderId = await getOrCreateFolder(rootFolderId, "uploads");
      return { targetFolderId: uploadsFolderId, fileName: key.split("/").pop() };
    }

    // 4. books: books/{bookId}/...
    const match = key.match(/^books\/([^/]+)(?:\/(.*))?$/);
    if (match) {
      const bookId = match[1];
      const rest = match[2] || "index.json";
      const booksRootId = await getOrCreateFolder(rootFolderId, "books");
      
      const title = options.bookTitle || KNOWN_BOOK_TITLES[bookId];
      const bookFolderTitle = title ? `${title} (${bookId})` : bookId;
      const bookFolderId = await getOrCreateFolder(booksRootId, bookFolderTitle);

      // if rest has subpath like r1/ch/1.json, put as 1.json or keep clean
      let fileName = rest.split("/").pop();
      if (rest.endsWith(".original.json")) {
        const num = rest.match(/(\d+)\.original\.json/)?.[1] || "original";
        fileName = `${num}.original.json`;
      }
      return { targetFolderId: bookFolderId, fileName };
    }

    return { targetFolderId: rootFolderId, fileName: key };
  }

  async function findFileByKey(key) {
    const token = await getAccessToken();
    // Storage keys are immutable appProperties. Never fall back to `name`:
    // repeated names (index.json, 1.json) can otherwise resolve another book.
    const q = `trashed = false and appProperties has { key='relPath' and value='${escapeDriveQuery(key)}' }`;
    const url = new URL(DRIVE_FILES_URL);
    url.searchParams.set("q", q);
    url.searchParams.set("fields", "files(id,name,size,mimeType,modifiedTime,md5Checksum,appProperties)");
    url.searchParams.set("pageSize", "2");

    const response = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Drive find file error HTTP ${response.status}`);
    const data = await response.json();
    const files = data.files || [];
    if (files.length > 1) throw new Error(`Duplicate Drive storage key: ${key}`);
    return files[0] || null;
  }

  return {
    driver: "drive",
    folderId: rootFolderId,

    async put(key, body, options = {}) {
      const token = await getAccessToken();
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
      const mime = options.contentType || contentTypeFor(key) || "application/octet-stream";

      if (!options.skipFind) {
        const existing = await findFileByKey(key);
        if (existing) {
          const updateUrl = `${DRIVE_UPLOAD_URL}/${existing.id}?uploadType=media`;
          const response = await fetchWithRetry(updateUrl, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": mime },
            body: buffer
          });
          if (!response.ok) throw new Error(`Drive update ${key} error HTTP ${response.status}`);
          return { key, id: existing.id, size: buffer.length, url: publicBase ? `${publicBase}/${key}` : "" };
        }
      }

      const { targetFolderId, fileName } = await resolveFolderAndName(key, options);

      const metadata = {
        name: fileName,
        parents: [targetFolderId],
        mimeType: mime,
        appProperties: {
          relPath: key,
          cacheControl: options.cacheControl || cacheControlFor(key) || "public, max-age=604800"
        }
      };

      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      form.append("file", new Blob([buffer], { type: mime }));

      const response = await fetchWithRetry(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,size`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`Drive PUT ${key} error HTTP ${response.status}: ${errorText.slice(0, 200)}`);
      }

      const file = await response.json();
      return { key, id: file.id, size: buffer.length, url: publicBase ? `${publicBase}/${key}` : "" };
    },

    // The browser uploads large EPUBs straight to this short-lived Google
    // resumable session. Pages never proxies the bytes, avoiding its request
    // body limit while the archive remains private in Drive.
    async initiateResumableUpload(key, { contentType, size, cacheControl } = {}) {
      if (!key.startsWith("uploads/")) throw new Error("Resumable upload chỉ dành cho EPUB private.");
      if (!Number.isFinite(size) || size <= 0) throw new Error("Kích thước EPUB không hợp lệ.");
      if (await findFileByKey(key)) throw new Error(`Drive storage key đã tồn tại: ${key}`);

      const token = await getAccessToken();
      const { targetFolderId, fileName } = await resolveFolderAndName(key);
      const mime = contentType || "application/epub+zip";
      const response = await fetchWithRetry(`${DRIVE_UPLOAD_URL}?uploadType=resumable&fields=id,name,size`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": mime,
          "X-Upload-Content-Length": String(size)
        },
        body: JSON.stringify({
          name: fileName,
          parents: [targetFolderId],
          mimeType: mime,
          appProperties: {
            relPath: key,
            cacheControl: cacheControl || "private, max-age=0"
          }
        })
      });
      const location = response.headers.get("location");
      if (!response.ok || !location) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Drive không tạo được phiên upload (${response.status}): ${detail.slice(0, 200)}`);
      }
      return { uploadUrl: location, key, maxBytes: size };
    },

    async get(key) {
      const file = await findFileByKey(key);
      if (!file) return null;

      const token = await getAccessToken();
      const response = await fetchWithRetry(`${DRIVE_FILES_URL}/${file.id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Drive GET ${key} error HTTP ${response.status}`);

      return Buffer.from(await response.arrayBuffer());
    },

    async head(key) {
      const file = await findFileByKey(key);
      if (!file) return null;

      return {
        key,
        id: file.id,
        size: Number(file.size) || 0,
        contentType: file.mimeType || contentTypeFor(key),
        etag: file.md5Checksum ? `"${file.md5Checksum}"` : ""
      };
    },

    async list(prefix = "") {
      const token = await getAccessToken();
      const out = [];
      let pageToken = "";

      do {
        const url = new URL(DRIVE_FILES_URL);
        url.searchParams.set("q", `trashed = false`);
        url.searchParams.set("fields", "nextPageToken,files(id,name,size,appProperties)");
        url.searchParams.set("pageSize", "1000");
        if (pageToken) url.searchParams.set("pageToken", pageToken);

        const response = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error(`Drive LIST error HTTP ${response.status}`);

        const data = await response.json();
        for (const f of data.files || []) {
          const relPath = f.appProperties?.relPath;
          if (!relPath) continue;
          if (!prefix || relPath.startsWith(prefix)) {
            out.push({
              key: relPath,
              id: f.id,
              size: Number(f.size) || 0
            });
          }
        }
        pageToken = data.nextPageToken || "";
      } while (pageToken);

      return out;
    },

    async remove(key) {
      const file = await findFileByKey(key);
      if (!file) return false;

      const token = await getAccessToken();
      const response = await fetchWithRetry(`${DRIVE_FILES_URL}/${file.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.ok;
    },

    // Keep the storage contract identical to R2. Drive has no prefix-delete
    // API, so callers must first list the exact relPath prefix and this method
    // deletes only those resolved file ids. A missing file is idempotent.
    async removeMany(keys) {
      let removed = 0;
      for (const key of [...new Set((keys || []).filter(Boolean))]) {
        if (await this.remove(key)) removed += 1;
      }
      return removed;
    },

    publicUrl(key) {
      return publicBase ? `${publicBase}/${key}` : `/${key}`;
    }
  };
}

module.exports = { createDriveStorage };
