#!/usr/bin/env node
"use strict";

/**
 * 📊 REAL-TIME TRANSLATION PROGRESS CHECKER
 * Quét trực tiếp Storage R2 & Supabase để hiển thị tiến độ dịch truyện thời gian thực.
 */

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

loadEnvFile(path.join(__dirname, "..", ".env.local"));
loadEnvFile(path.join(__dirname, "..", ".env"));

const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");

const storage = createStorage();
const db = createSupabase();

const args = process.argv.slice(2);
const ONLY_BOOK = args.includes("--book") ? args[args.indexOf("--book") + 1] : "";
const WATCH_MODE = args.includes("--watch") || args.includes("-w");

async function readJson(stor, key) {
  try {
    const raw = await stor.get(key);
    return raw ? JSON.parse(raw.toString("utf8")) : null;
  } catch {
    return null;
  }
}

function renderProgressBar(current, total, width = 25) {
  if (total <= 0) return "[-------------------------]   0%";
  const percent = Math.min(100, Math.round((current / total) * 100));
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `[${bar}] ${percent.toString().padStart(3)}%`;
}

async function checkProgress() {
  if (WATCH_MODE) {
    process.stdout.write("\x1Bc"); // Clear console
  }

  console.log("===============================================================================");
  console.log("             📊 TIẾN ĐỘ DỊCH TRUYỆN THỜI GIAN THỰC (HACHIMI-MT)");
  console.log("===============================================================================\n");

  const objects = await storage.list("jobs/");
  const jobKeys = objects.filter((o) => o.key.endsWith("/translation.json"));

  let totalSystemChapters = 0;
  let totalSystemTranslated = 0;
  let fullyCompletedBooks = 0;
  let inProgressBooks = 0;

  const bookStats = [];

  // Đọc trực tiếp từ Supabase để lấy số liệu nhảy liên tục thời gian thực
  let liveBooks = [];
  if (db) {
    try {
      liveBooks = await db.listBooks({ limit: 1000, order: "updated_at.desc" });
    } catch {}
  }

  // Fallback qua snapshot nếu DB chưa sẵn sàng
  if (!liveBooks || !liveBooks.length) {
    const snapshotRaw = await storage.get("catalog/latest.json").catch(() => null);
    if (snapshotRaw) {
      try {
        const snap = JSON.parse(snapshotRaw.toString("utf8"));
        liveBooks = (snap.books || []).map((b) => ({
          id: b.id,
          title: b.title,
          total_chapters: b.chapterCount,
          translated_chapters: b.translatedChapters,
          updated_at: b.updatedAt
        }));
      } catch {}
    }
  }

  for (const b of liveBooks) {
    if (ONLY_BOOK && b.id !== ONLY_BOOK && !b.id.includes(ONLY_BOOK)) continue;

    const total = b.total_chapters || b.chapterCount || 0;
    const translated = b.translated_chapters || b.translatedChapters || 0;

    totalSystemChapters += total;
    totalSystemTranslated += translated;

    if (translated >= total && total > 0) {
      fullyCompletedBooks++;
    } else if (translated > 0) {
      inProgressBooks++;
    }

    bookStats.push({
      id: b.id,
      title: b.title || b.id,
      total,
      translated,
      percent: total > 0 ? Math.round((translated / total) * 100) : 0,
      updatedAt: b.updated_at || b.updatedAt || ""
    });
  }

  // Sắp xếp theo thứ tự mới cập nhật nhất hoặc % cao nhất
  bookStats.sort((a, b) => {
    if (a.percent > 0 && b.percent === 0) return -1;
    if (b.percent > 0 && a.percent === 0) return 1;
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });

  // In bảng danh sách truyện
  console.log(
    "STT | Tên Truyện                           | Đã Dịch / Tổng Số    | Tiến Độ"
  );
  console.log(
    "----+--------------------------------------+----------------------+-------------------------"
  );

  bookStats.slice(0, ONLY_BOOK ? 1 : 25).forEach((b, i) => {
    const num = (i + 1).toString().padStart(3);
    const safeTitle = b.title.length > 36 ? b.title.slice(0, 33) + "..." : b.title.padEnd(36);
    const countStr = `${b.translated.toString().padStart(5)} / ${b.total.toString().padEnd(5)} ch`.padEnd(20);
    const bar = renderProgressBar(b.translated, b.total, 15);
    const statusIcon = b.percent === 100 ? "✅" : b.percent > 0 ? "⚡" : "⏳";
    console.log(`${num} | ${safeTitle} | ${countStr} | ${statusIcon} ${bar}`);
  });

  if (!ONLY_BOOK && bookStats.length > 25) {
    console.log(`... và ${bookStats.length - 25} bộ truyện khác đang chờ trong hàng đợi.`);
  }

  console.log("\n-------------------------------------------------------------------------------");
  console.log("📈 TỔNG QUAN TOÀN HỆ THỐNG:");
  console.log(`  • Tổng số truyện trong hệ thống:  ${bookStats.length} bộ`);
  console.log(`  • Truyện đã hoàn thành 100%:     ${fullyCompletedBooks} bộ`);
  console.log(`  • Truyện đang dịch:               ${inProgressBooks} bộ`);
  console.log(
    `  • Tổng số chương đã dịch:         ${totalSystemTranslated.toLocaleString()} / ${totalSystemChapters.toLocaleString()} chương`
  );
  console.log(`  • Tiến độ toàn bộ thư viện:       ${renderProgressBar(totalSystemTranslated, totalSystemChapters, 30)}`);
  console.log("-------------------------------------------------------------------------------");
  console.log(`🕒 Cập nhật lúc: ${new Date().toLocaleTimeString()} (Giờ VN)`);

  if (WATCH_MODE) {
    console.log("\n(Đang theo dõi trực tiếp mỗi 5 giây... Nhấn Ctrl+C để thoát)");
  }
}

async function main() {
  await checkProgress();
  if (WATCH_MODE) {
    setInterval(async () => {
      await checkProgress().catch(() => {});
    }, 5000);
  }
}

main().catch(console.error);
