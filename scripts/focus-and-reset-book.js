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
const { writeTranslationConfig } = require("../server/translation-config");

async function main() {
  const bookId = process.argv[2] || "fanqie-7027679289931729920";
  console.log(`\n=== RESET VÀ KHÓA TIÊU ĐIỂM BỘ TRUYỆN: ${bookId} ===`);

  const storage = createStorage();
  const supabase = createSupabase(process.env);

  // 1. Lấy danh sách file và xóa các file chapter dịch cũ (giữ lại *.original.json)
  console.log("[1/4] Đang kiểm tra các file dịch cũ...");
  const items = await storage.list(`books/${bookId}/`);
  const keys = items.map((i) => (typeof i === "string" ? i : i.key));
  const translatedKeys = keys.filter((k) => k.match(/\/ch\/\d+\.json$/) && !k.endsWith(".original.json"));

  if (translatedKeys.length > 0) {
    console.log(`  Đang xóa ${translatedKeys.length} chương dịch cũ trên R2...`);
    for (const k of translatedKeys) {
      await storage.remove(k);
    }
    console.log(`  ✓ Đã xóa ${translatedKeys.length} chương dịch cũ.`);
  } else {
    console.log("  Không có file chapter dịch cũ cần xóa.");
  }

  // 2. Reset index.json
  console.log("[2/4] Đang cập nhật index.json...");
  const rawIdx = await storage.get(`books/${bookId}/r1/index.json`) || await storage.get(`books/${bookId}/index.json`);
  if (!rawIdx) throw new Error(`Không tìm thấy index.json của bộ ${bookId}`);
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
  console.log(`  ✓ Đã reset ${chapters.length} chương trong index về trạng thái pending.`);

  // 3. Reset job state
  console.log("[3/4] Đang reset hàng đợi dịch (translation queue)...");
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
  console.log(`  ✓ Đã reset job state: ${job.chapters.length} chương pending.`);

  // Update Supabase
  try {
    await supabase.updateBookProgress(bookId, {
      totalChapters: chapters.length,
      translatedChapters: 0,
      revision: Number(indexDoc.revision || 1),
      status: "Đang cập nhật"
    });
    console.log("  ✓ Đã cập nhật Supabase database: 0 chương đã dịch.");
  } catch (err) {
    console.warn("  (Cảnh báo cập nhật Supabase:", err.message, ")");
  }

  // 4. Khóa tiêu điểm dịch (Focus Book)
  console.log("[4/4] Đang đặt tiêu điểm dịch tập trung (Focus)...");
  const cfg = await writeTranslationConfig(storage, { focusBookId: bookId });
  console.log(`  ✓ Đã lưu cấu hình focusBookId = "${cfg.focusBookId}".`);

  console.log(`\n========================================================`);
  console.log(`✓ HOÀN TẤT! Hệ thống đã khóa tập trung vào bộ: "${indexDoc.title || bookId}".`);
  console.log(`  Toàn bộ ${chapters.length} chương sẽ được dịch từ đầu với chất lượng tốt nhất!`);
  console.log(`========================================================\n`);
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
