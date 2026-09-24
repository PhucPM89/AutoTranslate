"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { requireDriveConfig, getAccessToken, ensureBookFolder } = require("../server/audio/drive-storage");

function loadEnv() {
  const file = path.resolve(__dirname, "..", ".env.local");
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

async function main() {
  loadEnv();
  const [fileId, bookId, bookName] = process.argv.slice(2);
  if (!fileId || !bookId || !bookName) throw new Error("Usage: node scripts/organize-drive-audio.js <fileId> <bookId> <bookName>");
  const config = requireDriveConfig();
  const accessToken = await getAccessToken(config);
  const bookFolder = await ensureBookFolder({ accessToken, parentFolderId: config.folderId, bookId, bookName });

  const metadataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,parents`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const metadata = await metadataResponse.json().catch(() => ({}));
  if (!metadataResponse.ok) throw new Error(`Không đọc được file cần chuyển (${metadataResponse.status}).`);
  const oldParents = (metadata.parents || []).filter((id) => id !== bookFolder.id);
  const moveUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  moveUrl.searchParams.set("addParents", bookFolder.id);
  if (oldParents.length) moveUrl.searchParams.set("removeParents", oldParents.join(","));
  moveUrl.searchParams.set("fields", "id,name,parents");
  const moveResponse = await fetch(moveUrl, { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}` } });
  const moved = await moveResponse.json().catch(() => ({}));
  if (!moveResponse.ok) throw new Error(`Không chuyển được file vào thư mục bộ truyện (${moveResponse.status}).`);
  console.log(JSON.stringify({ ok: true, bookFolderId: bookFolder.id, bookFolderName: bookFolder.name, fileId: moved.id, parents: moved.parents }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
