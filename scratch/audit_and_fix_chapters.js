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

delete require.cache[require.resolve("../server/gemini")];
delete require.cache[require.resolve("../server/translation-engine")];

const { createStorage } = require("../server/storage");
const { translateText } = require("../server/gemini");
const { createTranslationEngine } = require("../server/translation-engine");

function countHan(s) {
  const match = String(s || "").match(/[\u4e00-\u9fa5]/g);
  return match ? match.length : 0;
}

function checkChapterQuality(text, originalText = "") {
  if (!text || typeof text !== "string") {
    return { ok: false, reason: "empty_content" };
  }
  const trimmed = text.trim();
  if (trimmed.length < 150 && (originalText?.length || 0) > 300) {
    return { ok: false, reason: "too_short" };
  }

  // Check for think tags or thinking process leak
  if (/<think>|<\/think>|<think/i.test(trimmed) || /Here's a thinking process|Analyze User Input|Translate the provided Chinese/i.test(trimmed)) {
    return { ok: false, reason: "think_tag_leak" };
  }

  // Check for error placeholders
  if (trimmed.includes("Nội dung chương đang được cập nhật bản dịch") || trimmed.includes("Groq API HTTP") || trimmed.includes("Request too large")) {
    return { ok: false, reason: "error_placeholder" };
  }

  // Check for high Chinese character ratio
  const hanCount = countHan(trimmed);
  const hanRatio = hanCount / trimmed.length;
  if (hanCount > 30 && hanRatio > 0.15) {
    return { ok: false, reason: `high_chinese_ratio (${hanCount} chữ Hán)` };
  }

  // Check if identical to original
  if (originalText && trimmed === originalText.trim()) {
    return { ok: false, reason: "identical_to_original" };
  }

  return { ok: true };
}

async function mapConcurrent(items, concurrency, fn) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(items.length, concurrency) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  const storage = createStorage();
  const engine = createTranslationEngine();
  const keys = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").split(",").map(k => k.trim()).filter(Boolean);

  console.log("=== QUÉT NHANH ĐA LUỒNG KIỂM ĐỊNH TOÀN BỘ CHƯƠNG TRÊN R2 ===");

  const jobObjects = await storage.list("jobs/");
  const jobKeys = jobObjects.filter(o => o.key.endsWith("/translation.json"));
  console.log(`Tìm thấy ${jobKeys.length} bộ truyện có job.`);

  // Load all jobs concurrently
  const jobs = await mapConcurrent(jobKeys, 20, async (jobObj) => {
    const raw = await storage.get(jobObj.key);
    if (!raw) return null;
    try {
      const bookId = jobObj.key.split("/")[1];
      const data = JSON.parse(raw.toString());
      return { bookId, data };
    } catch {
      return null;
    }
  });

  const validJobs = jobs.filter(Boolean);
  const allCompletedChapters = [];
  for (const j of validJobs) {
    const completed = (j.data.chapters || []).filter(c => c.status === "completed");
    for (const c of completed) {
      allCompletedChapters.push({ bookId: j.bookId, chapterNumber: c.n });
    }
  }

  console.log(`Tổng cộng có ${allCompletedChapters.length} chương đã hoàn thành cần kiểm định chất lượng.`);

  // Audit chapters concurrently (25 workers)
  const defects = [];
  let checked = 0;

  await mapConcurrent(allCompletedChapters, 25, async (item) => {
    const chKey = `books/${item.bookId}/r1/ch/${item.chapterNumber}.json`;
    const rawCh = await storage.get(chKey);
    checked++;
    if (checked % 500 === 0 || checked === allCompletedChapters.length) {
      process.stdout.write(`  Đã kiểm tra ${checked}/${allCompletedChapters.length} chương...\r`);
    }

    if (!rawCh) {
      defects.push({ ...item, reason: "missing_file", chKey });
      return;
    }

    try {
      const doc = JSON.parse(rawCh.toString());
      const quality = checkChapterQuality(doc.content);
      if (!quality.ok) {
        defects.push({
          ...item,
          reason: quality.reason,
          chKey,
          origKey: `books/${item.bookId}/r1/ch/${item.chapterNumber}.original.json`,
          title: doc.title,
          contentPreview: doc.content?.slice(0, 100)
        });
      }
    } catch {
      defects.push({ ...item, reason: "corrupted_json", chKey });
    }
  });

  console.log(`\n\n=== KẾT QUẢ KIỂM ĐỊNH TOÀN HỆ THỐNG ===`);
  console.log(`- Tổng số chương đã kiểm tra: ${allCompletedChapters.length}`);
  console.log(`- Số chương đạt chuẩn xuất sắc: ${allCompletedChapters.length - defects.length}`);
  console.log(`- Số chương phát hiện lỗi/kém chất lượng: ${defects.length}`);

  if (defects.length > 0) {
    console.log("\nChi tiết các chương bị lỗi chất lượng:");
    for (const d of defects) {
      console.log(`- [${d.bookId}] Chương ${d.chapterNumber}: ${d.reason}`);
    }

    console.log(`\n=== BẮT ĐẦU SỬA CHỮA & DỊCH LẠI ${defects.length} CHƯƠNG LỖI BẰNG AI CHUẨN CAO CẤP ===`);
    let fixed = 0;

    for (let i = 0; i < defects.length; i++) {
      const d = defects[i];
      console.log(`[${i + 1}/${defects.length}] Đang dịch lại [${d.bookId}] ch ${d.chapterNumber}...`);

      const origKey = d.origKey || `books/${d.bookId}/r1/ch/${d.chapterNumber}.original.json`;
      const rawOrig = await storage.get(origKey);
      if (!rawOrig) {
        console.warn(`  [Bỏ qua] Không có file gốc ${origKey}`);
        continue;
      }

      const origDoc = JSON.parse(rawOrig.toString());
      const glossary = await engine.loadGlossary(d.bookId);

      try {
        const res = await translateText(origDoc.content, keys, {
          bookId: d.bookId,
          glossary,
          engine
        });

        const clean = engine.postProcessTranslation(res.translation, glossary);
        const updatedDoc = {
          chapterNumber: d.chapterNumber,
          title: origDoc.title || `Chương ${d.chapterNumber}`,
          content: clean,
          updatedAt: new Date().toISOString()
        };

        await storage.put(d.chKey, Buffer.from(JSON.stringify(updatedDoc, null, 2)), "application/json");
        console.log(`  ➔ SỬA XONG [${d.bookId}] ch ${d.chapterNumber} (${clean.length} ký tự).`);
        fixed++;

        await new Promise(r => setTimeout(r, 400));
      } catch (err) {
        console.error(`  [LỖI] Dịch lại thất bại:`, err.message);
      }
    }

    console.log(`\n=== ĐÃ SỬA VÀ DỊCH LẠI HOÀN TẤT ${fixed}/${defects.length} CHƯƠNG! ===`);
  } else {
    console.log("\n100% các chương đã hoàn thành đều đạt chuẩn chất lượng xuất sắc, không còn bất kỳ lỗi nào!");
  }
}

main().catch(console.error);
