"use strict";

const path = require("path");
const fs = require("fs");

function loadEnvFile(file) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match) {
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

async function main() {
  const storage = createStorage();
  const objects = await storage.list("jobs/");
  let totalReset = 0;
  let booksUpdated = 0;

  console.log(`Đang kiểm tra và mở khóa toàn bộ hàng đợi dịch trong R2 (${objects.length} files)...`);

  for (const obj of objects) {
    if (!obj.key.endsWith("/translation.json")) continue;
    const raw = await storage.get(obj.key);
    if (!raw) continue;
    
    try {
      const state = JSON.parse(raw.toString("utf8"));
      let changed = false;
      
      for (const entry of state.chapters) {
        if (entry.status === "failed" || (entry.status !== "completed" && entry.attempts > 0)) {
          entry.status = "pending";
          entry.attempts = 0;
          entry.lastError = "";
          entry.nextAttemptAt = 0;
          totalReset++;
          changed = true;
        }
      }

      if (changed) {
        state.updatedAt = new Date().toISOString();
        await storage.put(obj.key, JSON.stringify(state));
        booksUpdated++;
      }
    } catch (err) {
      console.warn(`Lỗi khi đọc ${obj.key}:`, err.message);
    }
  }

  console.log(`✅ HOÀN TẤT: Đã mở khóa ${totalReset} chương bị kẹt trên ${booksUpdated} bộ truyện!`);
}

main().catch(console.error);
