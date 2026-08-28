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

const { createStorage } = require("../server/storage/index");
const { createSupabase } = require("../server/supabase");

async function checkRecentGeminiChapters() {
  const storage = createStorage(env);
  const db = createSupabase(env);

  let books = [];
  if (db) {
    books = await db.listBooks({ limit: 100 });
  }

  console.log("==========================================================================");
  console.log("   📑 CHI TIẾT CÁC BỘ & CHƯƠNG ĐƯỢC GEMINI DỊCH LẠI MỚI NHẤT");
  console.log("==========================================================================\n");

  const activeBooks = [
    "fanqie-7550205522633313304", // Đi làm thêm mùa hè
    "fanqie-7550289679283653657", // Bị sét đánh
    "fanqie-7524956563526650904", // Mạt Thế Túng Hoành
    "fanqie-7540899903602428952", // 36.524 câu chuyện kinh dị
    "fanqie-7523058757635427390", // Nữ Thần Cấp Điện Thờ
    "fanqie-7542412819170331672", // Diêm Vương Cả Nể Mặt
    "fanqie-7558668991737105433"  // Kích Hoạt Cổng Dịch Chuyển
  ];

  for (const bookId of activeBooks) {
    const raw = await storage.get(`books/${bookId}/index.json`);
    if (!raw) continue;
    const index = JSON.parse(raw.toString("utf8"));
    const title = index.title || bookId;
    const chapters = index.chapters || [];
    const doneChapters = chapters.filter((c) => c.translationStatus === "completed" || c.status === "completed");

    console.log(`📌 BỘ TRUYỆN: [${title}]`);
    console.log(`   - Tổng tiến độ: ${doneChapters.length} / ${chapters.length} chương`);
    
    // Recent 5 translated chapters
    const recent = doneChapters.slice(-5);
    console.log("   - Các chương dịch hoàn thiện mới nhất:");
    for (const ch of recent) {
      console.log(`     • [Chương ${ch.n}]: "${ch.title}"`);
    }
    console.log("");
  }
}

checkRecentGeminiChapters().catch(console.error);
