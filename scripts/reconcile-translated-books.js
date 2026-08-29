"use strict";

const fs = require("fs");
const path = require("path");

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

const ROOT = path.join(__dirname, "..");
const env = {
  ...parseEnvFile(path.join(ROOT, ".env")),
  ...parseEnvFile(path.join(ROOT, ".env.local")),
  ...process.env
};

const { createStorage } = require("../server/storage/index");
const { createSupabase } = require("../server/supabase");
const { buildBookIndex } = require("../server/ingest/documents");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const ONLY_BOOK = flag("--book", "");
const BOOK_CONCURRENCY = Math.max(1, Number(flag("--concurrency", "4")));
const CHAPTER_BATCH_SIZE = Math.max(10, Number(flag("--batch-size", "50")));
const FORCE_SNAPSHOT = args.includes("--force-snapshot") || args.includes("--snapshot");

function hasChinese(text) {
  return /[\u4e00-\u9fa5]/.test(String(text || ""));
}

async function reconcileSingleBook(book, storage, db, idx, totalCount) {
  const bookId = book.id;
  try {
    const indexRaw = await storage.get(`books/${bookId}/index.json`);
    if (!indexRaw) return null;
    const index = JSON.parse(indexRaw.toString("utf8"));
    const title = index.title || book.title || bookId;
    const chapters = index.chapters || [];
    const totalChapters = chapters.length;

    if (totalChapters === 0) return null;

    let actualCompleted = 0;
    let changed = false;

    // Check all chapters in parallel batches
    for (let b = 0; b < chapters.length; b += CHAPTER_BATCH_SIZE) {
      const slice = chapters.slice(b, b + CHAPTER_BATCH_SIZE);
      const results = await Promise.all(
        slice.map(async (ch, sIdx) => {
          const chNum = ch.n || ch.chapterNumber || (b + sIdx + 1);
          const raw = await storage.get(`books/${bookId}/r1/ch/${chNum}.json`).catch(() => null);
          if (!raw) return { chNum, completed: false };
          try {
            const doc = JSON.parse(raw.toString("utf8"));
            const content = String(doc.content || "").trim();
            const isDone = content.length >= 80 && !hasChinese(content);
            return { chNum, completed: isDone, provider: doc.provider, model: doc.model, qaReviewed: doc.qaReviewed };
          } catch {
            return { chNum, completed: false };
          }
        })
      );

      for (let sIdx = 0; sIdx < results.length; sIdx++) {
        const res = results[sIdx];
        const ch = slice[sIdx];
        if (res.completed) {
          actualCompleted++;
          if (ch.status !== "completed" || ch.translationStatus !== "completed") {
            ch.status = "completed";
            ch.translationStatus = "completed";
            ch.provider = res.provider || ch.provider || "hachimi";
            ch.model = res.model || ch.model || "HachimiMT-60-QT";
            if (res.qaReviewed) ch.qaReviewed = true;
            changed = true;
          }
        }
      }
    }

    const recordedCompleted = index.translatedChapters || 0;
    const isNowFull = totalChapters > 0 && actualCompleted >= totalChapters;
    const targetStatus = isNowFull ? "Hoàn thành" : (index.status || "Đang cập nhật");

    const needsUpdate =
      actualCompleted !== recordedCompleted ||
      changed ||
      (isNowFull && index.status !== "Hoàn thành") ||
      (book.status !== targetStatus) ||
      (book.translated_chapters !== actualCompleted);

    if (needsUpdate) {
      index.translatedChapters = actualCompleted;
      index.status = targetStatus;
      index.updatedAt = new Date().toISOString();

      const updatedIndexDoc = buildBookIndex({
        book: {
          ...index,
          id: bookId
        },
        revision: index.revision || 1,
        chapters: index.chapters
      });
      await storage.put(`books/${bookId}/index.json`, JSON.stringify(updatedIndexDoc));

      if (db) {
        await db.updateBookProgress(bookId, {
          totalChapters,
          translatedChapters: actualCompleted,
          status: targetStatus,
          revision: index.revision || 1
        }).catch((err) => console.warn(`  [${bookId}] Lỗi update Supabase:`, err.message));
      }

      console.log(
        `✅ [${idx + 1}/${totalCount}] Đã đồng bộ [${title}]: ${recordedCompleted} ➔ ${actualCompleted}/${totalChapters} ch ${
          isNowFull ? "🎉 (HOÀN THÀNH 100%)" : ""
        }`
      );

      return {
        bookId,
        title,
        before: recordedCompleted,
        after: actualCompleted,
        total: totalChapters,
        isFull: isNowFull
      };
    } else {
      return null;
    }
  } catch (err) {
    console.warn(`❌ Lỗi đối soát bộ ${bookId}:`, err.message);
    return null;
  }
}

async function reconcileBooks() {
  const storage = createStorage(env);
  const db = createSupabase(env);

  console.log("==========================================================================");
  console.log("   🔄 BẮT ĐẦU ĐỐI SOÁT & ĐỒNG BỘ TRẠNG THÁI DỊCH FULL CHO TOÀN BỘ THƯ VIỆN");
  console.log("==========================================================================\n");

  let books = [];
  if (db) {
    books = await db.listBooks({ limit: 1000 });
  }

  if (ONLY_BOOK) {
    books = books.filter((b) => b.id === ONLY_BOOK);
    if (!books.length) {
      books = [{ id: ONLY_BOOK, title: ONLY_BOOK }];
    }
    console.log(`- Chế độ đơn bộ truyện: ${ONLY_BOOK}\n`);
  } else {
    console.log(`- Tìm thấy ${books.length} bộ truyện trong thư viện. Bắt đầu đối soát R2 storage (song song ${BOOK_CONCURRENCY} luồng)...\n`);
  }

  let fixedBooksCount = 0;
  let fullBooksCount = 0;
  const fixedList = [];

  // Parallel queue for books
  for (let i = 0; i < books.length; i += BOOK_CONCURRENCY) {
    const chunk = books.slice(i, i + BOOK_CONCURRENCY);
    const results = await Promise.all(
      chunk.map((b, cIdx) => reconcileSingleBook(b, storage, db, i + cIdx, books.length))
    );

    for (const res of results) {
      if (res) {
        fixedBooksCount++;
        if (res.isFull) fullBooksCount++;
        fixedList.push(res);
      }
    }
  }

  // Luôn xuất bản lại catalog snapshot nếu có sửa đổi hoặc có cờ --force-snapshot
  if (db && (fixedBooksCount > 0 || FORCE_SNAPSHOT || books.length > 0)) {
    console.log("\n📦 Đang cập nhật Catalog Snapshot và Reader Cache (catalog/latest.json)...");
    const snap = await publishCatalogSnapshot({
      storage,
      db,
      site: { name: "Trạm Chữ", tagline: "Một góc đọc truyện Trung được tuyển chọn và dịch." }
    }).catch((err) => console.error("Lỗi xuất bản snapshot:", err.message));
    if (snap && snap.books) {
      console.log(`✅ Đã xuất bản thành công snapshot với ${snap.books.length} bộ truyện lên CDN!`);
    }
  }

  console.log("\n==========================================================================");
  console.log("🎉 HOÀN TẤT ĐỐI SOÁT & ĐỒNG BỘ THƯ VIỆN!");
  console.log(`- Tổng số bộ truyện được sửa & đồng bộ lại: ${fixedBooksCount} bộ`);
  console.log(`- Tổng số bộ truyện đạt trạng thái FULL 100%: ${fullBooksCount} bộ`);
  console.log("==========================================================================\n");

  if (fixedList.length > 0) {
    console.log("📋 CHI TIẾT CÁC BỘ VỪA ĐƯỢC PHỤC HỒI TIẾN ĐỘ:");
    for (const item of fixedList) {
      console.log(
        `- [${item.title}] (ID: ${item.bookId}): Tiến độ cũ ${item.before} ch ➔ Tiến độ chuẩn ${item.after}/${item.total} ch ${
          item.isFull ? "⭐ FULL" : ""
        }`
      );
    }
  }
}

if (require.main === module) {
  reconcileBooks().catch(console.error);
}

module.exports = { reconcileBooks, reconcileSingleBook };
