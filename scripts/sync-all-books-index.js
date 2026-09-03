"use strict";

const fs = require("fs");
const path = require("path");

function loadEnv(file) {
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
loadEnv(path.join(__dirname, "..", ".env"));
loadEnv(path.join(__dirname, "..", ".env.local"));

const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { extractTitleFromContent, formatVietnameseChapterTitle, isFrontmatterSection } = require("../client/chapter-title");

async function syncBookIndex(storage, book) {
  const bookId = book.id;
  const rawIdx = await storage.get(`books/${bookId}/r1/index.json`) || await storage.get(`books/${bookId}/index.json`);
  if (!rawIdx) {
    console.log(`- [${book.title}] Không tìm thấy index.json trên R2.`);
    return;
  }
  
  const indexDoc = JSON.parse(rawIdx.toString("utf8"));
  const total = indexDoc.chapters.length;
  console.log(`\n📚 Đang đồng bộ tiêu đề cho bộ: "${book.title}" (${total} chương)...`);
  
  let updatedCount = 0;
  let translatedCount = 0;
  
  // Scan chapters in concurrency batches of 25
  const BATCH_SIZE = 25;
  for (let start = 0; start < total; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE, total);
    const promises = [];
    
    for (let i = start; i < end; i++) {
      const chNum = i + 1;
      promises.push((async () => {
        const raw = await storage.get(`books/${bookId}/r1/ch/${chNum}.json`);
        if (!raw) return;
        const doc = JSON.parse(raw.toString("utf8"));
        
        let title = doc.title || "";
        const content = doc.content || "";
        const extracted = extractTitleFromContent(content);
        
        if (extracted) {
          title = extracted;
        } else if (title) {
          title = formatVietnameseChapterTitle(title, chNum, content);
        }
        
        if (title && title !== `Chương ${chNum}`) {
          indexDoc.chapters[i].title = title;
          updatedCount++;
        }
        if (doc.translationStatus === "completed" || (content && !/[\u4e00-\u9fa5]{20,}/.test(content))) {
          indexDoc.chapters[i].status = "completed";
          translatedCount++;
        }
      })());
    }
    
    await Promise.all(promises);
  }
  
  // Fix first 3 sections if recognized as frontmatter
  if (indexDoc.chapters[0] && (indexDoc.chapters[0].title === "Chương 1" || /giới thiệu/i.test(indexDoc.chapters[0].title))) {
    indexDoc.chapters[0].title = "Giới thiệu";
  }
  if (indexDoc.chapters[1] && (indexDoc.chapters[1].title === "Chương 2" || /mục lục/i.test(indexDoc.chapters[1].title))) {
    indexDoc.chapters[1].title = "Mục lục";
  }
  if (indexDoc.chapters[2] && (indexDoc.chapters[2].title === "Chương 3" || /chính văn|nội dung chính/i.test(indexDoc.chapters[2].title))) {
    indexDoc.chapters[2].title = "Nội dung chính";
  }
  
  indexDoc.translatedChapters = translatedCount;
  indexDoc.updatedAt = new Date().toISOString();
  
  const updatedBuffer = Buffer.from(JSON.stringify(indexDoc, null, 2), "utf8");
  await storage.put(`books/${bookId}/r1/index.json`, updatedBuffer, "application/json");
  await storage.put(`books/${bookId}/index.json`, updatedBuffer, "application/json");
  console.log(`  └─ Hoàn tất: Cập nhật ${updatedCount} tiêu đề, ${translatedCount} chương đã dịch.`);
}

async function main() {
  const db = createSupabase(process.env);
  const storage = createStorage();
  const rows = await db.listBooks({ limit: 100 });
  console.log(`=== BẮT ĐẦU ĐỒNG BỘ TOÀN BỘ ${rows.length} BỘ TRUYỆN TRÊN HỆ THỐNG ===`);
  
  for (const book of rows) {
    try {
      await syncBookIndex(storage, book);
    } catch (err) {
      console.error(`Lỗi khi đồng bộ bộ "${book.title}":`, err.message);
    }
  }
  
  console.log("\n========================================================");
  console.log("✓ ĐÃ HOÀN TẤT ĐỒNG BỘ TIÊU ĐỀ VÀ PHÂN TÁCH MỞ ĐẦU CHO TOÀN BỘ TRUYỆN TRÊN HỆ THỐNG!");
}

main().catch(console.error);
