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

const { createStorage, createArchiveStorage } = require("../server/storage/index");
const { createSupabase } = require("../server/supabase");

async function checkRecentTranslations() {
  const storage = createStorage(env);
  const archive = createArchiveStorage(env);
  const db = createSupabase(env);

  console.log("=================================================================");
  console.log("   📊 BÁO CÁO CÁC BỘ TRUYỆN ĐÃ ĐƯỢC DỊCH VÀ CẬP NHẬT GẦN ĐÂY");
  console.log("=================================================================\n");

  // 1. Check jobs/translate-status.json
  try {
    const rawStatus = await archive?.get("jobs/translate-status.json") || await storage.get("jobs/translate-status.json");
    if (rawStatus) {
      const status = JSON.parse(rawStatus.toString("utf8"));
      console.log("🔹 TRẠNG THÁI TIẾN TRÌNH DỊCH HIỆN TẠI (translate-status.json):");
      console.log(`- Trạng thái: ${status.state}`);
      console.log(`- Bộ truyện đang dịch: [${status.currentBookTitle || status.currentBookId || "Không có"}] (ID: ${status.currentBookId})`);
      console.log(`- Tiến độ bộ hiện tại: Chương ${status.currentChapter || status.currentCompleted || 0} / ${status.currentTotalChapters || "?"}`);
      console.log(`- Đã dịch trong phiên này: +${status.translatedThisRun || status.sessionChaptersTranslated || 0} chương`);
      console.log(`- Nhịp tim cập nhật gần nhất: ${status.updatedAt || status.finishedAt || "Chưa có"}`);
      if (status.lastSuccessAt) {
        console.log(`- Thành công gần nhất: Chương ${status.lastSuccessfulChapter || "?"} lúc ${status.lastSuccessAt}`);
      }

      if (Array.isArray(status.recentActivity) && status.recentActivity.length > 0) {
        console.log("\n🔸 CÁC HOẠT ĐỘNG DỊCH GẦN ĐÂY TRONG PHIÊN:");
        for (const act of status.recentActivity) {
          console.log(`  • [${act.bookTitle || act.bookId}] ID: ${act.bookId} - Chương: ${act.chapterNumber || act.count} (Lúc: ${act.at})`);
        }
      }
      console.log("\n-----------------------------------------------------------------\n");
    }
  } catch (err) {
    console.log("Không đọc được translate-status.json:", err.message);
  }

  // 2. Scan books in storage / Supabase
  console.log("🔹 DANH SÁCH TOÀN BỘ TRUYỆN VÀ TIẾN ĐỘ DỊCH THỰC TẾ TRÊN HỆ THỐNG:\n");
  try {
    let books = [];
    if (db) {
      books = await db.listBooks({ limit: 100 });
    }
    
    // Fallback or augment with storage index
    const storageCatalogRaw = await storage.get("catalog/index.json").catch(() => null);
    if (storageCatalogRaw) {
      const catalog = JSON.parse(storageCatalogRaw.toString("utf8"));
      if (Array.isArray(catalog.books)) {
        for (const cb of catalog.books) {
          if (!books.some((b) => b.id === cb.id)) {
            books.push(cb);
          }
        }
      }
    }

    if (!books.length) {
      console.log("Không tìm thấy bộ truyện nào trong thư viện.");
      return;
    }

    // Sort by most recently updated if possible
    for (let i = 0; i < books.length; i++) {
      const b = books[i];
      const bookId = b.id;
      
      // Read book index from storage
      const bookIndexRaw = await storage.get(`books/${bookId}/index.json`).catch(() => null);
      let translatedCount = b.translatedChapters || 0;
      let totalCount = b.chapterCount || b.totalChapters || 0;
      let lastUpdated = b.updated_at || b.updatedAt || "";

      if (bookIndexRaw) {
        const bookIndex = JSON.parse(bookIndexRaw.toString("utf8"));
        totalCount = bookIndex.chapters?.length || totalCount;
        const doneChapters = (bookIndex.chapters || []).filter((ch) => ch.translationStatus === "completed" || ch.translated);
        if (doneChapters.length > 0) {
          translatedCount = doneChapters.length;
        }
        if (bookIndex.updatedAt) {
          lastUpdated = bookIndex.updatedAt;
        }
      }

      const percent = totalCount > 0 ? ((translatedCount / totalCount) * 100).toFixed(1) : "0.0";
      const statusIcon = translatedCount >= totalCount && totalCount > 0 ? "✅ HOÀN TẤT" : translatedCount > 0 ? "⚡ ĐANG DỊCH" : "⏳ CHỜ DỊCH";

      console.log(`${i + 1}. [${b.title || bookId}] (${statusIcon})`);
      console.log(`   - ID: ${bookId}`);
      console.log(`   - Tiến độ: ${translatedCount}/${totalCount} chương (${percent}%)`);
      if (lastUpdated) console.log(`   - Cập nhật: ${lastUpdated}`);
      console.log("");
    }

  } catch (err) {
    console.error("Lỗi khi kiểm tra danh sách truyện:", err.message);
  }
}

checkRecentTranslations().catch(console.error);
