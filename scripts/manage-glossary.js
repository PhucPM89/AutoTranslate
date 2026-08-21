"use strict";

// Trạm Chữ — Glossary Management Utility CLI
// Usage:
//   node --env-file=.env --env-file=.env.local scripts/manage-glossary.js list <bookId>
//   node --env-file=.env --env-file=.env.local scripts/manage-glossary.js set <bookId> "林枫" "Lâm Phong"
//   node --env-file=.env --env-file=.env.local scripts/manage-glossary.js remove <bookId> "林枫"

const { createStorage } = require("../server/storage");
const { createTranslationEngine } = require("../server/translation-engine");

const args = process.argv.slice(2);
const command = args[0];
const bookId = args[1];

async function main() {
  if (!command || !bookId) {
    console.log("Cách dùng:");
    console.log("  node scripts/manage-glossary.js list <bookId>");
    console.log("  node scripts/manage-glossary.js set <bookId> <chữ_Trung> <tiếng_Việt>");
    console.log("  node scripts/manage-glossary.js remove <bookId> <chữ_Trung>");
    return;
  }

  const storage = createStorage();
  const engine = createTranslationEngine({ storage });
  const glossary = await engine.loadGlossary(bookId);

  if (command === "list") {
    console.log(`=== Bảng thuật ngữ của truyện [${bookId}] ===`);
    const entries = Object.entries(glossary);
    if (!entries.length) {
      console.log("(Chưa có thuật ngữ nào)");
    } else {
      entries.forEach(([zh, vi], i) => {
        console.log(`  ${i + 1}. "${zh}" ➔ "${vi}"`);
      });
    }
  } else if (command === "set") {
    const zh = args[2];
    const vi = args[3];
    if (!zh || !vi) {
      console.error("Lỗi: Thiếu <chữ_Trung> hoặc <tiếng_Việt>");
      process.exit(1);
    }
    glossary[zh] = vi;
    await engine.saveGlossary(bookId, glossary);
    console.log(`✓ Đã lưu thuật ngữ cho [${bookId}]: "${zh}" ➔ "${vi}"`);
  } else if (command === "remove") {
    const zh = args[2];
    if (!zh || !glossary[zh]) {
      console.log(`Thuật ngữ "${zh}" không tồn tại trong [${bookId}].`);
      return;
    }
    delete glossary[zh];
    await engine.saveGlossary(bookId, glossary);
    console.log(`✓ Đã xóa thuật ngữ "${zh}" khỏi [${bookId}].`);
  } else {
    console.error(`Lệnh không hợp lệ: ${command}`);
  }
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
