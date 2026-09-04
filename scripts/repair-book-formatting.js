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
const { preprocessSystemBlocks, normalizeReaderText } = require("../client/reader-text");

async function main() {
  const storage = createStorage();
  const bookId = process.argv[2] || "fanqie-7027679289931729920";

  console.log(`\n=== CHUẨN HÓA ĐỊNH DẠNG VĂN BẢN VÀ BẢNG THUỘC TÍNH: ${bookId} ===`);
  const items = await storage.list(`books/${bookId}/r1/ch/`);
  const keys = items
    .map((i) => (typeof i === "string" ? i : i.key))
    .filter((k) => k.match(/\/ch\/\d+\.json$/) && !k.endsWith(".original.json"));

  console.log(`Tìm thấy ${keys.length} chương đã dịch cần chuẩn hóa trên R2...`);

  let repairedCount = 0;
  for (const key of keys) {
    const rawBuf = await storage.get(key);
    if (!rawBuf) continue;
    const doc = JSON.parse(rawBuf.toString("utf8"));
    if (!doc.content) continue;

    const originalContent = doc.content;
    const formatted = normalizeReaderText(preprocessSystemBlocks(originalContent));

    if (formatted !== originalContent) {
      doc.content = formatted;
      doc.updatedAt = new Date().toISOString();
      await storage.put(key, JSON.stringify(doc, null, 2), "application/json");
      repairedCount++;
      const chNum = key.match(/\/(\d+)\.json$/)[1];
      console.log(`  ✓ Đã chuẩn hóa Chương ${chNum}`);
    }
  }

  console.log(`\n===============================================================`);
  console.log(`✓ HOÀN TẤT! Đã chuẩn hóa hiển thị ${repairedCount}/${keys.length} chương trên R2.`);
  console.log(`===============================================================\n`);
}

main().catch(console.error);
