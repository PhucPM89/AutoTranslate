"use strict";

const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}
loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { createArchiveStorage, createStorage } = require("../server/storage");

async function main() {
  const privateStorage = createArchiveStorage();
  const publicStorage = createStorage();

  const targetStorage = privateStorage || publicStorage;
  if (!targetStorage) {
    console.error("Không kết nối được storage.");
    return;
  }

  const key = "jobs/translate-key-health.json";
  const buf = await targetStorage.get(key);
  if (!buf) {
    console.log("Không tìm thấy file jobs/translate-key-health.json trên storage.");
    return;
  }

  try {
    const data = JSON.parse(buf.toString("utf8"));
    console.log(`Tìm thấy ${data.keys ? data.keys.length : 0} keys trong snapshot.`);
    
    if (Array.isArray(data.keys)) {
      for (const k of data.keys) {
        console.log(`- Key ${k.id}: Cooldown cũ: ${new Date(k.cooldownUntil).toLocaleString("vi-VN")}, Lỗi: "${k.lastErrorMsg}"`);
        k.cooldownUntil = 0;
        k.consecutiveErrors = 0;
        k.lastErrorMsg = "";
        k.quotaClass = "";
        k.recoveryPolicy = "";
      }
    }

    await targetStorage.put(key, JSON.stringify(data, null, 2));
    console.log("\n✓ ĐÃ RESET THÀNH CÔNG COOLDOWN CỦA TOÀN BỘ API KEYS TRÊN R2!");
  } catch (err) {
    console.error("Lỗi:", err.message);
  }
}

main();
