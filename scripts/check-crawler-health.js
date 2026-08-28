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

const { createArchiveStorage, createStorage } = require("../server/storage/index");

async function checkCrawlerHealth() {
  const archive = createArchiveStorage(env) || createStorage(env);

  console.log("==========================================================================");
  console.log("   🔍 KIỂM TRA SỨC KHỎE & TRẠNG THÁI CRAWLER FANQIE");
  console.log("==========================================================================\n");

  const rawStatus = await archive.get("crawler/status.json");
  if (rawStatus) {
    const status = JSON.parse(rawStatus.toString("utf8"));
    console.log("📊 Trạng thái Crawler ghi nhận gần nhất:");
    console.log(`- State: "${status.state}"`);
    console.log(`- Message: "${status.message}"`);
    console.log(`- Started At: ${status.startedAt}`);
    console.log(`- Finished At: ${status.finishedAt}`);
    console.log(`- Đã phát hiện: ${status.discovered || 0} bộ mới`);
    console.log(`- Đã xuất bản: ${status.published || 0} bộ`);
    console.log(`- Thất bại: ${status.failed || 0} bộ`);
    if (status.recent && status.recent.length > 0) {
      console.log("\n📚 Các bộ truyện vừa được cập nhật/thêm mới gần nhất:");
      status.recent.forEach((b, i) => {
        console.log(`  ${i + 1}. [${b.title}] (${b.chapters} chương) - ${b.at}`);
      });
    }
  } else {
    console.log("ℹ️ Chưa có file crawler/status.json (sử dụng cấu hình mặc định).");
  }

  const rawConfig = await archive.get("crawler/config.json");
  if (rawConfig) {
    const config = JSON.parse(rawConfig.toString("utf8"));
    console.log("\n⚙️ Cấu hình Crawler hiện tại:");
    console.log(`- Trạng thái: ${config.enabled !== false ? '🟢 BẬT' : '🔴 TẮT'}`);
    console.log(`- Tự động cập nhật chương mới (updateExisting): ${config.updateExisting !== false ? '✅ BẬT' : '❌ TẮT'}`);
    console.log(`- Giới hạn bộ truyện trong kho (maxLibraryBooks): ${config.maxLibraryBooks || 'Không giới hạn'}`);
    console.log(`- Trần hàng đợi dịch tối đa (maxPendingBooksBacklog): ${config.maxPendingBooksBacklog || 5} bộ`);
  }
}

checkCrawlerHealth().catch(console.error);
