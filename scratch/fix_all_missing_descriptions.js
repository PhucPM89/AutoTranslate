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

delete require.cache[require.resolve("../server/gemini")];
const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { translateMetadata } = require("../server/gemini");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");

function hasHan(s) {
  return /[\u4e00-\u9fa5]/.test(String(s || ""));
}

async function fetchFanqieMeta(bookId) {
  const cleanId = bookId.replace("fanqie-", "");
  const urls = [
    `https://fanqienovel.com/page/${cleanId}`,
    `https://fanqienovel.com/api/reader/full?bookId=${cleanId}`,
    `https://novel.snssdk.com/api/novel/book/directory/list/v1/?book_id=${cleanId}`
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        signal: AbortSignal.timeout(7000)
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (url.includes("fanqienovel.com/page/")) {
        const titleMatch = text.match(/<h1 class="info-name"[^>]*>([\s\S]*?)<\/h1>/i) || text.match(/<div class="page-header-title"[^>]*>([\s\S]*?)<\/div>/i);
        const authorMatch = text.match(/<span class="author-name-text"[^>]*>([\s\S]*?)<\/span>/i) || text.match(/<div class="page-header-author"[^>]*>([\s\S]*?)<\/div>/i);
        const descMatch = text.match(/<div class="page-abstract-content"[^>]*>([\s\S]*?)<\/div>/i) || text.match(/<div class="abstract-content"[^>]*>([\s\S]*?)<\/div>/i) || text.match(/<p class="abstract"[^>]*>([\s\S]*?)<\/p>/i);
        
        return {
          title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "",
          author: authorMatch ? authorMatch[1].replace(/<[^>]+>/g, "").trim() : "",
          description: descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : ""
        };
      } else {
        const data = JSON.parse(text);
        const info = data?.data?.book_info || data?.data;
        if (info) {
          return {
            title: info.book_name || info.title || "",
            author: info.author || "",
            description: info.abstract || info.description || ""
          };
        }
      }
    } catch {}
  }
  return null;
}

const SPECIAL_DESCRIPTIONS = {
  "mieu-cuong-co-su": {
    title: "Miêu Cương Cổ Sự",
    author: "Nam Vô Già Sa",
    description: "Miêu Cương Cổ Sự kể về câu chuyện truyền kỳ kỳ bí chốn rừng sâu núi thẳm Miêu Cương. Nhân vật chính Lục Tả từ nhỏ đã vô tình được kế thừa bản mệnh Kim Tàm Cổ từ người bà là một Miêu Cổ sư cao thâm. Bước vào chốn đô thị đầy cạm bẫy, anh buộc phải đối mặt với vô số bí thuật tà môn, các môn phái thần bí, tà ma ngoại đạo và những ân oán truyền đời nơi chốn giang hồ linh dị Trung Hoa."
  }
};

async function main() {
  const storage = createStorage();
  const db = createSupabase(process.env);
  const keys = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").split(",").map(k => k.trim()).filter(Boolean);

  console.log("=== BẮT ĐẦU KIỂM TRA TOÀN DIỆN VÀ BỔ SUNG METADATA / GIỚI THIỆU TRUYỆN ===");

  const rawCatalog = await storage.get("catalog/latest.json");
  const catalog = rawCatalog ? JSON.parse(rawCatalog.toString()) : { books: [] };

  const suspectIds = new Set();

  for (const b of catalog.books) {
    const title = b.title || "";
    const author = b.author || "";
    const desc = b.description || "";
    if (hasHan(title) || hasHan(author) || hasHan(desc) || !desc || desc.trim().length < 20 || title.startsWith("fanqie-")) {
      suspectIds.add(b.id);
    }
  }

  if (db) {
    const supaBooks = await db.listBooks({ limit: 1000 });
    for (const b of supaBooks || []) {
      const title = b.title || "";
      const author = b.author || "";
      const desc = b.description || "";
      if (hasHan(title) || hasHan(author) || hasHan(desc) || !desc || desc.trim().length < 20 || title.startsWith("fanqie-")) {
        suspectIds.add(b.id);
      }
    }
  }

  const suspectList = Array.from(suspectIds);
  console.log(`Tìm thấy ${suspectList.length} bộ truyện cần bổ sung / dịch lại metadata hoàn chỉnh.`);

  let updatedCount = 0;

  for (let i = 0; i < suspectList.length; i++) {
    const bookId = suspectList[i];
    console.log(`\n[${i + 1}/${suspectList.length}] Xử lý [${bookId}]...`);

    // 1. Check special predefined description
    if (SPECIAL_DESCRIPTIONS[bookId]) {
      const spec = SPECIAL_DESCRIPTIONS[bookId];
      console.log(`  ➔ Sử dụng giới thiệu chuẩn đặc biệt: ${spec.title}`);
      
      const rawIndex = await storage.get(`books/${bookId}/index.json`);
      let indexObj = rawIndex ? JSON.parse(rawIndex.toString()) : {};
      indexObj.title = spec.title;
      indexObj.author = spec.author;
      indexObj.description = spec.description;
      await storage.put(`books/${bookId}/index.json`, Buffer.from(JSON.stringify(indexObj, null, 2)), "application/json");

      if (db) {
        await db.upsertBook({
          id: bookId,
          title: spec.title,
          author: spec.author,
          description: spec.description,
          cover_url: indexObj.cover,
          status: indexObj.status || "Đang cập nhật",
          total_chapters: indexObj.totalChapters || 0,
          translated_chapters: indexObj.translatedChapters || 0,
          revision: indexObj.revision || 1
        });
      }
      updatedCount++;
      continue;
    }

    // 2. Fetch original Chinese metadata from Fanqie public endpoints
    let rawMeta = await fetchFanqieMeta(bookId);
    let sourceTitle = rawMeta?.title;
    let sourceAuthor = rawMeta?.author;
    let sourceDesc = rawMeta?.description;

    // If fetch failed, read from R2 index.json or original chapters
    const rawIndex = await storage.get(`books/${bookId}/index.json`);
    let indexObj = rawIndex ? JSON.parse(rawIndex.toString()) : {};
    
    if (!sourceTitle) sourceTitle = indexObj.title || bookId;
    if (!sourceAuthor) sourceAuthor = indexObj.author || "";
    if (!sourceDesc) sourceDesc = indexObj.description || "";

    console.log(`  Source: "${sourceTitle}" | "${sourceAuthor}" | Desc length: ${sourceDesc?.length || 0}`);

    try {
      const translated = await translateMetadata({
        title: sourceTitle,
        author: sourceAuthor,
        description: sourceDesc
      }, keys);

      console.log(`  ➔ TÊN MỚI: ${translated.title}`);
      console.log(`  ➔ TÁC GIẢ: ${translated.author}`);
      console.log(`  ➔ GIỚI THIỆU (${translated.description?.length || 0} ký tự): ${translated.description?.slice(0, 80)}...`);

      // Update R2 index.json
      indexObj.title = translated.title;
      indexObj.author = translated.author;
      indexObj.description = translated.description;
      await storage.put(`books/${bookId}/index.json`, Buffer.from(JSON.stringify(indexObj, null, 2)), "application/json");

      // Update Supabase
      if (db) {
        await db.upsertBook({
          id: bookId,
          title: translated.title,
          author: translated.author,
          description: translated.description,
          cover_url: indexObj.cover,
          status: indexObj.status || "Đang cập nhật",
          total_chapters: indexObj.totalChapters || 0,
          translated_chapters: indexObj.translatedChapters || 0,
          revision: indexObj.revision || 1
        });
      }

      updatedCount++;
      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      console.error(`  [LỖI] ${bookId}:`, err.message);
    }
  }

  console.log(`\n=== ĐÃ BỔ SUNG & CẬP NHẬT HOÀN TẤT ${updatedCount}/${suspectList.length} BỘ TRUYỆN! ===`);
  console.log("Đang xuất bản lại catalog snapshot lên R2...");
  await publishCatalogSnapshot({ storage, env: process.env, log: console.log });
  console.log("XUẤT BẢN THÀNH CÔNG!");
}

main().catch(console.error);
