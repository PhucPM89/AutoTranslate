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

function hasChinese(text) {
  return /[\u4e00-\u9fa5]/.test(String(text || ""));
}

async function reconcileBooks() {
  const storage = createStorage(env);
  const db = createSupabase(env);

  console.log("==========================================================================");
  console.log("   🔄 BẮT ĐẦU ĐỐI SOÁT & ĐỒNG BỘ TRẠNG THÁI DỊCH FULL CHO TOÀN BỘ THƯ VIỆN");
  console.log("==========================================================================\n");

  let books = [];
  if (db) {
    books = await db.listBooks({ limit: 300 });
  }

  console.log(`- Tìm thấy ${books.length} bộ truyện trong thư viện. Bắt đầu đối soát R2 storage...\n`);

  let fixedBooksCount = 0;
  let fullBooksCount = 0;
  const fixedList = [];

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const bookId = book.id;

    try {
      const indexRaw = await storage.get(`books/${bookId}/index.json`);
      if (!indexRaw) continue;
      const index = JSON.parse(indexRaw.toString("utf8"));
      const title = index.title || book.title || bookId;
      const chapters = index.chapters || [];
      const totalChapters = chapters.length;

      if (totalChapters === 0) continue;

      let actualCompleted = 0;
      let changed = false;

      // Check all chapters in parallel batches
      const batchSize = 50;
      for (let b = 0; b < chapters.length; b += batchSize) {
        const slice = chapters.slice(b, b + batchSize);
        const results = await Promise.all(slice.map(async (ch, sIdx) => {
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
        }));

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
      const isNowFull = actualCompleted >= totalChapters;

      if (actualCompleted !== recordedCompleted || changed || (isNowFull && index.status !== "Hoàn thành")) {
        index.translatedChapters = actualCompleted;
        if (isNowFull) {
          index.status = "Hoàn thành";
          fullBooksCount++;
        }

        index.updatedAt = new Date().toISOString();
        const updatedIndexDoc = buildBookIndex({
          book: index,
          revision: index.revision || 1,
          chapters: index.chapters
        });
        await storage.put(`books/${bookId}/index.json`, JSON.stringify(updatedIndexDoc));

        if (db) {
          await db.updateBookProgress(bookId, {
            totalChapters,
            translatedChapters: actualCompleted,
            revision: index.revision || 1
          }).catch(() => {});

          await db.upsertChapters(bookId, index.revision || 1, index.chapters.map(c => ({
            chapterNumber: c.n || c.chapterNumber,
            title: c.title,
            translationStatus: c.status || c.translationStatus,
            provider: c.provider,
            model: c.model
          }))).catch(() => {});
        }

        fixedBooksCount++;
        fixedList.push({
          bookId,
          title,
          before: recordedCompleted,
          after: actualCompleted,
          total: totalChapters,
          isFull: isNowFull
        });

        console.log(`✅ [${i + 1}/${books.length}] Đã đồng bộ [${title}]: ${recordedCompleted} ➔ ${actualCompleted}/${totalChapters} ch ${isNowFull ? "🎉 (HOÀN THÀNH 100%)" : ""}`);
      }
    } catch (err) {
      console.warn(`❌ Lỗi đối soát bộ ${bookId}:`, err.message);
    }
  }

  // Publish fresh catalog snapshot for reader UI
  if (db) {
    console.log("\n📦 Đang cập nhật Catalog Snapshot và Reader Cache...");
    await publishCatalogSnapshot({ storage, db, site: { name: "Trạm Chữ", tagline: "Một góc đọc truyện Trung được tuyển chọn và dịch." } }).catch(() => {});
  }

  console.log("\n==========================================================================");
  console.log("🎉 HOÀN TẤT ĐỐI SOÁT & ĐỒNG BỘ THƯ VIỆN!");
  console.log(`- Tổng số bộ truyện được sửa & đồng bộ lại: ${fixedBooksCount} bộ`);
  console.log(`- Tổng số bộ truyện đạt trạng thái FULL 100%: ${fullBooksCount} bộ`);
  console.log("==========================================================================\n");

  if (fixedList.length > 0) {
    console.log("📋 CHI TIẾT CÁC BỘ VỪA ĐƯỢC PHỤC HỒI TIẾN ĐỘ:");
    for (const item of fixedList) {
      console.log(`- [${item.title}] (ID: ${item.bookId}): Tiến độ cũ ${item.before} ch ➔ Tiến độ chuẩn ${item.after}/${item.total} ch ${item.isFull ? "⭐ FULL" : ""}`);
    }
  }
}

reconcileBooks().catch(console.error);
