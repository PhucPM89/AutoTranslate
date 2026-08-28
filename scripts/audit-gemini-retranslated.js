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

async function auditNovelGeminiChapters() {
  const storage = createStorage(env);
  const bookId = "fanqie-7373165433928567832"; // Địa Phủ Xuất Hiện Một Thái Tử Gia

  console.log("==========================================================================");
  console.log("   🔍 KIỂM TRA TOÀN DIỆN CÁC CHƯƠNG ĐÃ ĐƯỢC GEMINI HẬU KIỂM & DỊCH LẠI");
  console.log("      Bộ truyện: Địa Phủ Xuất Hiện Một Thái Tử Gia");
  console.log("==========================================================================\n");

  const indexRaw = await storage.get(`books/${bookId}/index.json`);
  if (!indexRaw) {
    console.error(`❌ Không tìm thấy index của bộ truyện ${bookId}`);
    return;
  }
  const index = JSON.parse(indexRaw.toString("utf8"));
  const chapters = index.chapters || [];

  console.log(`- Tổng số chương trong bộ truyện: ${chapters.length}`);

  // Find all chapters tagged as gemini or with completed status
  const geminiChapters = [];
  const allCompleted = [];

  for (let idx = 0; idx < chapters.length; idx++) {
    const ch = chapters[idx];
    const chNum = ch.n || ch.chapterNumber || (idx + 1);
    if (ch.provider === "gemini" || ch.qaReviewed) {
      geminiChapters.push({ idx, chNum, ch });
    }
    if (ch.translationStatus === "completed" || ch.status === "completed") {
      allCompleted.push({ idx, chNum, ch });
    }
  }

  console.log(`- Số chương có tag [provider: 'gemini']: ${geminiChapters.length}`);
  console.log(`- Số chương có trạng thái 'completed': ${allCompleted.length}\n`);

  // Target list to audit
  const targetList = geminiChapters.length > 0 ? geminiChapters : allCompleted;

  if (targetList.length === 0) {
    console.log("Chưa có chương nào được đánh dấu hoàn tất trong index.");
    return;
  }

  console.log(`📋 Đang tải và kiểm tra chất lượng thực tế của ${targetList.length} chương...\n`);

  let totalScore = 0;
  let perfectCount = 0;
  let goodCount = 0;
  let issueCount = 0;
  const auditedChapters = [];

  for (const item of targetList) {
    const chNum = item.chNum;
    const rawCh = await storage.get(`books/${bookId}/r1/ch/${chNum}.json`).catch(() => null);
    if (!rawCh) continue;

    const chDoc = JSON.parse(rawCh.toString("utf8"));
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
    const ratio = origLen > 0 ? (content.length / origLen).toFixed(2) : "N/A";

    totalScore += score;
    if (score >= 9.5) perfectCount++;
    else if (score >= 8.5) goodCount++;
    else issueCount++;

    auditedChapters.push({
      chNum,
      title: chDoc.title || item.ch.title,
      provider: chDoc.provider || item.ch.provider || "N/A",
      model: chDoc.model || item.ch.model || "N/A",
      characters: content.length,
      origLength: origLen,
      ratio,
      score,
      issues,
      hanCount: hanMatches.length,
      excerpt: content.slice(0, 180).replace(/\n+/g, " ")
    });
  }

  const avgScore = auditedChapters.length > 0 ? (totalScore / auditedChapters.length).toFixed(2) : 0;

  console.log("==========================================================================");
  console.log("📊 KẾT QUẢ ĐÁNH GIÁ CHẤT LƯỢNG THỰC TẾ:");
  console.log(`- Số chương đã kiểm tra:              ${auditedChapters.length} chương`);
  console.log(`- Điểm chất lượng trung bình:         ${avgScore} / 10.0 ⭐`);
  console.log(`- Số chương xuất sắc (9.5 - 10.0 đ):  ${perfectCount} chương (${((perfectCount/auditedChapters.length)*100).toFixed(1)}%)`);
  console.log(`- Số chương đạt chuẩn (8.5 - 9.4 đ):   ${goodCount} chương (${((goodCount/auditedChapters.length)*100).toFixed(1)}%)`);
  console.log(`- Số chương còn điểm trừ (< 8.5 đ):   ${issueCount} chương`);
  console.log("==========================================================================\n");

  // Show detailed samples
  console.log("📑 MẪU KIỂM TRA ĐỐI CHIẾU 10 CHƯƠNG TIÊU BIỂU:\n");
  const samples = [
    ...auditedChapters.slice(0, 5),
    ...auditedChapters.slice(-5)
  ];

  const seen = new Set();
  for (const s of samples) {
    if (seen.has(s.chNum)) continue;
    seen.add(s.chNum);
    console.log(`🔹 [Chương ${s.chNum}]: "${s.title}"`);
    console.log(`   • Điểm Fluency: ${s.score}/10 | Chữ Hán sót: ${s.hanCount} | Tỷ lệ độ dài: ${s.ratio}x (${s.characters} ký tự)`);
    console.log(`   • Provider: ${s.provider} | Model: ${s.model}`);
    if (s.issues.length > 0) {
      console.log(`   • Điểm lưu ý: ${s.issues.join("; ")}`);
    } else {
      console.log(`   • Nhận xét: Không có lỗi, văn phong thuần Việt 100%.`);
    }
    console.log(`   • Trích đoạn: "${s.excerpt}..."\n`);
  }
}

auditNovelGeminiChapters().catch(console.error);
