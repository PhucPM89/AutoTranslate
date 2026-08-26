"use strict";

const { createArchiveStorage } = require("../server/storage");
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

const keyList = Array.from(new Set([
  ...parseApiKeys(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || ""),
  ...parseApiKeys(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
])).filter(Boolean);
console.log(`Tìm thấy ${keyList.length} API Keys (Gemini / Groq) từ .env.`);

async function main() {
  const storage = createArchiveStorage(process.env);
  if (!storage) {
    throw new Error("Thiếu R2_ARCHIVE_BUCKET; từ chối ghi API key vào reader bucket công khai.");
  }

  const key = "config/api-keys.json";
  await storage.put(key, JSON.stringify(keyList, null, 2), {
    contentType: "application/json",
    cacheControl: "private, no-store"
  });

  console.log(`✅ Đã lưu thành công ${keyList.length} API Keys lên R2: ${key}`);
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exit(1);
});
