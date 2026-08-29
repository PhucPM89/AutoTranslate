"use strict";

/**
 * HachimiMT Dedicated Translation Worker
 * Translates books/chapters using the HachimiMT model hosted on Google Colab.
 * 
 * Features:
 *   - Automatic Skipped/Corrupt Chapter Detection (Audits Chinese remnants and re-queues them).
 *   - Selective Range Translation (--from <n> --to <n>).
 *   - Resumable library-wide re-translation campaign (--retranslate-all).
 * 
 * Usage:
 *   node scripts/hachimi-translate.js                             # Auto-detects and translates all pending & skipped chapters
 *   node scripts/hachimi-translate.js --book <bookId>             # Translates all pending/skipped chapters in a book
 *   node scripts/hachimi-translate.js --book <bookId> --from 1 --to 300 # Re-translates chapters 1-300
 *   node scripts/hachimi-translate.js --book <bookId> --retranslate-all # Re-translates entire book from start to finish
 *   node scripts/hachimi-translate.js --continuous                # Continuous daemon loop
 */

const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        let val = match[2].trim();
        if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
        process.env[match[1]] = val;
      }
    }
  }
}

loadEnvFile(path.join(__dirname, "..", ".env.local"));
loadEnvFile(path.join(__dirname, "..", ".env"));

const { createStorage, LAYOUT } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { chapterKey, originalKey, buildChapterDocument } = require("../server/ingest/documents");
const {
  jobStateKey,
  runTranslationJobs,
  summarize,
  isSettled
} = require("../server/ingest/translation-queue");
const {
  checkHachimiHealth,
  resolveActiveHachimiUrl,
  translateChapterWithHachimi
} = require("../server/hachimi");
const { createTranslationEngine } = require("../server/translation-engine");
const {
  TRANSLATION_VERSION,
  needsTranslationVersion,
  stampTranslationVersion,
  isProtectedGeminiDocument
} = require("../server/translation-version");

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
=======================================================
   🚀 HACHIMI-MT DEDICATED TRANSLATION WORKER
=======================================================

Usage:
  node scripts/hachimi-translate.js [options]

Options:
  --url <url>            Public Cloudflare Tunnel URL from Colab (e.g. https://xxxx.trycloudflare.com)
  --book <bookId>        Translate only a specific book ID
  --chapter <n>          Translate only a specific chapter number
  --from <n> --to <n>    Translate a range of chapters (e.g. --from 1 --to 100)
  --retranslate-all      Re-translate every book once with the current name-lock version (resumable)
  --all-books            Alias of --retranslate-all
  --force                Force reset even if the current version was already completed (single run only)
  --reset-failed         Retry failed chapters
  --continuous / --loop  Run continuously as a background daemon
  --batch-size <n>       Number of chapters to process in parallel (default: 4)
  --no-audit             Disable auto-auditing for missing/corrupted chapters
  --help, -h             Show this help message

Examples:
  node scripts/hachimi-translate.js --url https://xxxx.trycloudflare.com --book mieu-cuong-co-su
  node scripts/hachimi-translate.js --continuous
`);
  process.exit(0);
}

const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const ONLY_BOOK = flag("--book", "");
const ONLY_CHAPTER = flag("--chapter", "");
const FROM_CHAPTER = flag("--from", "");
const TO_CHAPTER = flag("--to", "");
const API_URL = flag("--url", process.env.HACHIMI_API_URL || "");
const BATCH_SIZE = Math.max(1, Number(flag("--batch-size", process.env.HACHIMI_BATCH_SIZE || 4)));
const CONTINUOUS = args.includes("--continuous") || args.includes("--loop");
const RESET_FAILED = args.includes("--reset-failed") || args.includes("--retry-all");
const RETRANSLATE_ALL = args.includes("--retranslate-all") || args.includes("--all-books");
const FORCE_RETRANSLATE = args.includes("--force");
const AUDIT_MODE = !args.includes("--no-audit");

if (FORCE_RETRANSLATE && CONTINUOUS) {
  console.error("Không dùng đồng thời --force và --continuous: mỗi vòng sẽ reset lại toàn bộ chương.");
  process.exit(1);
}

async function readJson(storage, key) {
  try {
    const raw = await storage.get(key);
    return raw ? JSON.parse(raw.toString("utf8")) : null;
  } catch {
    return null;
  }
}

/**
 * Audits a book's chapters in storage to detect any chapter that was marked 'completed'
 * but actually contains raw Chinese characters, is missing, or is empty.
 */
async function auditAndResetChapters(storage, bookId, revision, chapters) {
  let resetCount = 0;
  const bookIndex = await readJson(storage, `books/${bookId}/index.json`);
  const indexByNumber = new Map(
    (bookIndex?.chapters || []).map((entry) => [Number(entry.chapterNumber ?? entry.n), entry])
  );
  const fromNum = FROM_CHAPTER ? Number(FROM_CHAPTER) : -Infinity;
  const toNum = TO_CHAPTER ? Number(TO_CHAPTER) : Infinity;

  // Process in parallel chunks of 50
  const CHUNK_SIZE = 50;
  for (let i = 0; i < chapters.length; i += CHUNK_SIZE) {
    const chunk = chapters.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (ch) => {
        const n = Number(ch.n);
        const docKey = LAYOUT.chapter(bookId, revision, n);
        const doc = await readJson(storage, docKey);

        // Gemini and Gemini-QA are the highest quality tier. No Hachimi mode,
        // including a library-wide rebuild or --force, may overwrite them.
        const indexEntry = indexByNumber.get(n);
        if (isProtectedGeminiDocument(doc) || isProtectedGeminiDocument(indexEntry) || isProtectedGeminiDocument(ch)) {
          ch.status = "completed";
          ch.provider = "gemini";
          return;
        }

        // The version stamp turns a library-wide reset into a resumable
        // campaign. A restarted worker skips chapters already rebuilt by this
        // name-lock version instead of beginning the whole library again.
        const needsCurrentVersion = RETRANSLATE_ALL && needsTranslationVersion(ch);
        if (FORCE_RETRANSLATE || needsCurrentVersion || (n >= fromNum && n <= toNum && (FROM_CHAPTER || TO_CHAPTER))) {
          if (ch.status !== "pending" || ch.attempts || ch.nextAttemptAt || ch.completedAt) {
            ch.status = "pending";
            ch.attempts = 0;
            ch.lastError = "";
            ch.nextAttemptAt = 0;
            ch.completedAt = "";
            resetCount++;
          }
          return;
        }

        if (RESET_FAILED && ch.status === "failed") {
          ch.status = "pending";
          ch.attempts = 0;
          ch.lastError = "";
          resetCount++;
          return;
        }

        // Deep Audit: check if storage document really has valid Vietnamese
        if (AUDIT_MODE && ch.status === "completed") {
          const content = String(doc?.content || "").trim();

          // If document is missing, empty, or has raw Chinese characters
          const hasChinese = /[\u4e00-\u9fa5]/.test(content);
          if (!doc || content.length < 50 || hasChinese) {
            ch.status = "pending";
            ch.attempts = 0;
            ch.lastError = "";
            resetCount++;
          }
        }
      })
    );
  }

  return resetCount;
}

async function listJobs(storage, focusBookId) {
  if (focusBookId) {
    const state = await readJson(storage, jobStateKey(focusBookId));
    if (state && Array.isArray(state.chapters)) {
      const revision = state.revision || 1;
      const resetCount = await auditAndResetChapters(storage, focusBookId, revision, state.chapters);
      if (resetCount > 0) {
        console.log(`  [Audit] Đã phát hiện & kích hoạt dịch lại ${resetCount} chương bị sót/lỗi của ${focusBookId}.`);
      }

      if (ONLY_CHAPTER) {
        state.chapters = state.chapters.filter((ch) => String(ch.n) === String(ONLY_CHAPTER));
        if (state.chapters[0]) {
          state.chapters[0].status = "pending";
          state.chapters[0].attempts = 0;
        }
      }

      if (!isSettled(state)) {
        return [{ bookId: focusBookId, revision, state }];
      }
    }
    return [];
  }

  const objects = await storage.list("jobs/");
  const jobs = [];
  for (const object of objects) {
    if (!object.key.endsWith("/translation.json")) continue;
    const state = await readJson(storage, object.key);
    if (!state || !Array.isArray(state.chapters)) continue;

    const revision = state.revision || 1;
    const resetCount = await auditAndResetChapters(storage, state.bookId, revision, state.chapters);
    if (resetCount > 0) {
      console.log(`  [Audit] Đã phát hiện & kích hoạt dịch lại ${resetCount} chương bị sót/lỗi của ${state.bookId}.`);
    }

    if (ONLY_CHAPTER) {
      state.chapters = state.chapters.filter((ch) => String(ch.n) === String(ONLY_CHAPTER));
      if (state.chapters[0]) {
        state.chapters[0].status = "pending";
        state.chapters[0].attempts = 0;
      }
    }

    if (!isSettled(state)) {
      jobs.push({
        bookId: state.bookId,
        revision,
        state
      });
    }
  }
  return jobs;
}

const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");

async function syncIndexAndDatabase(storage, db, bookId, rev, state) {
  const indexKeyPath = `books/${bookId}/index.json`;
  const index = await readJson(storage, indexKeyPath);
  if (!index) return;

  const statusMap = new Map((state.chapters || []).map((c) => [c.n, c.status]));
  let translatedCount = 0;

  for (const ch of index.chapters || []) {
    const s = statusMap.get(ch.chapterNumber);
    if (s === "completed") {
      ch.translationStatus = "completed";
      translatedCount++;
    }
  }

  index.translatedChapters = translatedCount;
  index.updatedAt = new Date().toISOString();

  await storage.put(indexKeyPath, JSON.stringify(index), {
    contentType: "application/json",
    cacheControl: "no-cache"
  });

  if (db) {
    try {
      if (typeof db.updateBookProgress === "function") {
        await db.updateBookProgress(bookId, {
          totalChapters: index.totalChapters,
          translatedChapters: translatedCount,
          revision: rev
        });
      }
      if (typeof db.upsertChapters === "function") {
        const completedChapters = (index.chapters || [])
          .filter((ch) => statusMap.get(ch.chapterNumber) === "completed")
          .map((ch) => ({
            chapterNumber: ch.chapterNumber,
            title: ch.title,
            translationStatus: "completed",
            characters: ch.characters || 0
          }));
        if (completedChapters.length > 0) {
          await db.upsertChapters(bookId, rev, completedChapters);
        }
      }
    } catch (err) {
      console.warn("Lỗi sync Supabase:", err.message);
    }
  }

  try {
    await publishCatalogSnapshot({ storage, db });
  } catch (err) {
    console.warn("Lỗi publish catalog:", err.message);
  }
}

async function main() {
  console.log("\n=======================================================");
  console.log("   🚀 HACHIMI-MT DEDICATED TRANSLATION WORKER");
  console.log("=======================================================\n");

  const storage = createStorage();
  const db = createSupabase();
  const engine = createTranslationEngine({ storage });

  console.log("- Đang tự động định tuyến kết nối tới Hachimi GPU Colab...");
  let activeUrl = await resolveActiveHachimiUrl(storage, API_URL);

  if (!activeUrl) {
    console.error("❌ Chưa cấu hình HACHIMI_API_URL và không tìm thấy Server Colab đang chạy.");
    console.error("👉 Hãy mở Google Colab (colab/hachimi_colab_server.ipynb) và bấm 'Run all'.");
    console.error("   Hệ thống sẽ tự động bắt URL mà bạn không cần copy dán thủ công!\n");
    process.exit(1);
  }

  const health = await checkHachimiHealth(activeUrl);
  if (!health.ok) {
    console.error(`❌ Không thể kết nối tới HachimiMT server tại ${activeUrl}: ${health.error}`);
    console.error("👉 Hãy kiểm tra lại xem Google Colab còn đang chạy không.");
    process.exit(1);
  }

  console.log(`✅ Kết nối thành công! Public API URL: ${activeUrl}`);
  console.log(`   Model: ${health.data.model} (Thiết bị: ${health.data.device})\n`);

  let stop = false;

  while (!stop) {
    const jobs = await listJobs(storage, ONLY_BOOK);
    if (!jobs.length) {
      console.log("Không có truyện nào đang chờ dịch.");
      if (!CONTINUOUS) break;
      console.log("Chờ 30 giây rồi quét lại...");
      await new Promise((r) => setTimeout(r, 30000));
      continue;
    }

    for (const job of jobs) {
      const summary = summarize(job.state);
      console.log(`\n===============================================================`);
      console.log(`>>> [HACHIMI DỊCH] Bộ truyện: ${job.bookId}`);
      console.log(`    - Đã dịch xong chuẩn tiếng Việt: ${summary.completed} chương`);
      console.log(`    - Cần dịch bằng HachimiMT:       ${summary.pending + (summary.failed || 0)} chương (bị sót / convert / chưa dịch)`);
      console.log(`    - Tổng số chương:                ${summary.total} chương`);
      console.log(`===============================================================`);

      // Scan the complete source book before translating its first chapter.
      // A cast member introduced in chapter 200 and returning in chapter 500
      // must already be locked at the first occurrence, not learned afterwards.
      const originalCache = new Map();
      const loadOriginal = (n) => {
        if (!originalCache.has(n)) {
          originalCache.set(n, readJson(storage, originalKey(job.bookId, job.revision, n)));
        }
        return originalCache.get(n);
      };
      const glossarySeedTexts = [];
      const chapterNumbers = job.state.chapters.map((entry) => Number(entry.n)).filter(Number.isFinite);
      for (let i = 0; i < chapterNumbers.length; i += 40) {
        const samples = await Promise.all(chapterNumbers.slice(i, i + 40).map(loadOriginal));
        for (const sample of samples) {
          if (sample) glossarySeedTexts.push(sample.title, sample.content);
        }
      }
      let glossary = glossarySeedTexts.length
        ? await engine.mineAndMergeGlossary(job.bookId, glossarySeedTexts)
        : await engine.loadGlossary(job.bookId);

      await runTranslationJobs({
        state: job.state,
        requestBudget: Infinity,
        batchSize: BATCH_SIZE,
        loadChapter: loadOriginal,
        translateChapter: async (chapter) => {
          const t0 = Date.now();
          glossary = await engine.mineAndMergeGlossary(job.bookId, [chapter.title, chapter.content]);
          const translated = await translateChapterWithHachimi(chapter, {
            apiUrl: activeUrl,
            glossary
          });
          if (!translated || !translated.content) {
            throw new Error(`Hachimi Colab không trả nội dung dịch cho chương ${chapter.chapterNumber}.`);
          }
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          console.log(`  ✓ ch ${chapter.chapterNumber} [${translated.title}]: hoàn thành (${elapsed}s)`);
          return translated;
        },
        publishChapter: async (chapter, result) => {
          const translationText = typeof result === "string" ? result : result?.content;
          const translatedTitle = (typeof result === "object" && result?.title) ? result.title : chapter.title;
          await storage.put(
            chapterKey(job.bookId, job.revision, chapter.chapterNumber),
            JSON.stringify(
              buildChapterDocument({
                bookId: job.bookId,
                revision: job.revision,
                chapter: {
                  ...chapter,
                  title: translatedTitle
                },
                translation: translationText,
                translationStatus: "completed",
                provider: "hachimi",
                model: result?.model || "HachimiMT-60-QT",
                translationVersion: TRANSLATION_VERSION
              })
            )
          );
          const stateEntry = job.state.chapters.find((entry) => entry.n === chapter.chapterNumber);
          stampTranslationVersion(stateEntry);
        },
        saveState: async (nextState) => {
          await storage.put(jobStateKey(job.bookId), JSON.stringify(nextState));
          await syncIndexAndDatabase(storage, db, job.bookId, job.revision, nextState);
        },
        onProgress: ({ chapter, completed, total }) => {
          const pct = Math.round((completed / total) * 100);
          console.log(`    Tiến độ ${job.bookId}: ${completed}/${total} (${pct}%)`);
        }
      });

      console.log(`\n✓ Hoàn tất xử lý bộ truyện ${job.bookId}`);
    }

    if (!CONTINUOUS) {
      stop = true;
      console.log("\n🎉 Dịch hoàn tất toàn bộ queue!\n");
    }
  }
}

main().catch((err) => {
  console.error("Lỗi worker:", err);
  process.exit(1);
});
