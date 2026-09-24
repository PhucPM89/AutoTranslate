"use strict";

const fs = require("fs");
const path = require("path");

for (const envFile of [".env.local", ".env"]) {
  const full = path.resolve(__dirname, "..", envFile);
  if (fs.existsSync(full)) {
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[match[1]] = val;
      }
    }
  }
}

const { createR2Storage } = require("../server/storage/r2-driver");

const validIds = new Set(JSON.parse(fs.readFileSync(path.resolve(__dirname, "official-79-ids.json"), "utf8")));
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_STORAGE_FOLDER_ID || "1-TvHLKA7z_hyt90BdJpRBsjmCQGW3z8P";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

let cachedToken = null;
let tokenExpiresAt = 0;
const folderCache = new Map();

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) return cachedToken;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + (Number(data.expires_in) || 3600) * 1000;
  return cachedToken;
}

function escapeDriveQuery(val) {
  return String(val).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function getOrCreateFolder(parentFolderId, folderName) {
  const cacheKey = `${parentFolderId}::${folderName}`;
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);

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
}

async function listFilesInFolder(folderId) {
  const token = await getAccessToken();
  const map = new Map();
  let pageToken = "";
  do {
    const url = new URL(DRIVE_FILES_URL);
    url.searchParams.set("q", `'${escapeDriveQuery(folderId)}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`);
    url.searchParams.set("fields", "nextPageToken,files(id,name,size)");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json();
    if (data.files) {
      for (const f of data.files) {
        map.set(f.name, f);
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return map;
}

async function uploadFileDirect({ targetFolderId, fileName, relPath, content, mime = "application/json; charset=utf-8", existingFile = null }) {
  const token = await getAccessToken();
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content), "utf8");

  // Skip if valid file exists
  if (existingFile && existingFile.id && Number(existingFile.size) > 100 && fileName !== "index.json") {
    return { id: existingFile.id, name: fileName, skipped: true };
  }

  // Update in place if exists
  if (existingFile && existingFile.id) {
    const updateUrl = `${DRIVE_UPLOAD_URL}/${existingFile.id}?uploadType=media`;
    const res = await fetch(updateUrl, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": mime },
      body: buffer
    });
    if (res.ok) return await res.json();
  }

  const metadata = {
    name: fileName,
    parents: [targetFolderId],
    mimeType: mime,
    appProperties: { relPath, cacheControl: "public, max-age=604800" }
  };

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", new Blob([buffer], { type: mime }));

  const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,size`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  return await res.json();
}

async function main() {
  console.log("===================================================================");
  console.log("   🚀 AUTO R2 -> GOOGLE DRIVE MIGRATION PIPELINE");
  console.log("   (Strictly limited to the 79 official website books)");
  console.log("===================================================================");

  const r2 = createR2Storage(process.env);

  console.log("1. Checking R2 connection...");
  let r2Objects = [];
  try {
    r2Objects = await r2.list("");
    console.log(`✅ R2 is ACTIVE! Total objects in R2: ${r2Objects.length}`);
  } catch (err) {
    console.error(`❌ R2 is NOT yet accessible: ${err.message}`);
    console.log("\n👉 Vui lòng kích hoạt lại R2 trên Cloudflare Dashboard rồi chạy lại script này!");
    process.exit(1);
  }

  // Filter objects for the 79 books only
  console.log("\n2. Filtering objects for the 79 valid books (Excluding 1983 and others)...");
  const filteredObjects = r2Objects.filter(obj => {
    const match = obj.key.match(/^books\/([^/]+)/);
    if (!match) return false;
    const bId = match[1];
    if (bId === "qidian-1015289802") return false; // Absolutely exclude 1983
    return validIds.has(bId);
  });

  console.log(`Found ${filteredObjects.length} valid objects belonging to official 79 books.`);

  // Load known titles
  const officialBooks = JSON.parse(fs.readFileSync(path.resolve(__dirname, "official-website-books.json"), "utf8"));
  const bookTitleMap = new Map(officialBooks.map(b => [b.id, b.title]));

  const booksRootId = await getOrCreateFolder(ROOT_FOLDER_ID, "books");

  // Group by bookId
  const byBook = new Map();
  for (const obj of filteredObjects) {
    const match = obj.key.match(/^books\/([^/]+)\/(.*)$/);
    if (!match) continue;
    const bId = match[1];
    if (!byBook.has(bId)) byBook.set(bId, []);
    byBook.get(bId).push({ ...obj, relSubPath: match[2] });
  }

  console.log(`\n3. Migrating ${byBook.size} books into Google Drive...`);

  for (const [bId, objects] of byBook.entries()) {
    const title = bookTitleMap.get(bId) || bId;
    const folderName = `${title} (${bId})`;
    console.log(`\n📚 [${folderName}] - ${objects.length} objects to migrate`);

    const folderId = await getOrCreateFolder(booksRootId, folderName);
    const existingFiles = await listFilesInFolder(folderId);

    let count = 0;
    for (const item of objects) {
      const fileName = item.relSubPath.split("/").pop();
      // If already exists and size > 100, skip download from R2 to save bandwidth
      const existing = existingFiles.get(fileName);
      if (existing && Number(existing.size) > 100 && fileName !== "index.json") {
        count++;
        continue;
      }

      const content = await r2.get(item.key);
      if (content) {
        await uploadFileDirect({
          targetFolderId: folderId,
          fileName,
          relPath: item.key,
          content,
          existingFile: existing
        });
      }
      count++;
      if (count % 100 === 0 || count === objects.length) {
        process.stdout.write(`  ⏳ ${count}/${objects.length} files processed\r`);
      }
    }
    console.log(`\n  ✅ Xong: ${title}`);
  }

  console.log("\n🎉 HOÀN TẤT TOÀN BỘ TIẾN TRÌNH MIGRATE TỪ R2 SANG GOOGLE DRIVE!");
}

main().catch(console.error);
