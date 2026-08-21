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

const { translateText } = require("../server/gemini");

async function main() {
  const keysStr = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
  const chineseText = "第1章 重生归来\n夜色如墨，暴雨倾盆。林尘站在悬崖边缘，目光如电，俯瞰着脚下的万丈深渊。他终于回来了，回到了千年前那个改变他命运的夜晚！";

  console.log("Đang dịch thử đoạn tiếng Trung bằng Groq Qwen...");
  const res = await translateText(chineseText, keysStr, { bookId: "test-book" });
  console.log("Kết quả dịch:");
  console.log(res.translation);
}

main().catch(console.error);
