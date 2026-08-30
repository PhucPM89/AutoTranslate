"use strict";

const fs = require("fs");
const path = require("path");

function loadEnv(file) {
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

loadEnv(path.join(__dirname, "..", ".env"));
loadEnv(path.join(__dirname, "..", ".env.local"));

const { createStorage } = require("../server/storage");
const { calculateFluencyScore } = require("../server/reflection-engine");

async function main() {
  const storage = createStorage();
  const bookId = "fanqie-6497813734990285837";
  
  console.log("=== KIỂM TRA CHẤT LƯỢNG CÁC CHƯƠNG ĐÃ DỊCH ===");
  for (let ch = 1; ch <= 10; ch++) {
    const key = `books/${bookId}/r1/ch/${ch}.json`;
    const origKey = `books/${bookId}/r1/ch/${ch}.original.json`;
    const raw = await storage.get(key);
    const rawOrig = await storage.get(origKey);
    
    if (raw) {
      const data = JSON.parse(raw.toString("utf8"));
      const fluency = calculateFluencyScore(data.content || "");
      console.log(`\n================== CHƯƠNG ${ch}: ${data.title} ==================`);
      console.log(`Trạng thái: ${data.translationStatus} | Độ dài: ${data.content?.length} ký tự`);
      console.log(`Điểm lưu loát (Fluency): ${fluency.score}/10 | Lỗi: ${fluency.issues.join("; ") || "Không có"}`);
      console.log("--- Đoạn trích đầu chương ---");
      console.log(data.content?.slice(0, 500));
      console.log("--- Đoạn trích cuối chương ---");
      console.log(data.content?.slice(-300));
    } else {
      console.log(`\n[CHƯƠNG ${ch}] Chưa có bản dịch (Gốc tồn tại: ${Boolean(rawOrig)})`);
    }
  }
}

main().catch(console.error);
