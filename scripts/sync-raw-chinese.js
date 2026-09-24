#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

for (const envFile of [".env.local", ".env"]) {
  const full = path.resolve(__dirname, "..", envFile);
  if (fs.existsSync(full)) {
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
      }
    }
  }
}

const { createDriveStorage } = require("../server/storage/drive-storage-driver");
const storage = createDriveStorage(process.env);

async function runQueue(items, concurrency, workerFn) {
  let index = 0;
  let successCount = 0;
  let failCount = 0;

  async function next() {
    while (index < items.length) {
      const current = items[index++];
      let retries = 3;
      let ok = false;
      while (retries > 0 && !ok) {
        try {
          await workerFn(current);
          successCount++;
          ok = true;
        } catch (err) {
          retries--;
          if (retries === 0) {
            console.error(`  ❌ Lỗi tải [${current.key}]: ${err.message}`);
            failCount++;
          } else {
            await new Promise((r) => setTimeout(r, 1500 * (4 - retries)));
          }
        }
      }
      if ((successCount + failCount) % 50 === 0 || (successCount + failCount) === items.length) {
        process.stdout.write(`  ⏳ Tiến độ: ${successCount + failCount}/${items.length} (Thành công: ${successCount}, Lỗi: ${failCount})\r`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(workers);
  console.log(`\n  ✅ Hoàn tất: ${successCount} thành công, ${failCount} lỗi.`);
  return { successCount, failCount };
}

// 1. Ranh Giới Hoàng Hôn - Bản gốc tiếng Trung (885 chương)
async function syncRawRanhGioi() {
  const bookId = "qidian-1036575193";
  const bookTitle = "Ranh Giới Hoàng Hôn";
  const rawDir = path.resolve(__dirname, "..", ".cache", "clone-raw", "huanghunfenjie");
  if (!fs.existsSync(rawDir)) return;

  console.log(`\n🇨🇳 Đang đồng bộ bản gốc Trung: ${bookTitle} (${bookId})...`);
  const files = fs.readdirSync(rawDir).filter((f) => f.match(/^ch_(\d+)\.json$/));
  const items = files.map((f) => {
    const num = Number(f.match(/^ch_(\d+)\.json$/)[1]);
    return {
      filePath: path.join(rawDir, f),
      num,
      key: `books/${bookId}/r1/ch/${num}.original.json`,
      bookTitle,
      bookId
    };
  }).sort((a, b) => a.num - b.num);

  console.log(`  Tìm thấy ${items.length} chương gốc.`);
  await runQueue(items, 5, async (item) => {
    const raw = JSON.parse(fs.readFileSync(item.filePath, "utf8"));
    const payload = {
      schema: 1,
      bookId: item.bookId,
      revision: 1,
      chapterNumber: item.num,
      title: raw.title || `第${item.num}章`,
      content: raw.content || ""
    };
    await storage.put(item.key, JSON.stringify(payload, null, 2), {
      contentType: "application/json; charset=utf-8",
      bookTitle: item.bookTitle,
      skipFind: true
    });
  });
}

// 2. Cấp Cấp Như Luật Lệnh - Bản gốc tiếng Trung (165 chương)
async function syncRawCapCap() {
  const bookId = "qidian-1049745989";
  const bookTitle = "Cấp Cấp Như Luật Lệnh";
  const rawDir = path.resolve(__dirname, "..", ".cache", "clone-raw", "jijirululing");
  if (!fs.existsSync(rawDir)) return;

  console.log(`\n🇨🇳 Đang đồng bộ bản gốc Trung: ${bookTitle} (${bookId})...`);
  const files = fs.readdirSync(rawDir).filter((f) => f.match(/^ch_(\d+)\.json$/));
  const items = files.map((f) => {
    const num = Number(f.match(/^ch_(\d+)\.json$/)[1]);
    return {
      filePath: path.join(rawDir, f),
      num,
      key: `books/${bookId}/r1/ch/${num}.original.json`,
      bookTitle,
      bookId
    };
  }).sort((a, b) => a.num - b.num);

  console.log(`  Tìm thấy ${items.length} chương gốc.`);
  await runQueue(items, 5, async (item) => {
    const raw = JSON.parse(fs.readFileSync(item.filePath, "utf8"));
    const payload = {
      schema: 1,
      bookId: item.bookId,
      revision: 1,
      chapterNumber: item.num,
      title: raw.title || `第${item.num}章`,
      content: raw.content || ""
    };
    await storage.put(item.key, JSON.stringify(payload, null, 2), {
      contentType: "application/json; charset=utf-8",
      bookTitle: item.bookTitle,
      skipFind: true
    });
  });
}

// 3. Bắt Đầu Từ Trăng Đỏ - Bản gốc tiếng Trung (909 chương)
async function syncRawTrangDo() {
  const bookId = "qidian-1024868626";
  const bookTitle = "Bắt Đầu Từ Trăng Đỏ";
  const rawDir = path.resolve(__dirname, "..", ".crawler-data", "qidian", ".cache-1024868626");
  if (!fs.existsSync(rawDir)) return;

  console.log(`\n🇨🇳 Đang đồng bộ bản gốc Trung: ${bookTitle} (${bookId})...`);
  const files = fs.readdirSync(rawDir).filter((f) => f.match(/^ch_(\d+)\.json$/));
  const items = files.map((f) => {
    const num = Number(f.match(/^ch_(\d+)\.json$/)[1]);
    return {
      filePath: path.join(rawDir, f),
      num,
      key: `books/${bookId}/r1/ch/${num}.original.json`,
      bookTitle,
      bookId
    };
  }).sort((a, b) => a.num - b.num);

  console.log(`  Tìm thấy ${items.length} chương gốc.`);
  await runQueue(items, 5, async (item) => {
    const raw = JSON.parse(fs.readFileSync(item.filePath, "utf8"));
    const payload = {
      schema: 1,
      bookId: item.bookId,
      revision: 1,
      chapterNumber: item.num,
      title: raw.title || `第${item.num}章`,
      content: raw.content || ""
    };
    await storage.put(item.key, JSON.stringify(payload, null, 2), {
      contentType: "application/json; charset=utf-8",
      bookTitle: item.bookTitle,
      skipFind: true
    });
  });
}

async function main() {
  console.log("===================================================================");
  console.log("   🇨🇳 ĐỒNG BỘ BẢN GỐC TIẾNG TRUNG TỪNG BỘ TRUYỆN LÊN GOOGLE DRIVE");
  console.log("===================================================================");

  await syncRawRanhGioi();
  await syncRawCapCap();
  await syncRawTrangDo();

  console.log("\n🎉 HOÀN TẤT ĐỒNG BỘ TOÀN BỘ BẢN GỐC TIẾNG TRUNG LÊN GOOGLE DRIVE!");
}

main().catch(console.error);
