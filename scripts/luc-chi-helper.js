"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
for (const name of [".env", ".env.local"]) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { R2IOManager } = require("../server/agent-pipeline/r2-io");

const storage = createStorage();
const db = createSupabase();
const io = new R2IOManager({ storage, db });

const BOOK_ID = "fanqie-6569423930556156942";
const REVISION = 1;

async function fetchOriginal(n) {
  const key = `books/${BOOK_ID}/r${REVISION}/ch/${n}.original.json`;
  const raw = await storage.get(key);
  if (!raw) return null;
  return JSON.parse(raw.toString("utf8"));
}

/**
 * Xuất bản chương bắt buộc thông qua R2IOManager.publishChapterAtomic
 * Tuân thủ đúng 7 bước chuẩn:
 * 1. Ghi và xác minh chapter JSON trên R2
 * 2. Gọi syncCompletedChapter()
 * 3. Đánh dấu completed trong translation queue (với ETag)
 * 4. Đánh dấu completed trong book index (với ETag)
 * 5. Tính lại translatedChapters từ index.chapters (không cộng thủ công)
 * 6. Đồng bộ Supabase book progress
 * 7. Tạo lại catalog/latest.json
 */
async function saveTranslation(n, title, content, metadata = {}) {
  const trimmed = typeof content === "string" ? content.trim() : "";
  const cleanTitle = String(title || "").trim();

  const publishResult = await io.publishChapterAtomic({
    bookId: BOOK_ID,
    revision: REVISION,
    chapterNumber: n,
    title: cleanTitle,
    assembledContent: trimmed,
    characters: trimmed.length,
    metadata: {
      provider: metadata.provider || "antigravity-direct",
      model: metadata.model || "direct-v2",
      translationVersion: metadata.translationVersion || "direct-v2",
      ...metadata
    }
  });

  return {
    success: true,
    path: publishResult.key,
    characters: publishResult.characters,
    translatedChapters: publishResult.translatedChapters
  };
}

async function updateIndexBatch(chaptersList = []) {
  // publishChapterAtomic đã đồng bộ nguyên tử từng chương với ETag trên index, queue, Supabase, và catalog
  return {
    success: true,
    total: chaptersList.length
  };
}

module.exports = {
  fetchOriginal,
  saveTranslation,
  updateIndexBatch,
  BOOK_ID,
  REVISION,
  storage,
  db,
  io
};
