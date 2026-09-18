"use strict";

const fs = require("node:fs");
const path = require("node:path");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function requireDriveConfig(env = process.env) {
  const config = {
    clientId: env.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
    refreshToken: env.GOOGLE_DRIVE_REFRESH_TOKEN,
    folderId: env.GOOGLE_DRIVE_AUDIO_FOLDER_ID
  };
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Thiếu cấu hình Google Drive: ${missing.join(", ")}`);
  return config;
}

async function getAccessToken(config, fetchImpl = fetch) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token"
  });
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(`Không lấy được Google OAuth token (${response.status}).`);
  return data.access_token;
}

async function ensureBookFolder({ accessToken, parentFolderId, bookId, bookName, fetchImpl = fetch }) {
  const query = [
    `'${escapeDriveQuery(parentFolderId)}' in parents`,
    "trashed = false",
    "mimeType = 'application/vnd.google-apps.folder'",
    `appProperties has { key='audioBookId' and value='${escapeDriveQuery(bookId)}' }`
  ].join(" and ");
  const findUrl = new URL(DRIVE_FILES_URL);
  findUrl.searchParams.set("q", query);
  findUrl.searchParams.set("fields", "files(id,name,parents,appProperties)");
  findUrl.searchParams.set("pageSize", "10");
  const foundResponse = await fetchImpl(findUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  const found = await foundResponse.json().catch(() => ({}));
  if (!foundResponse.ok) throw new Error(`Không tìm được thư mục bộ truyện trên Drive (${foundResponse.status}).`);
  if (found.files?.[0]) return found.files[0];

  const createResponse = await fetchImpl(`${DRIVE_FILES_URL}?fields=id,name,parents,appProperties`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      name: String(bookName || bookId).trim() || String(bookId),
      parents: [parentFolderId],
      mimeType: "application/vnd.google-apps.folder",
      appProperties: { audioBookId: String(bookId), purpose: "tram-chu-audio" }
    })
  });
  const created = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok || !created.id) throw new Error(`Không tạo được thư mục bộ truyện trên Drive (${createResponse.status}).`);
  return created;
}

async function findAudioFile({ accessToken, folderId, bookId, chapterNumber, sourceSha256, fetchImpl = fetch }) {
  const name = `${bookId}-chapter-${String(chapterNumber).padStart(4, "0")}.mp3`;
  
  if (sourceSha256) {
    const shaQuery = [
      `'${folderId}' in parents`,
      "trashed = false",
      `appProperties has { key='bookId' and value='${String(bookId).replace(/'/g, "\\'")}' }`,
      `appProperties has { key='chapterNumber' and value='${Number(chapterNumber)}' }`,
      `appProperties has { key='sourceSha256' and value='${sourceSha256}' }`
    ].join(" and ");
    const shaUrl = new URL(DRIVE_FILES_URL);
    shaUrl.searchParams.set("q", shaQuery);
    shaUrl.searchParams.set("fields", "files(id,name,size,md5Checksum,webContentLink,appProperties)");
    shaUrl.searchParams.set("pageSize", "10");
    const shaRes = await fetchImpl(shaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const shaData = await shaRes.json().catch(() => ({}));
    if (shaData.files?.[0]) return shaData.files[0];
  }

  // Fallback: search by exact chapter filename or bookId + chapterNumber
  const nameQuery = [
    `'${folderId}' in parents`,
    "trashed = false",
    `name = '${name}'`
  ].join(" and ");
  const nameUrl = new URL(DRIVE_FILES_URL);
  nameUrl.searchParams.set("q", nameQuery);
  nameUrl.searchParams.set("fields", "files(id,name,size,md5Checksum,webContentLink,appProperties)");
  nameUrl.searchParams.set("pageSize", "10");
  const nameRes = await fetchImpl(nameUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  const nameData = await nameRes.json().catch(() => ({}));
  return nameData.files?.[0] || null;
}

async function uploadAudioFile({ accessToken, folderId, filePath, bookId, chapterNumber, sourceSha256, durationSeconds, fetchImpl = fetch }) {
  const stat = fs.statSync(filePath);
  const name = `${bookId}-chapter-${String(chapterNumber).padStart(4, "0")}.mp3`;
  const metadata = {
    name,
    parents: [folderId],
    mimeType: "audio/mpeg",
    appProperties: {
      bookId: String(bookId),
      chapterNumber: String(Number(chapterNumber)),
      sourceSha256,
      durationSeconds: String(Number(durationSeconds || 0).toFixed(3)),
      pipeline: "edge-tts-local-no-billing-v1"
    }
  };
  const initUrl = new URL(DRIVE_UPLOAD_URL);
  initUrl.searchParams.set("uploadType", "resumable");
  initUrl.searchParams.set("fields", "id,name,size,md5Checksum,webContentLink,appProperties");
  const init = await fetchImpl(initUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Upload-Content-Type": "audio/mpeg",
      "X-Upload-Content-Length": String(stat.size)
    },
    body: JSON.stringify(metadata)
  });
  if (!init.ok) throw new Error(`Không khởi tạo được upload Drive (${init.status}).`);
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new Error("Google Drive không trả URL upload resumable.");
  const uploaded = await fetchImpl(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "audio/mpeg", "Content-Length": String(stat.size) },
    body: fs.readFileSync(filePath)
  });
  const result = await uploaded.json().catch(() => ({}));
  if (!uploaded.ok || !result.id) throw new Error(`Upload Drive thất bại (${uploaded.status}).`);
  return result;
}

async function makeFilePublic({ accessToken, fileId, fetchImpl = fetch }) {
  const url = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}/permissions`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "anyone", role: "reader", allowFileDiscovery: false })
  });
  if (!response.ok) throw new Error(`Không cấp được quyền nghe công khai cho file Drive (${response.status}).`);
}

async function storeChapterAudio(params, env = process.env, fetchImpl = fetch) {
  const config = requireDriveConfig(env);
  const accessToken = await getAccessToken(config, fetchImpl);
  const bookFolder = await ensureBookFolder({
    accessToken,
    parentFolderId: config.folderId,
    bookId: params.bookId,
    bookName: params.bookName,
    fetchImpl
  });
  const existing = await findAudioFile({ ...params, accessToken, folderId: bookFolder.id, fetchImpl });
  if (existing) {
    await makeFilePublic({ accessToken, fileId: existing.id, fetchImpl });
    return { status: "existing", file: existing };
  }
  const file = await uploadAudioFile({ ...params, accessToken, folderId: bookFolder.id, fetchImpl });
  await makeFilePublic({ accessToken, fileId: file.id, fetchImpl });
  return { status: "uploaded", file };
}

async function findChapterAudioOnDrive({ bookId, chapterNumber, bookName, env = process.env, fetchImpl = fetch }) {
  try {
    const config = requireDriveConfig(env);
    const accessToken = await getAccessToken(config, fetchImpl);
    const bookFolder = await ensureBookFolder({
      accessToken,
      parentFolderId: config.folderId,
      bookId,
      bookName,
      fetchImpl
    });
    const file = await findAudioFile({
      accessToken,
      folderId: bookFolder.id,
      bookId,
      chapterNumber,
      fetchImpl
    });
    if (file) {
      await makeFilePublic({ accessToken, fileId: file.id, fetchImpl });
      return { status: "ready", file, url: publicDownloadUrl(file.id) };
    }
    return null;
  } catch {
    return null;
  }
}

async function listBookAudioFromDrive({ bookId, bookName, env = process.env, fetchImpl = fetch }) {
  try {
    const config = requireDriveConfig(env);
    const accessToken = await getAccessToken(config, fetchImpl);
    const bookFolder = await ensureBookFolder({
      accessToken,
      parentFolderId: config.folderId,
      bookId,
      bookName,
      fetchImpl
    });
    const url = new URL(DRIVE_FILES_URL);
    url.searchParams.set("q", `'${bookFolder.id}' in parents and trashed = false`);
    url.searchParams.set("fields", "files(id,name,size,appProperties)");
    url.searchParams.set("pageSize", "1000");
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await response.json().catch(() => ({}));
    const map = new Map();
    for (const f of data.files || []) {
      const match = f.name.match(/-chapter-(\d+)\.mp3$/);
      const chNum = f.appProperties?.chapterNumber ? Number(f.appProperties.chapterNumber) : (match ? Number(match[1]) : null);
      if (chNum && !map.has(chNum)) {
        map.set(chNum, { fileId: f.id, name: f.name, size: Number(f.size || 0), url: publicDownloadUrl(f.id) });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function publicDownloadUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

module.exports = {
  requireDriveConfig,
  getAccessToken,
  ensureBookFolder,
  findAudioFile,
  uploadAudioFile,
  makeFilePublic,
  storeChapterAudio,
  findChapterAudioOnDrive,
  listBookAudioFromDrive,
  publicDownloadUrl
};
