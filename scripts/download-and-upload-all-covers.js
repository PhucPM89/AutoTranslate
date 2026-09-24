"use strict";

const fs = require("fs");
const path = require("path");

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
const { createSupabase } = require("../server/supabase");

const storage = createDriveStorage(process.env);
const supa = createSupabase(process.env);

// Fallback image from disk if external source fails
const localDefaultCoverPath = path.resolve(__dirname, "..", "public", "library", "covers", "default-cover.webp");
const localDefaultCoverBuf = fs.existsSync(localDefaultCoverPath) ? fs.readFileSync(localDefaultCoverPath) : null;

async function fetchFanqieCover(bookId) {
  const sourceId = bookId.replace(/^fanqie-/, "");
  const pageUrl = `https://fanqienovel.com/page/${sourceId}`;
  try {
    const res = await fetch(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/https:\/\/[^"']*(?:novel-pic|novel-images)[^"']*/);
    if (!match) return null;
    const imgUrl = match[0].replace(/&amp;/g, "&");
    const imgRes = await fetch(imgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://fanqienovel.com/"
      },
      signal: AbortSignal.timeout(10000)
    });
    if (imgRes.ok) {
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.length > 500) return buf;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function fetchQidianCover(bookId) {
  const sourceId = bookId.replace(/^qidian-/, "");
  const url = `https://bookcover.yuewen.com/qdbimg/349573/${sourceId}/600`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 500) return buf;
    }
  } catch (e) {}
  return null;
}

async function fetchAnyCover(book) {
  // 1. If Fanqie
  if (book.id.startsWith("fanqie-")) {
    const buf = await fetchFanqieCover(book.id);
    if (buf) return { buffer: buf, type: "image/jpeg" };
  }

  // 2. If Qidian
  if (book.id.startsWith("qidian-")) {
    const buf = await fetchQidianCover(book.id);
    if (buf) return { buffer: buf, type: "image/jpeg" };
  }

  // 3. Special cases
  if (book.id === "bianhua-6269") {
    // Huyen Giam Tien Toc on Qidian
    const buf = await fetchQidianCover("qidian-1036329718");
    if (buf) return { buffer: buf, type: "image/jpeg" };
  }

  // 4. Try book.cover_url if http
  if (book.cover_url && book.cover_url.startsWith("http")) {
    try {
      const res = await fetch(book.cover_url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 500) return { buffer: buf, type: res.headers.get("content-type") || "image/jpeg" };
      }
    } catch {}
  }

  // 5. Fallback clean cover
  if (localDefaultCoverBuf) {
    return { buffer: localDefaultCoverBuf, type: "image/webp" };
  }

  return null;
}

async function main() {
  console.log("===================================================================");
  console.log("   🖼️  TẢI VÀ ĐỒNG BỘ 100% ẢNH BÌA GỐC CÁC BỘ TRUYỆN LÊN GOOGLE DRIVE");
  console.log("===================================================================\n");

  const rows = await supa.listBooks({ limit: 1000 });
  const books = rows.filter(b => b && b.id && b.title && b.title.trim().length > 0);
  console.log(`Tìm thấy ${books.length} bộ truyện cần kiểm tra ảnh bìa.\n`);

  let alreadyCount = 0;
  let downloadedCount = 0;
  let fallbackCount = 0;

  // Process with concurrency 5
  const concurrency = 5;
  for (let i = 0; i < books.length; i += concurrency) {
    const chunk = books.slice(i, i + concurrency);
    await Promise.all(chunk.map(async (book, idx) => {
      const bookIdx = i + idx + 1;
      const key = `covers/${book.id}.jpg`;
      
      try {
        const existing = await storage.head(key);
        if (existing && existing.size > 2000) {
          alreadyCount++;
          console.log(`[${bookIdx}/${books.length}] ⏭️ Bìa đã tồn tại: ${book.title.slice(0, 30)} (${existing.size} B)`);
          return;
        }
      } catch (_) {}

      console.log(`[${bookIdx}/${books.length}] ⏳ Đang lấy ảnh bìa: ${book.title.slice(0, 30)} (${book.id})...`);
      const result = await fetchAnyCover(book);
      if (result && result.buffer) {
        await storage.put(key, result.buffer, {
          contentType: result.type,
          skipFind: true
        });
        downloadedCount++;
        console.log(`[${bookIdx}/${books.length}] ✅ ĐÃ TẢI VÀ LƯU DRIVE: ${book.title.slice(0, 30)} (${result.buffer.length} B)`);
      } else {
        fallbackCount++;
        console.log(`[${bookIdx}/${books.length}] ❌ Không lấy được bìa: ${book.title.slice(0, 30)}`);
      }
    }));
  }

  console.log("\n===================================================================");
  console.log(`🎉 HOÀN TẤT ĐỒNG BỘ ẢNH BÌA:`);
  console.log(`   - Đã có sẵn: ${alreadyCount}`);
  console.log(`   - Tải mới thành công: ${downloadedCount}`);
  console.log(`   - Fallback/Thất bại: ${fallbackCount}`);
  console.log("===================================================================");
}

main().catch(console.error);
