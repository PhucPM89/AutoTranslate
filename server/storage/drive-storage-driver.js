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

    const response = await fetch(TOKEN_URL, {
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

        const findRes = await fetch(findUrl, { headers: { Authorization: `Bearer ${token}` } });
        const findData = await findRes.json();
        if (findData.files?.[0]) {
          folderCache.set(cacheKey, findData.files[0].id);
          return findData.files[0].id;
        }

        const createRes = await fetch(`${DRIVE_FILES_URL}?fields=id,name`, {
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

    // 3. books: books/{bookId}/...
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
    // Search by relPath in appProperties across the storage
    const q = `trashed = false and (appProperties has { key='relPath' and value='${escapeDriveQuery(key)}' } or name = '${escapeDriveQuery(key)}')`;
    const url = new URL(DRIVE_FILES_URL);
    url.searchParams.set("q", q);
    url.searchParams.set("fields", "files(id,name,size,mimeType,modifiedTime,md5Checksum,appProperties)");
    url.searchParams.set("pageSize", "1");

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Drive find file error HTTP ${response.status}`);
    const data = await response.json();
    return data.files?.[0] || null;
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
          const response = await fetch(updateUrl, {
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

      const response = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,size`, {
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

    async get(key) {
      const file = await findFileByKey(key);
      if (!file) return null;

      const token = await getAccessToken();
      const response = await fetch(`${DRIVE_FILES_URL}/${file.id}?alt=media`, {
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

        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error(`Drive LIST error HTTP ${response.status}`);

        const data = await response.json();
        for (const f of data.files || []) {
          const relPath = f.appProperties?.relPath || f.name;
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
      const response = await fetch(`${DRIVE_FILES_URL}/${file.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.ok;
    },

    publicUrl(key) {
      return publicBase ? `${publicBase}/${key}` : `/${key}`;
    }
  };
}

module.exports = { createDriveStorage };
