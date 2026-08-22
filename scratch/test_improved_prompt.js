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

const sampleTitles = [
  { title: "踏天境", author: "永夜星河", desc: "修炼一途，乃逆天改命..." },
  { title: "十日终焉", author: "杀虫队队员", desc: "（这是一本很难定义的书，前期微恐，中后期高智商博弈）" },
  { title: "凡人修仙之符祖", author: "番茄蘸大酱", desc: "韩立同人，符箓之道..." },
  { title: "仙界闭关小能手", author: "香果味奶茶", desc: "穿越仙界，获得闭关系统..." },
  { title: "开局长生，苟在下界吃土飞升", author: "混沌核心", desc: "穿越修仙界，苟道流..." },
  { title: "诡舍", author: "夜来风雨声丶", desc: "诡异降临，逃生诡舍..." },
  { title: "凡骨", author: "壹更大师", desc: "天生凡骨，逆天伐仙..." },
  { title: "开局S级怪谈，但给我C级天赋？", author: "苍白纪元", desc: "规则怪谈降临..." }
];

async function translateMetaImproved(source, apiKey) {
  const prompt = [
    "Bạn là một biên tập viên kiêm dịch giả tiểu thuyết mạng Trung Quốc (Tiên hiệp, Huyền huyễn, Mạt thế, Quái đàm, Đô thị) kỳ cựu sang tiếng Việt.",
    "Hãy dịch metadata tiểu thuyết sau sang tiếng Việt chuẩn văn phong tiểu thuyết mạng hay nhất.",
    "",
    "QUY TẮC BẮT BUỘC KHI DỊCH:",
    "1. TIÊU ĐỀ (title):",
    "   - PHẢI dùng âm Hán-Việt hoặc lối dịch chuẩn mực của cộng đồng đọc truyện Việt Nam cho các thuật ngữ tiên hiệp, huyền huyễn, chiêu thức, cảnh giới, thể loại.",
    "   - VÍ DỤ:",
    "     * 踏天境 -> Đạp Thiên Cảnh",
    "     * 十日终焉 -> Thập Nhật Chung Yên",
    "     * 凡人修仙之符祖 -> Phàm Nhân Tu Tiên Chi Phù Tổ",
    "     * 仙界闭关小能手 -> Tiên Giới Bế Quan Tiểu Năng Thủ",
    "     * 开局长生，苟在下界吃土飞升 -> Khởi Đầu Trường Sinh, Cẩu Ở Hạ Giới Tu Luyện Phi Thăng",
    "     * 诡舍 -> Quỷ Xá",
    "     * 凡骨 -> Phàm Cốt",
    "     * 开局S级怪谈，但给我C级天赋？ -> Khởi Đầu Quái Đàm Cấp S, Nhưng Lại Cho Ta Thiên Phú Cấp C?",
    "   - Tiêu đề phải kêu, hấp dẫn, đúng phong vị tiểu thuyết.",
    "",
    "2. TÁC GIẢ (author):",
    "   - Chuyển 100% sang âm Hán-Việt chuẩn xác cho tên/bút danh tác giả. Ví dụ: 夜来风雨声 -> Dạ Lai Phong Vũ Thanh, 永夜星河 -> Vĩnh Dạ Tinh Hà, 杀虫队队员 -> Sát Trùng Đội Đội Viên, 以非当年少 -> Dĩ Phi Đương Niên Thiếu.",
    "",
    "3. GIỚI THIỆU (description):",
    "   - Dịch toàn văn, trôi chảy, giữ đúng chất kịch tính/tiên hiệp của tác phẩm.",
    "",
    "Chỉ trả về định dạng JSON đúng schema sau, không kèm bất kỳ văn bản nào khác:",
    "{\"title\": \"...\", \"author\": \"...\", \"description\": \"...\"}",
    "",
    "Metadata nguồn:",
    JSON.stringify(source)
  ].join("\n");

  const url = "https://api.groq.com/openai/v1/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: "You are a professional Chinese to Vietnamese novel translator. Always return valid JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_completion_tokens: 1500
    })
  });
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    console.log("Raw output:", raw);
    return {};
  }
  return JSON.parse(match[0]);
}

async function main() {
  const key = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").split(",")[0].trim();
  for (const s of sampleTitles) {
    const res = await translateMetaImproved(s, key);
    console.log(`[ZH] ${s.title} (${s.author}) ➔ [VI] ${res.title} | Tác giả: ${res.author}`);
  }
}

main().catch(console.error);
