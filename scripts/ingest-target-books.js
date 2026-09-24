"use strict";

const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
for (const envName of [".env", ".env.local"]) {
  const envFile = path.join(ROOT, envName);
  if (!fsSync.existsSync(envFile)) continue;
  for (const line of fsSync.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      let val = match[2].trim();
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      process.env[match[1]] = val;
    }
  }
}

const { runIngest } = require("../server/ingest/run-ingest");
const DATA_DIR = path.join(ROOT, ".crawler-data");

const TARGET_BOOKS = [
  {
    id: "qidian-1036575193",
    epubFile: "qidian-1036575193-huanghunfenjie.epub",
    title: "Ranh Giới Hoàng Hôn",
    author: "Hắc Sơn Lão Quỷ",
    genre: "Linh dị / Kinh dị",
    cover: "https://cdn.tram-chu.online/books/qidian-1036575193/cover.jpg",
    description: "Hoàng hôn làm ranh giới, âm dương phân chia. Khi máu thịt của Tà Thần từ các vết nứt của đại địa chen chúc tuôn trào ra, hóa thành những dãy núi máu thịt xuất hiện khắp nơi. Có người sợ hãi, có người bái lạy, có người thắp hương cúng tế. Cũng có người nếm thử, ồ, mùi vị không tệ? Thế là, máu thịt biến thành hoa màu, người ta tham lam thu hoạch, tranh đoạt, tẩu quỷ vấn linh bái tổ tông. Hồ Ma từ trong nỗi sợ hãi chuyển sinh tới, ăn thái tuế, dưỡng lò lửa, nếm đủ gian truân, cùng tà túy khắp nơi tranh đoạt mạng sống, sau đó... Cái gì? Ta mới là tà túy?",
    source: "qidian",
    sourceId: "1036575193",
    sourceUrl: "https://www.qidian.com/book/1036575193/"
  },
  {
    id: "qidian-1049745989",
    epubFile: "qidian-1049745989-jijirululing.epub",
    title: "Cấp Cấp Như Luật Lệnh",
    author: "Hắc Sơn Lão Quỷ",
    genre: "Linh dị / Kinh dị",
    cover: "https://cdn.tram-chu.online/books/qidian-1049745989/cover.jpg",
    description: "Ngày hai mươi ba tháng hai, năm Tân Mùi, tháng Nhâm Thìn, ngày Đinh Mùi, mọi sự đều kiêng kỵ. Các ngươi linh dị mới hồi phục sao? Ta đã bị quỷ quấn thân hơn hai năm rồi! Ngoài ra, ngươi nói pháp môn hung hiểm nhất trên thế gian này, là do ta tạo ra?",
    source: "qidian",
    sourceId: "1049745989",
    sourceUrl: "https://www.qidian.com/book/1049745989/"
  }
];

const { createSupabase } = require("../server/supabase");

async function main() {
  const { createStorage, LAYOUT } = require("../server/storage");
  const storage = createStorage(process.env);
  const db = createSupabase(process.env, { role: "service" });

  for (const book of TARGET_BOOKS) {
    const epubPath = path.join(DATA_DIR, book.epubFile);
    if (!fsSync.existsSync(epubPath)) {
      console.log(`\n [CHỜ] Chưa có file EPUB: ${book.epubFile} (đang được tải hoặc chưa tạo). Bỏ qua tạm thời.`);
      continue;
    }

    const indexHead = await storage.head(LAYOUT.bookIndex(book.id));
    if (indexHead) {
      console.log(`\n [ĐÃ CÓ] Sách "${book.title}" (${book.id}) đã được nạp trước đó trên R2.`);
      if (db) {
        await db.setBookCategory(book.id, 2).catch(() => {});
        if (book.cover) {
          await db.request("books", {
            method: "PATCH",
            query: `?id=eq.${encodeURIComponent(book.id)}`,
            body: { cover_url: book.cover, updated_at: new Date().toISOString() }
          }).catch(() => {});
        }
      }
      continue;
    }

    console.log(`\n Đang nạp sách: "${book.title}" (${book.id})...`);
    const epubBuffer = await fs.readFile(epubPath);
    console.log(`  File size: ${(epubBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    const result = await runIngest({
      epubBuffer,
      book: {
        id: book.id,
        title: book.title,
        author: book.author,
        genre: book.genre,
        cover: book.cover,
        description: book.description,
        source: book.source,
        sourceId: book.sourceId,
        sourceUrl: book.sourceUrl
      },
      revision: 1,
      translateEnabled: false,
      log: (event) => {
        if (event.event === "ingest.started") console.log(`  [INGEST] Bắt đầu ingest revision ${event.revision}`);
        if (event.event === "ingest.chapters_extracted") console.log(`  [INGEST] Trích xuất ${event.chapters} chương`);
        if (event.event === "ingest.completed") console.log(`  [INGEST] Hoàn tất: ${event.totalChapters} chương đã xếp hàng dịch`);
      }
    });

    console.log(` Hoàn tất nạp "${book.title}": ${result.totalChapters} chương.`);

    // Đảm bảo thể loại "Linh dị / Kinh dị" và cover_url được liên kết chính xác trong Supabase
    if (db) {
      try {
        await db.setBookCategory(book.id, 2); // 2: Linh dị / Kinh dị
        if (book.cover) {
          await db.request("books", {
            method: "PATCH",
            query: `?id=eq.${encodeURIComponent(book.id)}`,
            body: { cover_url: book.cover, updated_at: new Date().toISOString() }
          });
        }
        console.log(`  [SUPABASE] Đã liên kết thể loại "${book.genre}" và ảnh bìa.`);
      } catch (err) {
        console.warn(`  [SUPABASE] Lỗi liên kết thể loại:`, err.message);
      }
    }
  }

  console.log("\n Tất cả truyện đã được nạp thành công vào thư viện!");
}

if (require.main === module) {
  main().catch(err => {
    console.error("\n[INGEST THẤT BẠI]:", err.message);
    process.exit(1);
  });
}

module.exports = { TARGET_BOOKS };
