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

const { createStorage } = require("../server/storage/index");
const { calculateFluencyScore } = require("../server/reflection-engine");

async function auditThaiTuGia() {
  const storage = createStorage(env);
  const bookId = "fanqie-7373165433928567832"; // Địa Phủ Xuất Hiện Một Thái Tử Gia

  console.log("==========================================================================");
  console.log("   🔍 BÁO CÁO HẬU KIỂM & ĐÁNH GIÁ CHẤT LƯỢNG BẢN DỊCH CHI TIẾT");
  console.log("      Bộ truyện: [Địa Phủ Xuất Hiện Một Thái Tử Gia]");
  console.log("==========================================================================\n");

  const indexRaw = await storage.get(`books/${bookId}/index.json`);
  const index = indexRaw ? JSON.parse(indexRaw.toString("utf8")) : { chapters: [] };
  const totalChapters = index.chapters?.length || 1665;

  console.log(`- Tổng số chương trong bộ truyện: ${totalChapters.toLocaleString("vi-VN")} chương.`);

  // Sample chapters to audit across the entire book
  // Chapters 1..30 (Head), 100..120, 500..584 (Recent active scan range), 1000..1010
  const sampleIndices = [
    ...Array.from({ length: 15 }, (_, i) => i + 1),       // Ch 1-15
    ...Array.from({ length: 10 }, (_, i) => i + 100),     // Ch 100-109
    ...Array.from({ length: 15 }, (_, i) => i + 570),     // Ch 570-584 (Vừa quét & sửa)
    ...Array.from({ length: 5 }, (_, i) => i + 1000)      // Ch 1000-1004
  ];

  let totalScore = 0;
  let perfectCount = 0;
  let goodCount = 0;
  let lowCount = 0;
  let totalHanzi = 0;
  const auditedList = [];

  for (const chNum of sampleIndices) {
    if (chNum > totalChapters) continue;

    const chRaw = await storage.get(`books/${bookId}/r1/ch/${chNum}.json`).catch(() => null);
    if (!chRaw) continue;

    const chDoc = JSON.parse(chRaw.toString("utf8"));
    const content = String(chDoc.content || "").trim();
    const origRaw = await storage.get(`books/${bookId}/r1/ch/${chNum}.original.json`).catch(() => null);
    let origLen = 0;
    if (origRaw) {
      try {
        const origDoc = JSON.parse(origRaw.toString("utf8"));
        origLen = origDoc.content ? origDoc.content.length : 0;
      } catch {}
    }

    const { score, issues } = calculateFluencyScore(content);
    const hanMatches = content.match(/[\u4e00-\u9fa5]/g) || [];
    totalHanzi += hanMatches.length;

    totalScore += score;
    if (score >= 9.5) perfectCount++;
    else if (score >= 8.5) goodCount++;
    else lowCount++;

    const ratio = origLen > 0 ? (content.length / origLen).toFixed(2) : "N/A";

    auditedList.push({
      chNum,
      title: chDoc.title || `Chương ${chNum}`,
      provider: chDoc.provider || "hachimi",
      model: chDoc.model || "HachimiMT-60-QT",
      characters: content.length,
      origLength: origLen,
      ratio,
      score,
      issues,
      hanCount: hanMatches.length,
      excerpt: content.slice(0, 160).replace(/\n+/g, " ")
    });
  }

  const avgScore = (totalScore / auditedList.length).toFixed(2);

  console.log("==========================================================================");
  console.log("📊 KẾT QUẢ ĐỐI CHIẾU CHẤT LƯỢNG MẪU:");
  console.log(`- Số chương mẫu đã kiểm tra thực tế:  ${auditedList.length} chương`);
  console.log(`- Điểm chất lượng trung bình:          ${avgScore} / 10.0 ⭐`);
  console.log(`- Chương đạt chuẩn xuất sắc (9.5-10đ): ${perfectCount} chương (${((perfectCount/auditedList.length)*100).toFixed(1)}%)`);
  console.log(`- Chương đạt chuẩn tốt (8.5 - 9.4 đ):  ${goodCount} chương (${((goodCount/auditedList.length)*100).toFixed(1)}%)`);
  console.log(`- Chương dưới ngưỡng (< 8.5 đ):        ${lowCount} chương`);
  console.log(`- Tổng chữ Hán sót phát hiện:          ${totalHanzi} chữ`);
  console.log("==========================================================================\n");

  console.log("📑 CHI TIẾT CÁC CHƯƠNG VỪA ĐƯỢC HẬU KIỂM & CÁC CHƯƠNG GỐC:\n");
  for (const s of auditedList) {
    const starTag = s.score >= 9.5 ? "⭐⭐⭐ HOÀN HẢO" : s.score >= 8.5 ? "⭐⭐ ĐẠT CHUẨN" : "⚠️ CẦN SỬA";
    console.log(`🔹 [Chương ${s.chNum}]: "${s.title}" (${starTag})`);
    console.log(`   • Điểm Fluency: ${s.score}/10 | Chữ Hán sót: ${s.hanCount} | Tỷ lệ độ dài: ${s.ratio}x (${s.characters} ký tự)`);
    console.log(`   • Provider: ${s.provider} | Model: ${s.model}`);
    if (s.issues.length > 0) {
      console.log(`   • Điểm lưu ý: ${s.issues.join("; ")}`);
    } else {
      console.log(`   • Đánh giá: Văn phong thuần Việt, không lỗi ngữ pháp.`);
    }
    console.log(`   • Trích đoạn: "${s.excerpt}..."\n`);
  }
}

auditThaiTuGia().catch(console.error);
