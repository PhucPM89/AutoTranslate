"use strict";

const { createStorage } = require("../server/storage");
const { parseApiKeys } = require("../server/gemini");
const path = require("path");
const fs = require("fs");

// Load .env
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      let val = match[2].trim();
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      process.env[match[1]] = val;
    }
  }
}

const keyList = parseApiKeys(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "");
console.log(`Tìm thấy ${keyList.length} Groq API Keys từ .env.`);

async function main() {
  const storage = createStorage(process.env);
  if (!storage) {
    throw new Error("Không thể kết nối R2 Storage từ env.");
  }

  const key = "config/api-keys.json";
  await storage.put(key, JSON.stringify(keyList, null, 2), {
    contentType: "application/json",
    cacheControl: "no-cache"
  });

  console.log(`✅ Đã lưu thành công ${keyList.length} API Keys lên R2: ${key}`);
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
