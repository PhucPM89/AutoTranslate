#!/usr/bin/env node
"use strict";

/**
 * 📜 LIVE CHAPTER STREAM MONITOR
 * Theo dõi và in ra màn hình từng chương truyện đang được dịch theo thời gian thực.
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

async function readJson(stor, key) {
  try {
    const raw = await stor.get(key);
    return raw ? JSON.parse(raw.toString("utf8")) : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("\n===============================================================================");
  console.log("             📜 DÒNG CHẢY CÁC CHƯƠNG ĐANG DỊCH (LIVE STREAM)");
  console.log("===============================================================================\n");
  console.log("Đang theo dõi các chương mới hoàn thành trên hệ thống...\n");

  const lastSeen = new Map();

  // Khởi tạo trạng thái ban đầu
  const objects = await storage.list("jobs/");
  for (const obj of objects) {
    if (!obj.key.endsWith("/translation.json")) continue;
    const bookId = obj.key.split("/")[1];
    const state = await readJson(storage, obj.key);
    if (!state || !Array.isArray(state.chapters)) continue;

    const completed = new Set(
      state.chapters.filter((c) => c.status === "completed").map((c) => c.n)
    );
    lastSeen.set(bookId, completed);
  }

  // Polling chu kỳ 2.5s để in ra chương mới ngay khi có
  setInterval(async () => {
    try {
      const objs = await storage.list("jobs/");
      for (const obj of objs) {
        if (!obj.key.endsWith("/translation.json")) continue;
        const bookId = obj.key.split("/")[1];
        const state = await readJson(storage, obj.key);
        if (!state || !Array.isArray(state.chapters)) continue;

        let prevSet = lastSeen.get(bookId);
        if (!prevSet) {
          prevSet = new Set();
          lastSeen.set(bookId, prevSet);
        }

        const newlyCompleted = [];
        for (const ch of state.chapters) {
          if (ch.status === "completed" && !prevSet.has(ch.n)) {
            prevSet.add(ch.n);
            newlyCompleted.push(ch);
          }
        }

        if (newlyCompleted.length > 0) {
          const index = (await readJson(storage, `books/${bookId}/index.json`)) || {};
          const title = index.title || bookId;

          for (const ch of newlyCompleted) {
            const timeStr = new Date().toLocaleTimeString();
            console.log(
              `[${timeStr}] ⚡ [${title}] ✓ ch ${ch.n} [${ch.title || "Hoàn thành"}] -> Đã dịch xong!`
            );
          }
        }
      }
    } catch {}
  }, 2500);
}

main().catch(console.error);
