"use strict";
const path = require("path");
const fs = require("fs");

function loadEnv(file) {
  if (fs.existsSync(file)) {
    for (const l of fs.readFileSync(file, "utf8").split("\n")) {
      const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        let v = m[2].trim();
        if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  }
}
loadEnv(path.join(__dirname, "..", ".env"));
loadEnv(path.join(__dirname, "..", ".env.local"));

const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");

async function main() {
  const storage = createStorage();
  const db = createSupabase(process.env);
  const bookId = "fanqie-7085357205842562078";

  const meta = {
    title: "Đệ Nhất Đại Họa Hại Của Tu Tiên Giới",
    author: "Ma Cô Ốc Hạ Đích Tùng Thử",
    description: "【Phàm nhân lưu + Không hệ thống】\nNăm ấy, cậu bé bảy tuổi dắt theo muội muội bước chân vào giới tu tiên, và rồi... cả giới tu tiên đều phát điên!\nRa ngoài tu tiên, thiên phú ngươi tốt hay xấu, pháp bảo nhiều hay ít, có cơ duyên hay không, những thứ đó đều không quan trọng. Nhưng ngươi nhất định phải nhớ kỹ: có một người tuyệt đối không thể đắc tội!"
  };

  console.log(`Updating [${bookId}]: ${meta.title}`);

  const rawIndex = await storage.get(`books/${bookId}/index.json`);
  let indexObj = rawIndex ? JSON.parse(rawIndex.toString()) : {};
  indexObj.title = meta.title;
  indexObj.author = meta.author;
  indexObj.description = meta.description;
  await storage.put(`books/${bookId}/index.json`, Buffer.from(JSON.stringify(indexObj, null, 2)), "application/json");

  if (db) {
    await db.upsertBook({
      id: bookId,
      title: meta.title,
      author: meta.author,
      description: meta.description,
      cover_url: indexObj.cover,
      status: indexObj.status || "Đang cập nhật",
      total_chapters: indexObj.totalChapters || 0,
      translated_chapters: indexObj.translatedChapters || 0,
      revision: indexObj.revision || 1
    });
  }

  await publishCatalogSnapshot({ storage, env: process.env, log: console.log });
  console.log("Updated successfully!");
}

main().catch(console.error);
