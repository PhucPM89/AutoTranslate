"use strict";
const path = require("path");
const fs = require("fs");

function loadEnv(file) {
  if (fs.existsSync(file)) {
    for (const l of fs.readFileSync(file, "utf8").split("\n")) {
      const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        let v = m[2].trim();
        if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  }
}
loadEnv(path.join(__dirname, "..", ".env"));
loadEnv(path.join(__dirname, "..", ".env.local"));

async function testSingle(source) {
  const keys = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").split(",");
  const key = keys[Math.floor(Math.random() * keys.length)].trim();
  const prompt = [
    "Bạn là một dịch giả tiểu thuyết mạng Trung Quốc (Tiên hiệp, Huyền huyễn, Mạt thế, Quái đàm) sang tiếng Việt kỳ cựu.",
    "Hãy dịch thông tin tiểu thuyết sau sang tiếng Việt chuẩn văn phong tiểu thuyết:",
    "1. Tiêu đề (title): Dùng âm Hán-Việt hoặc lối dịch chuẩn mực (ví dụ: 踏天境 -> Đạp Thiên Cảnh, 十日终焉 -> Thập Nhật Chung Yên, 凡骨 -> Phàm Cốt, 诡舍 -> Quỷ Xá).",
    "2. Tác giả (author): Chuyển 100% sang âm Hán-Việt chuẩn.",
    "3. Giới thiệu (description): Dịch trọn vẹn, hấp dẫn.",
    "",
    "Chỉ trả về JSON theo mẫu:",
    "{\"title\": \"...\", \"author\": \"...\", \"description\": \"...\"}",
    "",
    "Dữ liệu nguồn:",
    JSON.stringify(source)
  ].join("\n");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_completion_tokens: 1500
    })
  });
  const data = await res.json();
  console.log("Response:", JSON.stringify(data));
}

testSingle({ title: "十日终焉", author: "杀虫队队员", description: "这是一本很难定义的书" });
