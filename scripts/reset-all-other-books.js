"use strict";

const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        let val = match[2].trim();
        if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
        process.env[match[1]] = val;
      }
    }
  }
}

loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { createJobState } = require("../server/ingest/translation-queue");

const PROTECTED_BOOK_ID = "fanqie-7027679289931729920"; // Ác Mộng Cầu Sinh (đang dịch mới)

async function main() {
  console.log(`\n===============================================================`);
  console.log(` BẮT ĐẦU XÓA BẢN DỊCH CŨ CỦA TOÀN BỘ CÁC BỘ TRUYỆN KHÁC`);
  console.log(` Giữ nguyên bản dịch mới của: ${PROTECTED_BOOK_ID}`);
  console.log(`===============================================================\n`);

  const storage = createStorage();
  const supabase = createSupabase(process.env);
  const allBooks = await supabase.listBooks({ limit: 1000 });

  const targetBooks = allBooks.filter((b) => b.id !== PROTECTED_BOOK_ID && (b.translated_chapters > 0 || b.status === "completed"));
  console.log(`Tìm thấy ${targetBooks.length} bộ truyện có bản dịch cũ cần reset:\n`);

  for (const book of targetBooks) {
    const bookId = book.id;
    const title = book.title || bookId;
    console.log(`-> Đang reset bộ: "${title}" (${bookId})...`);

    // 1. Xóa các chapter reader (.json) cũ, giữ nguyên *.original.json
    try {
      const items = await storage.list(`books/${bookId}/`);
      const keys = items.map((i) => (typeof i === "string" ? i : i.key));
      const translatedKeys = keys.filter((k) => k.match(/\/ch\/\d+\.json$/) && !k.endsWith(".original.json"));

      if (translatedKeys.length > 0) {
        const chunkSize = 30;
        for (let i = 0; i < translatedKeys.length; i += chunkSize) {
          const chunk = translatedKeys.slice(i, i + chunkSize);
          await Promise.all(chunk.map((k) => storage.remove(k)));
        }
        console.log(`   - Đã xóa ${translatedKeys.length} chương dịch cũ trên R2.`);
      }
    } catch (e) {
      console.warn(`   ! Cảnh báo xóa file: ${e.message}`);
    }

    // 2. Reset index.json
    try {
      const rawIdx = await storage.get(`books/${bookId}/r1/index.json`) || await storage.get(`books/${bookId}/index.json`);
      if (rawIdx) {
        const indexDoc = JSON.parse(rawIdx.toString("utf8"));
        const chapters = Array.isArray(indexDoc.chapters) ? indexDoc.chapters : [];
        const nextIndex = {
          ...indexDoc,
          chapters: chapters.map((c) => ({
            ...c,
            status: "pending",
            translationStatus: "pending",
            translated: false,
            translatedAt: null,
            updatedAt: new Date().toISOString()
          })),
          translatedChapters: 0,
          approvedChapters: 0,
          draftedChapters: 0,
          status: "Đang cập nhật",
          updatedAt: new Date().toISOString()
        };
        const indexBuf = Buffer.from(JSON.stringify(nextIndex, null, 2), "utf8");
        await storage.put(`books/${bookId}/r1/index.json`, indexBuf, "application/json");
        await storage.put(`books/${bookId}/index.json`, indexBuf, "application/json");
        console.log(`   - Đã reset index: 0/${chapters.length} chương.`);

        // 3. Reset job state
        const job = createJobState({
          bookId,
          revision: Number(indexDoc.revision || 1),
          chapters: chapters.map((c) => ({
            chapterNumber: c.n || c.chapterNumber || c.id
          }))
        });
        job.forceRetranslateAll = true;
        job.resetAt = new Date().toISOString();
        await storage.put(`jobs/${bookId}/translation.json`, JSON.stringify(job, null, 2), "application/json");
        console.log(`   - Đã reset queue trạng thái.`);
      }
    } catch (e) {
      console.warn(`   ! Cảnh báo reset index/job: ${e.message}`);
    }

    // 4. Update Supabase
    try {
      await supabase.updateBookProgress(bookId, {
        translatedChapters: 0,
        status: "Đang cập nhật"
      });
      console.log(`   - Đã cập nhật database: 0 chương.`);
    } catch (e) {
      console.warn(`   ! Cảnh báo cập nhật db: ${e.message}`);
    }

    console.log(`   ✓ Xong "${title}".\n`);
  }

  console.log(`===============================================================`);
  console.log(`✓ HOÀN TẤT RESET! Toàn bộ các bản dịch cũ đã được xóa sạch.`);
  console.log(`  Hệ thống sẽ dịch mới 100% từng bộ truyện bằng Gemini Web!`);
  console.log(`===============================================================\n`);
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
