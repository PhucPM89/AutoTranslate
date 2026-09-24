"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
for (const f of [".env.local", ".env"]) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

const { createStorage } = require("../server/storage");
const storage = createStorage(process.env);
const BOOK_ID = "fanqie-7143038691944959011";

const BACKUP_DIR = path.join(ROOT, "scratch", "backups-thap-1-103");
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Map tiêu đề chuẩn hóa cho các chương dính tiếng Trung
const TITLE_FIXES = {
  83: "Chương 80: Lữ Bố Tại Thế",
  84: "Chương 81: Từ Bỏ?",
  85: "Chương 82: Hồi Hưởng",
};

// Các quy tắc chuẩn hóa văn phong và thuật ngữ
function normalizeContent(content) {
  if (!content) return "";
  let text = content;

  // 1. Thuật ngữ Hồi Hưởng
  text = text.replace(/Người hồi âm/g, "Người hồi hưởng");
  text = text.replace(/người hồi âm/g, "người hồi hưởng");
  text = text.replace(/Hồi Âm/g, "Hồi Hưởng");
  text = text.replace(/hồi âm/g, "hồi hưởng");

  // 2. Nhân vật & Chức danh
  text = text.replace(/Triệu Y Sinh/g, "Bác sĩ Triệu");
  text = text.replace(/triệu y sinh/g, "bác sĩ Triệu");
  text = text.replace(/Kiều Gia Cật/g, "Kiều Gia Kính");
  text = text.replace(/Kiều Gia Cánh/g, "Kiều Gia Kính");
  text = text.replace(/Kiều Gia Kình/g, "Kiều Gia Kính");
  text = text.replace(/Sơn Dương Đầu/g, "Đầu Dê Người");
  text = text.replace(/Đơn Nguyên Môn/g, "cửa tòa nhà");
  text = text.replace(/Đông Sương Hạ Thảo/g, "Đông Trùng Hạ Thảo");

  // 3. Chuẩn hóa dấu ngoặc thoại
  // Chuyển dấu ngoặc cong Trung Quốc “ ” thành "
  text = text.replace(/[“”]/g, '"');

  // Chuyển dấu ngoặc đơn kiểu ‘...’ dùng cho thoại thành "..."
  // Chỉ thay thế khi bên trong là lời nói (không thay thế dấu nháy đơn ' trong từ tiếng Anh nếu có)
  text = text.replace(/‘([^’\r\n]+)’/g, '"$1"');
  text = text.replace(/’/g, "'");
  text = text.replace(/‘/g, "'");

  // 4. Chuẩn hóa khoảng trắng thừa trước/sau dấu câu
  text = text.replace(/[ \t]+,/g, ",");
  text = text.replace(/[ \t]+\./g, ".");
  text = text.replace(/[ \t]+\?/g, "?");
  text = text.replace(/[ \t]+!/g, "!");
  text = text.replace(/[ \t]+;/g, ";");
  text = text.replace(/[ \t]+:/g, ":");

  // 5. Chuẩn hóa ba chấm
  text = text.replace(/……/g, "...");
  text = text.replace(/\.{4,}/g, "...");

  return text;
}

async function main() {
  console.log(`=== BẮT ĐẦU CHUẨN HÓA TOÀN DIỆN 103 CHƯƠNG ĐẦU BỘ THẬP NHẬT CHUNG YÊN ===`);
  console.log(`Book ID: ${BOOK_ID}`);
  console.log(`Backup directory: ${BACKUP_DIR}\n`);

  let modifiedCount = 0;
  let titleUpdatedCount = 0;

  for (let n = 1; n <= 103; n++) {
    const key = `books/${BOOK_ID}/r1/ch/${n}.json`;
    const head = await storage.head(key);
    const raw = await storage.get(key);

    if (!raw || !head?.etag) {
      console.error(`[LỖI] Không tìm thấy file hoặc thiếu ETag cho chương ${n}: ${key}`);
      continue;
    }

    // 1. Backup file gốc trước khi sửa
    const oldHash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 10);
    const backupPath = path.join(BACKUP_DIR, `ch_${n}_${oldHash}.backup.json`);
    fs.writeFileSync(backupPath, raw);

    const doc = JSON.parse(raw.toString("utf8"));
    const oldTitle = doc.title || "";
    const oldContent = doc.content || "";

    // 2. Xác định tiêu đề mới
    let newTitle = oldTitle;
    if (TITLE_FIXES[n]) {
      newTitle = TITLE_FIXES[n];
    } else if (/^第\d+章/.test(oldTitle)) {
      // Nếu tiêu đề vẫn dính chữ Hán
      const match = oldTitle.match(/^第(\d+)章\s*(.*)$/);
      if (match) {
        newTitle = `Chương ${match[1]}: ${match[2]}`;
      }
    }

    // 3. Chuẩn hóa nội dung
    const newContent = normalizeContent(oldContent);

    // 4. Kiểm tra xem có thay đổi không
    const isTitleChanged = newTitle !== oldTitle;
    const isContentChanged = newContent !== oldContent;

    if (!isTitleChanged && !isContentChanged) {
      console.log(`[Chương ${n}] Đã chuẩn, không cần sửa đổi. ("${oldTitle}")`);
      continue;
    }

    // 5. Cập nhật và lưu lên R2
    const now = new Date().toISOString();
    const updatedDoc = {
      ...doc,
      title: newTitle,
      content: newContent,
      characters: newContent.length,
      manualEdited: true,
      updatedAt: now,
      normalization: {
        normalizedAt: now,
        titleModified: isTitleChanged,
        contentModified: isContentChanged,
        previousTitle: isTitleChanged ? oldTitle : undefined,
      }
    };

    const payload = JSON.stringify(updatedDoc, null, 2);

    await storage.put(key, payload, {
      contentType: "application/json; charset=utf-8",
      cacheControl: "public, max-age=60, stale-while-revalidate=600",
      ifMatch: head.etag,
    });

    // 6. Read-back xác minh tính toàn vẹn
    const verifyRaw = await storage.get(key);
    const verifyDoc = JSON.parse(verifyRaw.toString("utf8"));
    if (verifyDoc.title !== newTitle || verifyDoc.content !== newContent) {
      throw new Error(`[CRITICAL] Read-back thất bại tại chương ${n}! Dữ liệu không khớp.`);
    }

    modifiedCount++;
    if (isTitleChanged) titleUpdatedCount++;

    const logDetails = [];
    if (isTitleChanged) logDetails.push(`Đổi tiêu đề: "${oldTitle}" -> "${newTitle}"`);
    if (isContentChanged) logDetails.push(`Chuẩn hóa nội dung (${oldContent.length} -> ${newContent.length} chars)`);
    console.log(`[OK Chương ${n}] ${logDetails.join(" | ")}`);
  }

  console.log(`\n=== TỔNG KẾT CHUẨN HÓA 103 CHƯƠNG ===`);
  console.log(`- Tổng số chương đã sửa đổi & xuất bản: ${modifiedCount} / 103`);
  console.log(`- Tiêu đề được chuẩn hóa: ${titleUpdatedCount}`);
  console.log(`- Toàn bộ backup lưu tại: ${BACKUP_DIR}`);

  // 7. Đồng bộ index nếu có tiêu đề thay đổi
  if (titleUpdatedCount > 0) {
    console.log(`\nĐang đồng bộ index.json trên R2...`);
    const idxKey = `books/${BOOK_ID}/r1/index.json`;
    const idxHead = await storage.head(idxKey);
    const idxRaw = await storage.get(idxKey);
    if (idxRaw && idxHead?.etag) {
      const idxDoc = JSON.parse(idxRaw.toString("utf8"));
      let idxUpdated = false;
      for (const ch of (idxDoc.chapters || [])) {
        const n = ch.n || ch.chapterNumber;
        if (TITLE_FIXES[n] && ch.title !== TITLE_FIXES[n]) {
          console.log(`Index ch ${n}: "${ch.title}" -> "${TITLE_FIXES[n]}"`);
          ch.title = TITLE_FIXES[n];
          idxUpdated = true;
        }
      }
      if (idxUpdated) {
        idxDoc.updatedAt = new Date().toISOString();
        await storage.put(idxKey, JSON.stringify(idxDoc, null, 2), {
          contentType: "application/json; charset=utf-8",
          ifMatch: idxHead.etag,
        });
        console.log(`Đã cập nhật và đồng bộ tiêu đề trong index.json thành công!`);
      }
    }
  }
}

main().catch((err) => {
  console.error("LỖI:", err);
  process.exit(1);
});
