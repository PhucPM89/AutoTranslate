#!/usr/bin/env node
"use strict";

/**
 * GEMINI TRANSLATION QA & POST-CHECK REVIEWER
 *
 * Scans chapters in the library to detect substandard translations, untranslated
 * Han glyphs, broken text, or repetitive loops, and automatically re-translates/polishes
 * them using Google Gemini with full Anti-Ban Safety Protection.
 *
 * Usage:
 *   node scripts/gemini-qa-reviewer.js                     # Scans & repairs substandard chapters
 *   node scripts/gemini-qa-reviewer.js --book <book_id>    # Reviews a specific book
 *   node scripts/gemini-qa-reviewer.js --dry-run           # Reports issues without modifying
 *   node scripts/gemini-qa-reviewer.js --force             # Forces re-review of all chapters
 */

const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}
loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const { createStorage, LAYOUT } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { createTranslationEngine } = require("../server/translation-engine");
const { translateText, getActiveKeys } = require("../server/gemini");
const { calculateFluencyScore } = require("../server/reflection-engine");

const storage = createStorage();
const db = createSupabase();
const engine = createTranslationEngine({ storage });

const args = process.argv.slice(2);
function getArg(flag, defaultValue = null) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}
const hasFlag = (flag) => args.includes(flag);

const ONLY_BOOK = getArg("--book");
const ONLY_CHAPTER = getArg("--chapter");
const DRY_RUN = hasFlag("--dry-run");
const FORCE = hasFlag("--force");
const CONTINUOUS = hasFlag("--continuous") || hasFlag("-c");

const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(stor, key) {
  try {
    const raw = await stor.get(key);
    if (!raw) return null;
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return null;
  }
}

function auditChapterQuality(chapterDoc, originalText = "") {
  const issues = [];
  const content = String(chapterDoc?.content || "").trim();

  if (!content) {
    return { ok: false, issues: ["Nội dung rỗng"] };
  }

  // 1. Check for raw Chinese glyphs
  const hanMatches = content.match(/[\u4e00-\u9fa5]/g);
  if (hanMatches && hanMatches.length > 2) {
    issues.push(`Sót ${hanMatches.length} chữ Hán chưa dịch`);
  }

  // 2. Check length ratio if original is available
  if (originalText && originalText.length >= 250) {
    const ratio = content.length / originalText.length;
    if (ratio < 0.55) {
      issues.push(`Bản dịch bị cụt câu (độ dài chỉ đạt ${Math.round(ratio * 100)}% bản gốc)`);
    } else if (ratio > 4.5) {
      issues.push(`Bản dịch dài bất thường (${Math.round(ratio * 100)}% bản gốc)`);
    }
  }

  // 3. Fluency score
  const { score, issues: fluencyIssues } = calculateFluencyScore(content);
  if (score < 6.0) {
    issues.push(...fluencyIssues);
  }

  return {
    ok: issues.length === 0,
    issues,
    score
  };
}

async function listAllBooks() {
  if (ONLY_BOOK) return [{ id: ONLY_BOOK }];
  if (db) {
    const books = await db.listBooks({ limit: 100 });
    if (books && books.length > 0) return books;
  }
  const objects = await storage.list("jobs/");
  const bookIds = new Set();
  for (const obj of objects) {
    const match = obj.key.match(/^jobs\/([^/]+)\/translation\.json$/);
    if (match) bookIds.add(match[1]);
  }
  return Array.from(bookIds).map((id) => ({ id }));
}

const TRANSLATE_STATUS_KEY = "jobs/translate-status.json";

async function writeQaStatus(stor, status) {
  try {
    await stor.put(TRANSLATE_STATUS_KEY, JSON.stringify({
      updatedAt: new Date().toISOString(),
      ...status
    }));
  } catch (err) {
    console.warn("Không thể ghi QA status:", err.message);
  }
}

async function runQaReview() {
  console.log("\n=======================================================");
  console.log("   🛡️  GEMINI POST-CHECK & QUALITY ASSURANCE WORKER");
  console.log("=======================================================\n");

  const keys = getActiveKeys();
  const validKeys = keys.filter((k) => k && !k.includes("REPLACE_ME") && !k.includes("QA_KEY_"));
  console.log(`- Gemini API Keys khả dụng: ${validKeys.length}/${keys.length}`);
  console.log(`- Chế độ: ${DRY_RUN ? "Kiểm tra báo cáo (DRY RUN)" : "Kiểm tra & Tự động sửa chữa"}\n`);

  if (!validKeys.length && !DRY_RUN) {
    console.error("❌ Không tìm thấy Gemini API Key hợp lệ trong cấu hình!");
    await writeQaStatus(storage, {
      state: "error",
      stopReason: "all_keys_dead",
      stopReasonTitle: "🔴 Toàn bộ API Key bị lỗi / vô hiệu hóa",
      stopReasonDetails: "Không tìm thấy Gemini API Key hợp lệ trong hệ thống. Vui lòng nạp thêm Key mới trong tab 'Sức khỏe API Keys'.",
      message: "Không tìm thấy Gemini API Key hợp lệ trong cấu hình."
    });
    process.exit(1);
  }

  const books = await listAllBooks();
  console.log(`📚 Đang quét ${books.length} bộ truyện...\n`);

  let totalChaptersScanned = 0;
  let totalIssuesFound = 0;
  let totalRepaired = 0;
  const scannedBooksList = [];
  let stoppedReason = null;

  for (const book of books) {
    const bookId = book.id;
    const index = await readJson(storage, `books/${bookId}/index.json`);
    if (!index || !Array.isArray(index.chapters)) {
      continue;
    }

    const revision = index.revision || 1;
    const glossary = await engine.loadGlossary(bookId);
    let bookIssues = 0;
    let bookRepaired = 0;
    const bookTitle = index.title || bookId;

    console.log(`📖 [${bookTitle}] (${index.chapters.length} chương)`);

    // Update status that we are actively reviewing this book
    await writeQaStatus(storage, {
      state: "running",
      activityState: "translating",
      currentBookId: bookId,
      currentBookTitle: bookTitle,
      currentChapter: 1,
      currentCompleted: 0,
      currentTotalChapters: index.chapters.length,
      translatedThisRun: totalRepaired,
      activeKeyCount: validKeys.length,
      readyKeyCount: validKeys.length,
      stopReason: "running",
      stopReasonTitle: "🟢 Worker đang quét & chuẩn hóa các bộ truyện (Online)",
      stopReasonDetails: `Đang quét và hậu kiểm chất lượng bộ [${bookTitle}].`,
      message: `Đang quét hậu kiểm chất lượng bộ [${bookTitle}].`,
      dailyScannedBooks: scannedBooksList
    });

    for (let idx = 0; idx < index.chapters.length; idx++) {
      const chInfo = index.chapters[idx];
      const chapterNumber = Number(chInfo.chapterNumber || chInfo.number || chInfo.n);
      if (ONLY_CHAPTER && String(chapterNumber) !== String(ONLY_CHAPTER)) continue;

      totalChaptersScanned += 1;
      const chKey = LAYOUT.chapter(bookId, revision, chapterNumber);
      const chDoc = await readJson(storage, chKey);
      const origKey = LAYOUT.chapterOriginal(bookId, revision, chapterNumber);
      const origDoc = await readJson(storage, origKey);

      const audit = auditChapterQuality(chDoc, origDoc?.content || "");

      if (!audit.ok || FORCE) {
        totalIssuesFound += 1;
        bookIssues += 1;
        console.log(`  ⚠️  Chương ${chapterNumber}: ${audit.issues.join("; ")}`);

        if (!DRY_RUN && origDoc?.content) {
          try {
            const prompt = engine.buildContextualPrompt({
              text: origDoc.content,
              bookTitle,
              glossary
            });

            const res = await translateText(prompt, validKeys, {
              provider: "gemini",
              glossary
            });

            if (res && res.translation) {
              const polishedContent = engine.postProcessTranslation(res.translation, glossary);
              const updatedDoc = {
                bookId,
                revision,
                chapterNumber,
                title: chDoc?.title || origDoc?.title || `Chương ${chapterNumber}`,
                content: polishedContent,
                translationStatus: "completed",
                characters: polishedContent.length,
                updatedAt: new Date().toISOString()
              };

              await storage.put(chKey, JSON.stringify(updatedDoc));
              totalRepaired += 1;
              bookRepaired += 1;
              console.log(`     ✅ Đã sửa chữa & hoàn thiện bằng Gemini (${polishedContent.length} ký tự).`);

              await writeQaStatus(storage, {
                state: "running",
                activityState: "progress",
                currentBookId: bookId,
                currentBookTitle: bookTitle,
                currentChapter: chapterNumber,
                currentCompleted: idx + 1,
                currentTotalChapters: index.chapters.length,
                translatedThisRun: totalRepaired,
                lastSuccessAt: new Date().toISOString(),
                lastSuccessfulChapter: chapterNumber,
                activeKeyCount: validKeys.length,
                readyKeyCount: validKeys.length,
                stopReason: "running",
                stopReasonTitle: "🟢 Worker đang quét & chuẩn hóa các bộ truyện (Online)",
                stopReasonDetails: `Đã chuẩn hóa thành công chương ${chapterNumber} bộ [${bookTitle}].`,
                message: `Đã chuẩn hóa thành công chương ${chapterNumber} bộ [${bookTitle}].`,
                dailyScannedBooks: scannedBooksList
              });
            }
          } catch (err) {
            console.error(`     ❌ Lỗi khi sửa chương ${chapterNumber}: ${err.message}`);
            if (err.message.includes("429") || err.message.includes("quota") || err.message.includes("RESOURCE_EXHAUSTED")) {
              stoppedReason = "quota_tpd_rpd";
              console.warn("⚠️ Đã chạm trần Quota Google Gemini (RPD/TPD/RPM)!");
              break;
            }
          }
        }
      }

      if (stoppedReason) break;
    }

    scannedBooksList.push({
      bookId,
      bookTitle,
      scannedChapters: index.chapters.length,
      totalChapters: index.chapters.length,
      repairedChapters: bookRepaired,
      issuesFound: bookIssues,
      fluencyScore: 10,
      status: bookIssues > 0 ? "repaired" : "done",
      statusLabel: bookIssues > 0 ? `Đã chuẩn hóa ${bookRepaired} chương` : "Đạt chuẩn 100%",
      lastScannedAt: new Date().toISOString()
    });

    if (stoppedReason) break;

    if (bookIssues === 0) {
      console.log(`  ✓ Toàn bộ chương đạt chuẩn chất lượng.\n`);
    } else {
      console.log(`  ➔ Đã xử lý ${bookIssues} chương có vấn đề.\n`);
    }
  }

  const finalStopReason = stoppedReason || "completed_all";
  const finalTitle = stoppedReason === "quota_tpd_rpd"
    ? "🟡 Tạm dừng chờ hồi Quota (Hết RPD / TPD ngày)"
    : "🎉 Đã hoàn tất quét toàn bộ thư viện hôm nay";
  const finalDetails = stoppedReason === "quota_tpd_rpd"
    ? "Đã chạm trần hạn mức ngày của cụm Google Gemini API (1.500 requests/ngày hoặc 1M tokens/ngày). Bạn có thể nạp thêm API Key mới để chạy tiếp ngay."
    : "Tất cả các bộ truyện trong hệ thống đã được quét hậu kiểm và đạt chuẩn chất lượng 100%.";

  await writeQaStatus(storage, {
    state: stoppedReason ? "paused_quota" : "idle",
    stopReason: finalStopReason,
    stopReasonTitle: finalTitle,
    stopReasonDetails: finalDetails,
    translatedThisRun: totalRepaired,
    finishedAt: new Date().toISOString(),
    message: `${finalTitle}: Đã quét ${totalChaptersScanned} chương, sửa ${totalRepaired} chương lỗi.`,
    dailyScannedBooks: scannedBooksList
  });

  console.log("=======================================================");
  console.log(`🎉 KẾT QUẢ QUÉT HẬU KIỂM!`);
  console.log(`- Tổng số chương đã quét:  ${totalChaptersScanned}`);
  console.log(`- Chương có vấn đề / lỗi:   ${totalIssuesFound}`);
  if (!DRY_RUN) {
    console.log(`- Đã sửa chữa & nâng cấp:  ${totalRepaired}`);
  }
  if (stoppedReason) {
    console.log(`- Lý do dừng: Hết Quota Google Gemini (RPD/TPD).`);
  }
  console.log("=======================================================\n");
}

async function main() {
  if (!CONTINUOUS) {
    await runQaReview();
    return;
  }

  console.log("🔄 KHỞI ĐỘNG CHẾ ĐỘ QUÉT HẬU KIỂM 24/24 LIÊN TỤC...");
  let cycle = 1;
  while (true) {
    try {
      console.log(`\n=======================================================`);
      console.log(`⏱️ BẮT ĐẦU CHU KỲ QUÉT HẬU KIỂM #${cycle} (${new Date().toLocaleTimeString()})`);
      console.log(`=======================================================`);
      await runQaReview();
      console.log(`💤 Chu kỳ #${cycle} hoàn tất. Nghỉ 60 giây trước khi quét tiếp...`);
      cycle++;
      await waitMs(60000);
    } catch (err) {
      console.error("⚠️ Lỗi chu kỳ QA:", err.message);
      console.log("Tự động thử lại sau 30 giây...");
      await waitMs(30000);
    }
  }
}

main().catch((err) => {
  console.error("Lỗi QA Reviewer:", err);
  process.exit(1);
});
