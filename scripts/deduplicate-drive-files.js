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

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

async function getAccessToken() {
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
  return data.access_token;
}

async function runPool(items, concurrency, workerFn) {
  let index = 0;
  let done = 0;
  const total = items.length;

  async function next() {
    while (index < total) {
      const item = items[index++];
      await workerFn(item);
      done++;
      if (done % 50 === 0 || done === total) {
        process.stdout.write(`  ⏳ Đã xử lý: ${done}/${total} file trùng (${((done / total) * 100).toFixed(1)}%)\r`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => next());
  await Promise.all(workers);
  console.log(`\n  ✅ Đã xử lý xong ${done}/${total} file trùng.`);
}

async function main() {
  console.log("===================================================================");
  console.log("   🧹 DỌN DẸP & KHỬ TRÙNG LẶP (DEDUPLICATE) TRÊN GOOGLE DRIVE");
  console.log("===================================================================");

  const token = await getAccessToken();
  let pageToken = "";
  const filesByFolderAndName = new Map();
  let totalScanned = 0;

  console.log("Đang quét toàn bộ file trên Google Drive...");
  do {
    const url = new URL(DRIVE_FILES_URL);
    url.searchParams.set("q", "trashed = false and mimeType != 'application/vnd.google-apps.folder'");
    url.searchParams.set("fields", "nextPageToken,files(id,name,parents,size,createdTime)");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.files) {
      totalScanned += data.files.length;
      for (const f of data.files) {
        const parent = f.parents?.[0] || "root";
        const key = `${parent}::${f.name}`;
        if (!filesByFolderAndName.has(key)) {
          filesByFolderAndName.set(key, []);
        }
        filesByFolderAndName.get(key).push(f);
      }
    }
    pageToken = data.nextPageToken;
    process.stdout.write(`  Quét được: ${totalScanned} files...\r`);
  } while (pageToken);

  console.log(`\nTổng số file quét được: ${totalScanned}`);

  // Find duplicates
  const filesToDelete = [];
  for (const [key, list] of filesByFolderAndName.entries()) {
    if (list.length > 1) {
      // Sort by size desc (prefer non-empty), then by createdTime desc (prefer newest)
      list.sort((a, b) => {
        const sizeDiff = (Number(b.size) || 0) - (Number(a.size) || 0);
        if (sizeDiff !== 0) return sizeDiff;
        return Date.parse(b.createdTime || 0) - Date.parse(a.createdTime || 0);
      });

      // Keep list[0], delete list[1..n]
      const toRemove = list.slice(1);
      for (const item of toRemove) {
        filesToDelete.push({ id: item.id, name: item.name, parent: item.parents?.[0] });
      }
    }
  }

  console.log(`Phát hiện ${filesToDelete.length} bản sao thừa cần xóa bỏ.`);
  if (filesToDelete.length === 0) {
    console.log("✅ Không có file trùng lặp nào!");
    return;
  }

  console.log(`Bắt đầu xóa ${filesToDelete.length} file trùng lặp (concurrency: 8)...`);
  let success = 0;
  let fail = 0;

  await runPool(filesToDelete, 8, async (item) => {
    try {
      const delUrl = `${DRIVE_FILES_URL}/${item.id}`;
      const res = await fetch(delUrl, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok || res.status === 404) {
        success++;
      } else {
        fail++;
      }
    } catch {
      fail++;
    }
  });

  console.log(`\n🎉 HOÀN TẤT DỌN DẸP! Xóa thành công: ${success}, Thất bại: ${fail}`);
}

main().catch(console.error);
