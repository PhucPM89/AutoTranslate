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

const { createStorage } = require("../server/storage");
const { buildConvertEngineFromDisk } = require("../server/convert");
const { originalKey, chapterKey } = require("../server/ingest/documents");

async function main() {
  const storage = createStorage();

  // Find a book with completed chapters
  const jobs = (await storage.list("jobs/")).filter((o) => o.key.endsWith("/translation.json"));
  console.log(`Tìm thấy ${jobs.length} jobs.`);

  let chosenBookId = null;
  let chosenRev = 1;
  let chosenChapterN = 5;

  for (const j of jobs.slice(0, 10)) {
    const buf = await storage.get(j.key);
    if (!buf) continue;
    try {
      const st = JSON.parse(buf.toString("utf8"));
      const done = (st.chapters || []).find((c) => c.status === "completed" && c.n >= 5);
      if (done) {
        chosenBookId = st.bookId;
        chosenRev = st.revision || 1;
        chosenChapterN = done.n;
        break;
      }
    } catch {}
  }

  if (!chosenBookId) {
    console.error("Không tìm thấy chương completed nào trên R2.");
    return;
  }

  console.log(`\n======================================================`);
  console.log(`ĐANG CHẠY DỊCH THỬ NGHIỆM CHƯƠNG THỰC TẾ TRÊN R2`);
  console.log(`- Book ID: ${chosenBookId}`);
  console.log(`- Chapter: #${chosenChapterN}`);
  console.log(`======================================================\n`);

  // Load Chinese original and Gemini translation
  const [zhBuf, viBuf] = await Promise.all([
    storage.get(originalKey(chosenBookId, chosenRev, chosenChapterN)),
    storage.get(chapterKey(chosenBookId, chosenRev, chosenChapterN))
  ]);

  if (!zhBuf) {
    console.error("Không tải được bản gốc tiếng Trung.");
    return;
  }

  const zhData = JSON.parse(zhBuf.toString("utf8"));
  const viData = viBuf ? JSON.parse(viBuf.toString("utf8")) : null;

  const rawZhText = zhData.content || "";
  const geminiText = viData ? (viData.content || "") : "";

  // Build Super Engine
  const engine = buildConvertEngineFromDisk();
  const startTime = Date.now();
  const superConvertText = engine.convert(rawZhText);
  const convertDuration = Date.now() - startTime;

  console.log(`✓ Thời gian chuyển đổi toàn bộ chương: ${convertDuration} ms\n`);

  // Compare paragraphs
  const zhParas = rawZhText.split(/\n+/).filter(Boolean);
  const convParas = superConvertText.split(/\n+/).filter(Boolean);
  const geminiParas = geminiText.split(/\n+/).filter(Boolean);

  console.log("=== TRÍCH ĐOẠN ĐỐI CHIẾU SONG NGỮ (THÂN BÀI CỐT TRUYỆN) ===\n");

  const startPara = Math.min(6, zhParas.length - 1);
  const endPara = Math.min(startPara + 8, zhParas.length);

  for (let i = startPara; i < endPara; i++) {
    console.log(`--- [ĐOẠN ${i + 1}] ---`);
    console.log(`🇨🇳 GỐC TIẾNG TRUNG:`);
    console.log(`   ${zhParas[i]}`);
    console.log(`⚡ SUPER ENGINE DỊCH:`);
    console.log(`   ${convParas[i]}`);
    if (geminiParas[i]) {
      console.log(`🤖 GEMINI 1.5 DỊCH:`);
      console.log(`   ${geminiParas[i]}`);
    }
    console.log("");
  }
}

main();
