"use strict";

const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split("\n")) {
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

const UI_PATTERNS = [
  /^\s*Gemini said\s*/im,
  /^\s*(?:Show thinking|Thinking|Sources|Drafts)\s*$/gim,
  /^\s*(?:Show code|Copy code|Use code|Copy|Run|Share)\s*$/gim,
  /^\s*(?:Edit in Gemini|More drafts|Retry|Modify response)\s*$/gim,
  /^\s*(?:Xem mã|Sao chép mã|Chạy|Chia sẻ|Sao chép|Thử lại|Sửa trong Gemini)\s*$/gim,
  /```[a-z]*\n?/gi,
];

const DETECT_PATTERNS = [
  /Gemini said/i,
  /^Show code\s*$/m,
  /^Copy code\s*$/m,
  /^Use code\s*$/m,
  /^Show thinking\s*$/m,
  /^Copy\s*$/m,
  /^Run\s*$/m,
  /^Share\s*$/m,
  /^Sources\s*$/m,
  /^Drafts\s*$/m,
  /^Edit in Gemini\s*$/m,
  /^More drafts\s*$/m,
  /^Retry\s*$/m,
  /^Modify response\s*$/m,
  /^Xem mã\s*$/m,
  /^Sao chép mã\s*$/m,
  /^Sao chép\s*$/m,
  /^Thử lại\s*$/m,
  /^Sửa trong Gemini\s*$/m,
  /```[a-z]*\n/,
];

function isDirty(content) {
  if (!content) return false;
  return DETECT_PATTERNS.some((pattern) => pattern.test(content));
}

function cleanContent(content) {
  let result = String(content || "");
  for (const pattern of UI_PATTERNS) {
    if (pattern.global) pattern.lastIndex = 0;
    result = result.replace(pattern, "");
  }
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  return result;
}

async function readJson(storage, key) {
  try {
    const raw = await storage.get(key);
    if (!raw) return null;
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return null;
  }
}

async function mapConcurrent(items, concurrency, fn) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  const storage = createStorage();
  console.log("Đang nạp danh mục sách...");
  const catalog = (await readJson(storage, "catalog/latest.json")) || {};
  const books = catalog.books || [];
  console.log(`Tìm thấy ${books.length} cuốn sách trong thư viện.`);

  let totalScanned = 0;
  let totalDirty = 0;
  let totalRepaired = 0;
  const dirtyBooks = new Map();

  for (const book of books) {
    const bookId = book.id;
    const index = await readJson(storage, `books/${bookId}/index.json`);
    if (!index) continue;

    const revision = index.revision || 1;
    const completedChapters = (index.chapters || []).filter((c) => c.status === "completed");
    if (!completedChapters.length) continue;

    console.log(`\n📚 [${book.title || bookId}] Có ${completedChapters.length} chương đã dịch, đang quét...`);
    let bookDirtyCount = 0;

    await mapConcurrent(completedChapters, 25, async (chEntry) => {
      const ch = chEntry.n;
      const key = `books/${bookId}/r${revision}/ch/${ch}.json`;
      const chapter = await readJson(storage, key);
      if (!chapter || !chapter.content) return;

      totalScanned++;

      if (isDirty(chapter.content)) {
        totalDirty++;
        bookDirtyCount++;

        const originalLength = chapter.content.length;
        const cleaned = cleanContent(chapter.content);
        const newLength = cleaned.length;

        const dirtyMatch = DETECT_PATTERNS.find((p) => {
          if (p.global) p.lastIndex = 0;
          return p.test(chapter.content);
        });
        const matchText = dirtyMatch ? (chapter.content.match(dirtyMatch) || [""])[0].trim() : "";

        console.log(`  ❌ [${book.title || bookId}] ch ${ch}: Phát hiện "${matchText}" (${originalLength} → ${newLength} chars) -> ĐÃ SỬA`);

        let cleanedTitle = chapter.title;
        if (chapter.title && isDirty(chapter.title)) {
          cleanedTitle = cleanContent(chapter.title);
        }

        const repaired = {
          ...chapter,
          content: cleaned,
          title: cleanedTitle,
          repairedAt: new Date().toISOString(),
          repairedFrom: "gemini-ui-artifact-cleanup"
        };

        await storage.put(key, JSON.stringify(repaired));
        totalRepaired++;
      }
    });

    if (bookDirtyCount > 0) {
      dirtyBooks.set(bookId, { title: book.title || bookId, count: bookDirtyCount });
    }
  }

  console.log("\n================ KẾT QUẢ QUÉT & SỬA LỖI ================");
  console.log(`Tổng số chương đã quét: ${totalScanned}`);
  console.log(`Chương phát hiện dính rác UI (Gemini said / Show code...): ${totalDirty}`);
  console.log(`Chương đã được sửa sạch và lưu lên R2: ${totalRepaired}`);
  if (dirtyBooks.size > 0) {
    console.log("\nChi tiết các bộ truyện đã sửa:");
    for (const [bookId, info] of dirtyBooks) {
      console.log(`  📕 ${info.title} (${bookId}): ${info.count} chương`);
    }
  } else {
    console.log("\n✅ Tất cả các chương đã quét đều hoàn toàn sạch sẽ, không dính rác UI!");
  }
}

main().catch((err) => {
  console.error("LỖI KHI QUÉT:", err);
  process.exit(1);
});
