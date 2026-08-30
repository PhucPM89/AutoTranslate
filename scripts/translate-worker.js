"use strict";

const dns = require("dns");
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

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

loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { createStorage, createArchiveStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { chapterKey, originalKey, buildChapterDocument } = require("../server/ingest/documents");
const { publishIndex } = require("../server/ingest/ingest-book");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");
const {
  jobStateKey,
  runTranslationJobs,
  summarize,
  isDone,
  isSettled
} = require("../server/ingest/translation-queue");
const {
  translateText,
  translateMetadata,
  translateBatchChapters,
  parseApiKeys,
  getKeyPoolStats,
  exportKeyPoolState,
  importKeyPoolState
} = require("../server/gemini");
const { createTranslationEngine } = require("../server/translation-engine");
const {
  readTranslationConfig,
  writeTranslationConfig
} = require("../server/translation-config");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const REQUEST_BUDGET = Number(flag("--budget", process.env.TRANSLATE_BUDGET || 0)) || Infinity;
const RUN_MINUTES = Number(flag("--minutes", process.env.TRANSLATE_RUN_MINUTES || 300));
const ONLY_BOOK = flag("--book", "");
const SHARD_INDEX = Number(flag("--shard-index", process.env.TRANSLATE_SHARD_INDEX || 0));
const TOTAL_SHARDS = Math.max(1, Number(flag("--total-shards", process.env.TRANSLATE_TOTAL_SHARDS || 1)));
const BATCH_SIZE = Math.max(1, Number(flag("--batch-size", process.env.TRANSLATE_BATCH_SIZE || process.env.TRANSLATE_CONCURRENCY || 12)));
const CONTINUOUS_MODE = !args.includes("--once") && (args.includes("--continuous") || args.includes("--loop") || process.env.TRANSLATE_CONTINUOUS !== "false");
const RESERVE_MS = 3 * 60 * 1000;
const PUBLISH_EVERY = Math.max(1, Number(process.env.TRANSLATE_PUBLISH_EVERY || 20));
const CHAPTERS_PER_TURN = Math.max(1, Number(process.env.TRANSLATE_CHAPTERS_PER_TURN || 5));
const ROTATION_KEY = "jobs/translate-rotation.json";
const TRANSLATE_STATUS_KEY = "jobs/translate-status.json";
const TRANSLATE_KEY_HEALTH_KEY = "jobs/translate-key-health.json";

let lastChapterTokens = 2200;

function computeAdaptiveSpacing(keyList) {
  if (process.env.TRANSLATE_SPACING_MS) {
    return Math.max(0, Number(process.env.TRANSLATE_SPACING_MS));
  }
  const stats = getKeyPoolStats(keyList);
  const readyKeys = stats.filter((s) => s.ready).length;
  
  if (readyKeys >= 12) {
    // 12-20 keys: Ultra Parallel Waves Mode (~100ms spacing between 6-chapter waves)
    return 100;
  } else if (readyKeys >= 8) {
    return 250;
  } else if (readyKeys >= 5) {
    return 500;
  } else if (readyKeys >= 3) {
    return 1000;
  } else if (readyKeys >= 1) {
    return 2000;
  }
  return 4000;
}

async function readJson(storage, key) {
  try {
    const raw = await storage.get(key);
    if (!raw) return null;
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return null;
  }
}

async function writeTranslateStatus(storage, status) {
  try {
    await storage.put(TRANSLATE_STATUS_KEY, JSON.stringify({
      updatedAt: new Date().toISOString(),
      ...status
    }));
  } catch (err) {
    console.warn("Unable to write translate status:", err.message);
  }
}

// Buckets every key into a single clear state so the dashboard can answer
// "is a key dead, or just resting?" at a glance:
//   ready    - usable right now
//   dead     - invalid/revoked (auth failure); needs a human to replace it
//   daily    - hit its daily quota; frees up at the next reset
//   cooldown - short rate-limit / transient backoff; frees up in minutes
// The status object stores aggregates only. The backing R2 object can be read
// directly from the public bucket, so even masked key fingerprints do not
// belong in it.
function summarizeKeyStats(stats = []) {
  let ready = 0;
  let dead = 0;
  let daily = 0;
  let cooldown = 0;
  for (const stat of stats) {
    // Auth failures remain actionable even after their timed cooldown expires:
    // the credential still needs replacing until it proves successful again.
    if (stat.quotaClass === "auth" || stat.recoveryPolicy === "disable_invalid_key") {
      dead += 1;
    } else if (stat.ready) {
      ready += 1;
    } else if (stat.quotaClass === "daily") {
      daily += 1;
    } else {
      cooldown += 1;
    }
  }
  return {
    activeKeyCount: stats.length,
    readyKeyCount: ready,
    deadKeyCount: dead,
    dailyExhaustedKeyCount: daily,
    cooldownKeyCount: cooldown
  };
}

function summarizeKeyPool(keyList) {
  return summarizeKeyStats(getKeyPoolStats(keyList));
}

function sanitizeStatusError(value) {
  return String(value || "")
    .replace(/organization\s+`[^`]+`/gi, "organization")
    .replace(/\b(?:org|user|project)_[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

async function main() {
  const storage = createStorage();
  const reset = await readJson(storage, "jobs/reset-active.json");
  if (reset?.active && Number(reset.expiresAtEpochMs || 0) > Date.now()) {
    console.log("Translation worker tạm dừng vì toàn thư viện đang reset.");
    return;
  }
  // Credentials and provider-health diagnostics are operational secrets, so
  // they live only in the private archive bucket, never the CDN reader bucket.
  const privateStorage = createArchiveStorage();

  // Load dynamically configured keys from R2 Storage if present
  let keyList = [];
  try {
    const rawKeys = privateStorage && await privateStorage.get("config/api-keys.json");
    if (rawKeys) {
      const parsed = JSON.parse(rawKeys.toString("utf8"));
      if (Array.isArray(parsed) && parsed.length > 0) {
        keyList = parsed;
      }
    }
  } catch {}

  const envKeys = [
    process.env.GEMINI_API_KEYS,
    process.env.GEMINI_API_KEY,
    process.env.GROQ_API_KEYS,
    process.env.GROQ_API_KEY,
    process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN
      ? `cfai:${process.env.CLOUDFLARE_ACCOUNT_ID}:${process.env.CLOUDFLARE_API_TOKEN}`
      : "",
  ].filter(Boolean).flatMap(k => parseApiKeys(k));

  const isHachimi = process.env.TRANSLATION_PROVIDER === "hachimi" || Boolean(process.env.HACHIMI_API_URL);

  // R2 is the shared key registry, while environment keys are the deployment
  // bootstrap/fallback. Merge both: choosing one source made a newly-added
  // GROQ_API_KEY invisible whenever R2 already contained Gemini keys.
  const allUniqueKeys = Array.from(new Set([...keyList, ...envKeys]))
    .filter(Boolean)
    .sort((a, b) => translationKeyPriority(a) - translationKeyPriority(b));
  if (!allUniqueKeys.length && !isHachimi) {
    throw new Error("Thiếu API Keys (Gemini / Groq) hoặc HACHIMI_API_URL.");
  }
  if (isHachimi && !allUniqueKeys.length) {
    allUniqueKeys.push("hachimi-colab-endpoint");
  }
  importKeyPoolState(privateStorage ? await readJson(privateStorage, TRANSLATE_KEY_HEALTH_KEY) : null, allUniqueKeys);
  const persistKeyHealth = () => privateStorage
    ? privateStorage.put(
        TRANSLATE_KEY_HEALTH_KEY,
        JSON.stringify(exportKeyPoolState(allUniqueKeys)),
        { cacheControl: "private, no-store" }
      ).catch((error) => console.warn(`Không lưu được cooldown API key: ${error.message}`))
    : Promise.resolve();
  const apiKey = allUniqueKeys.join(",");
  const db = createSupabase();
  const engine = createTranslationEngine({ storage });
  const deadlineAt = Date.now() + Math.max(0, RUN_MINUTES * 60 * 1000 - RESERVE_MS);

  let translationConfig = await readTranslationConfig(storage);
  let configuredFocus = ONLY_BOOK || translationConfig.focusBookId;
  let jobs = await listJobs(storage, configuredFocus);
  if (!jobs.length && translationConfig.focusBookId && !ONLY_BOOK) {
    console.log(`Bộ ưu tiên ${translationConfig.focusBookId} không còn chương chờ; chuyển về chế độ tự động.`);
    translationConfig = await writeTranslationConfig(storage, { focusBookId: "" });
    configuredFocus = "";
    jobs = await listJobs(storage, "");
  }
  if (!jobs.length) {
    console.log("Không có job dịch nào đang chờ.");
    await writeTranslateStatus(storage, {
      state: "idle",
      focusBookId: translationConfig.focusBookId,
      selectionMode: translationConfig.focusBookId ? "focused" : "automatic",
      ...summarizeKeyPool(allUniqueKeys),
      spacingMs: computeAdaptiveSpacing(allUniqueKeys),
      finishedAt: new Date().toISOString(),
      message: "Tất cả các bộ truyện đã được dịch đầy đủ. Không có job chờ."
    });
    return;
  }

  // Round-robin, a slice at a time, so every book moves every day.
  //
  // Draining one queue at a time is wrong for a reader whichever end you start.
  // Longest-first spreads the daily allowance over everything and finishes
  // nothing; shortest-first finishes books but leaves someone reading book nine
  // waiting weeks to see a single translated chapter. Taking a small slice from
  // each book in turn means every title gains ground daily, which is what stops
  // anyone waiting indefinitely on the one book they happen to be reading.
  //
  // Ordered by id rather than size so the cycle is stable between runs, and
  // rotated to resume after whichever book was served last - otherwise a day that
  // runs out of quota part-way keeps favouring the same few books tomorrow.
  // Ordered by id rather than size so the cycle is stable between runs, and
  // rotated to resume after whichever book was served last - otherwise a day that
  // runs out of quota part-way keeps favouring the same few books tomorrow.
  const ordered = [...jobs].sort((a, b) => a.bookId.localeCompare(b.bookId));
  const rotation = (await readJson(storage, ROTATION_KEY)) || {};
  const resumeAfter = ordered.findIndex((job) => job.bookId === rotation.lastBookId);
  const queue =
    resumeAfter >= 0 ? [...ordered.slice(resumeAfter + 1), ...ordered.slice(0, resumeAfter + 1)] : ordered;

  // Active readers & top read books from Supabase analytics
  const activeReadBooks = await (db?.readTopBooks?.({ limit: 20 }).catch(() => [])) || [];
  const activeBookIds = new Set(activeReadBooks.map((b) => b.bookId));

  // Sort queue: Sequential Book Completion Mode
  // 1. VIP Active Books (currently being read by real readers)
  // 2. In-progress books with highest completion (finish almost-done books first so readers get 100% full translations!)
  // 3. Smaller pending books, then stable ID
  queue.sort((a, b) => {
    const aIsActive = activeBookIds.has(a.bookId);
    const bIsActive = activeBookIds.has(b.bookId);
    if (aIsActive !== bIsActive) return bIsActive ? 1 : -1;

    const aDone = (a.total || 0) - (a.pending || 0) - (a.failed || 0);
    const bDone = (b.total || 0) - (b.pending || 0) - (b.failed || 0);
    if (aDone > 0 || bDone > 0) {
      // Prioritize novel with highest completion count to finish 100% fastest
      const aPct = (a.total || 0) ? (aDone / a.total) : 0;
      const bPct = (b.total || 0) ? (bDone / b.total) : 0;
      if (Math.abs(bPct - aPct) > 0.05) return bPct - aPct;
      return bDone - aDone;
    }

    if (b.highPriority !== a.highPriority) return b.highPriority - a.highPriority;
    return a.bookId.localeCompare(b.bookId);
  });

  let activeQueue = queue;
  if (TOTAL_SHARDS > 1) {
    const normalizedShard = (SHARD_INDEX >= 1 && SHARD_INDEX <= TOTAL_SHARDS) ? (SHARD_INDEX - 1) : Math.max(0, SHARD_INDEX);
    activeQueue = queue.filter((job, idx) => (idx % TOTAL_SHARDS) === normalizedShard);
    console.log(`\n=== [SHARD ${normalizedShard + 1}/${TOTAL_SHARDS}] Được phân bổ ${activeQueue.length}/${queue.length} bộ truyện ===`);
  }

  console.log(`\n=== CHẾ ĐỘ DỊCH DỨT ĐIỂM TỪNG BỘ TRUYỆN 100% ===`);
  console.log(`Có ${activeQueue.length} book trong hàng đợi worker (Batch size: ${BATCH_SIZE}, ${activeBookIds.size} book VIP toàn hệ thống):`);
  for (const job of activeQueue.slice(0, 10)) {
    const vipTag = activeBookIds.has(job.bookId) ? " [VIP ĐỘC GIẢ]" : "";
    const done = (job.total || 0) - (job.pending || 0) - (job.failed || 0);
    const pct = job.total ? Math.round((done / job.total) * 100) : 0;
    console.log(`  ${job.bookId} r${job.revision}: Đã dịch ${done}/${job.total} (${pct}%)${vipTag} — Còn ${job.pending} chương`);
  }
  if (activeQueue.length > 10) console.log(`  ... và ${activeQueue.length - 10} bộ truyện khác đang xếp hàng.`);

  const existingStatus = (await readJson(storage, TRANSLATE_STATUS_KEY)) || {};
  // Every Actions run is a distinct session. Reusing a cancelled run's timestamp
  // makes speed/ETA collapse toward zero and mislabels the new focused run.
  const startedAt = new Date().toISOString();
  let recentActivity = Array.isArray(existingStatus.recentActivity) ? existingStatus.recentActivity : [];
  const catalog = (await readJson(storage, "catalog/latest.json")) || {};
  const titleMap = new Map((catalog.books || []).map((b) => [b.id, b.title]));
  recentActivity = recentActivity.filter((activity) => titleMap.has(activity.bookId));
  const selectionMode = configuredFocus ? "focused" : "automatic";

  let spentTotal = 0;
  let translatedTotal = 0;
  let stoppedForQuota = false;
  let stop = false;
  let quotaResumeAt = 0;
  let quotaBookId = "";
  let quotaBookTitle = "";
  let quotaChapter = 0;
  let quotaCompleted = 0;
  let quotaTotal = 0;
  let cycle = 0;
  let lastSuccessAt = "";
  let lastSuccessfulChapter = 0;
  let lastRunError = "";

  // Publishing is throttled per book: every 5 chapters published immediately
  const PUBLISH_EVERY_CHAPTERS = 5;
  const sincePublish = new Map();
  const touched = new Map();
  const rowChecked = new Set();
  const outputsChecked = new Set();

  const publishBook = (job) =>
    refreshBookOutputs({ storage, db, job, state: job.state }).catch((error) =>
      console.warn(`  (không publish được tiến độ ${job.bookId}: ${error.message})`)
    );

  const parsedKeys = parseApiKeys(apiKey);

  while (!stop) {
    cycle += 1;
    let translatedThisCycle = 0;

    for (const job of activeQueue) {
      if (spentTotal >= REQUEST_BUDGET || Date.now() >= deadlineAt) {
        stop = true;
        break;
      }
      if (isSettled(job.state)) continue;

      if (!rowChecked.has(job.bookId)) {
        await ensureBookRow({ storage, db, job });
        rowChecked.add(job.bookId);
      }
      if (!outputsChecked.has(job.bookId)) {
        const index = await readJson(storage, `books/${job.bookId}/index.json`);
        if (bookOutputsNeedRefresh(index, job.state)) {
          console.log(`  [${job.bookId}] Index đọc bị lệch queue; đồng bộ lại trước khi dịch tiếp.`);
          await refreshBookOutputs({ storage, db, job, state: job.state });
        }
        outputsChecked.add(job.bookId);
      }

      const bTitle = titleMap.get(job.bookId) || job.bookId;
      let lastKnownCompleted = summarize(job.state).completed;
      console.log(`\n===============================================================`);
      console.log(`>>> [KHÓA CHẶT DỊCH 100%] Bộ truyện: "${bTitle}" (${job.bookId})`);
      console.log(`===============================================================`);

      const originalCache = new Map();
      const chapterTranslationMeta = new Map();
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
      let bookGlossary = glossarySeedTexts.length
        ? await engine.mineAndMergeGlossary(job.bookId, glossarySeedTexts)
        : await engine.loadGlossary(job.bookId);

      while (!isSettled(job.state) && spentTotal < REQUEST_BUDGET && Date.now() < deadlineAt) {
        const remainingBudget = REQUEST_BUDGET === Infinity ? Infinity : REQUEST_BUDGET - spentTotal;
        const result = await runTranslationJobs({
          state: job.state,
          requestBudget: remainingBudget, // Translate all chapters of this book until done!
          deadlineAt,
          spacingMs: () => computeAdaptiveSpacing(allUniqueKeys),
          batchSize: BATCH_SIZE,
          strictSequential: Boolean(configuredFocus),
          loadChapter: loadOriginal,
          translateChapter: async (chapter) => {
            const existing = await readJson(storage, chapterKey(job.bookId, job.revision, chapter.chapterNumber));
            if (!job.state.forceRetranslateAll && existing && existing.translationStatus === "completed" && existing.content) {
              console.log(`  ch ${chapter.chapterNumber}: đã có bản dịch trên R2, bỏ qua Groq AI`);
              chapterTranslationMeta.set(chapter.chapterNumber, {
                title: existing.title || chapter.title,
                provider: existing.provider || "existing",
                model: existing.model || "existing",
                translationVersion: existing.translationVersion || "existing"
              });
              return existing.content;
            }
            bookGlossary = await engine.mineAndMergeGlossary(job.bookId, [chapter.title, chapter.content]);
            const output = await translateText(chapter.content, apiKey, {
              bookId: job.bookId,
              bookTitle: bTitle,
              glossary: bookGlossary,
              engine,
              provider: "cloud"
            });
            if (!output || !output.translation) throw new Error("Groq AI không trả bản dịch.");
            let translatedTitle = chapter.title;
            if (/\p{Script=Han}/u.test(String(chapter.title || ""))) {
              const titleResult = await translateMetadata({
                title: chapter.title,
                author: "",
                description: ""
              }, apiKey);
              translatedTitle = titleResult.title || chapter.title;
            }
            const provider = output.providersUsed?.[0] || "cloud";
            const model = output.modelsUsed?.[0] || "unknown";
            chapterTranslationMeta.set(chapter.chapterNumber, {
              title: translatedTitle,
              provider,
              model,
              translationVersion: provider === "groq" ? "groq-qwen-direct-v1" : `${provider}-direct-v1`
            });
            if (output.tokensUsed) {
              lastChapterTokens = output.tokensUsed;
            }
            return output.translation;
          },
          publishChapter: async (chapter, translation) => {
            const meta = chapterTranslationMeta.get(chapter.chapterNumber) || {};
            await storage.put(
              chapterKey(job.bookId, job.revision, chapter.chapterNumber),
              JSON.stringify(
                buildChapterDocument({
                  bookId: job.bookId,
                  revision: job.revision,
                  chapter: { ...chapter, title: meta.title || chapter.title },
                  translation,
                  translationStatus: "completed",
                  provider: meta.provider || "cloud",
                  model: meta.model || "unknown",
                  translationVersion: meta.translationVersion || "cloud-direct-v1"
                })
              )
            );
          },
          saveState: (next) => storage.put(jobStateKey(job.bookId), JSON.stringify(next)),
          onProgress: async ({ chapter, chapters, status, completed, total, sessionDelta, spentDelta, attempts, lastError }) => {
            const currentTotalSession = translatedTotal + (sessionDelta || 0);
            const currentSpent = spentTotal + (spentDelta || 0);
            const bTitle = titleMap.get(job.bookId) || job.bookId;
            const elapsedMin = Math.max(0.05, (Date.now() - new Date(startedAt).getTime()) / 60000);
            const currentSpeed = Math.round((currentTotalSession / elapsedMin) * 10) / 10;
            const currentSpacing = computeAdaptiveSpacing(allUniqueKeys);
            const keyPool = summarizeKeyPool(allUniqueKeys);
            const readyKeyCount = keyPool.readyKeyCount;
            if (completed > lastKnownCompleted) {
              lastKnownCompleted = completed;
              lastSuccessAt = new Date().toISOString();
              lastSuccessfulChapter = chapter;
            }
            if (lastError) lastRunError = sanitizeStatusError(lastError);
            const activityState = readyKeyCount === 0 && status !== "completed"
              ? "waiting_quota"
              : status === "translating"
              ? "translating"
              : status === "completed"
                ? "progress"
                : "retrying";
            const activeChapters = Array.isArray(chapters) && chapters.length ? chapters : [chapter].filter(Boolean);
            const chapterLabel = activeChapters.length > 1
              ? `${activeChapters[0]}–${activeChapters[activeChapters.length - 1]}`
              : String(chapter || "?");
            const activityMessage = activityState === "translating"
              ? `Đang gửi chương ${chapterLabel} tới AI.`
              : activityState === "progress"
                ? `Đã dịch và lưu thành công chương ${chapter}.`
                : activityState === "waiting_quota"
                  ? `Chương ${chapter} đang chờ quota; 0/${allUniqueKeys.length} key sẵn sàng, worker không gửi thêm request.`
                : `Chương ${chapter} chưa thành công; worker đang chờ để thử lại.`;
            console.log(`  [${bTitle}] ch ${chapter}: ${status}  (${completed}/${total}) [Phiên này: +${currentTotalSession} ch] [Điều tốc: ${Math.round(currentSpacing/1000)}s/ch]`);
            await writeTranslateStatus(storage, {
              state: "running",
              focusBookId: configuredFocus,
              selectionMode,
              ...keyPool,
              spacingMs: currentSpacing,
              startedAt,
              speed: currentSpeed,
              currentBookId: job.bookId,
              currentBookTitle: bTitle,
              currentChapter: chapter,
              activeChapters,
              currentCompleted: completed,
              currentTotalChapters: total,
              translatedThisRun: currentTotalSession,
              spentRequests: currentSpent,
              currentAttempt: Number(attempts || 0),
              activityState,
              activityMessage,
              lastAttemptAt: new Date().toISOString(),
              lastSuccessAt,
              lastSuccessfulChapter,
              lastError: sanitizeStatusError(lastError),
              recentActivity,
              message: `${activityMessage} Tiến độ thật ${completed}/${total}; phiên này +${currentTotalSession} chương.`,
              queue: queue.map((j) => {
                const isCurrent = j.bookId === job.bookId;
                const failedCh = isCurrent ? summarize(job.state).failed : Number(j.failed || 0);
                const doneCh = isCurrent ? completed : (j.total || 0) - (j.pending || 0) - failedCh;
                const pendCh = isCurrent ? Math.max(0, total - completed - failedCh) : j.pending;
                return {
                  bookId: j.bookId,
                  revision: j.revision,
                  pending: pendCh,
                  highPriority: j.highPriority || activeBookIds.has(j.bookId),
                  total: j.total,
                  translated: doneCh
                };
              })
            });
            if (status !== "translating") await persistKeyHealth();
          }
        });

        spentTotal += result.spent;
        await persistKeyHealth();
        translatedTotal += result.translated;
        translatedThisCycle += result.translated;

        if (result.translated) {
          touched.set(job.bookId, job);
          const bTitle = titleMap.get(job.bookId) || job.bookId;
          recentActivity = [
            {
              bookId: job.bookId,
              title: bTitle,
              count: result.translated,
              at: new Date().toISOString()
            },
            ...recentActivity
          ].slice(0, 30);

          const waiting = (sincePublish.get(job.bookId) || 0) + result.translated;
          if (isDone(job.state)) {
            sincePublish.set(job.bookId, 0);
            await publishBook(job);
            if (!ONLY_BOOK && translationConfig.focusBookId === job.bookId) {
              translationConfig = await writeTranslationConfig(storage, { focusBookId: "" });
              console.log(`  Đã hoàn tất bộ ưu tiên; trả dashboard về chế độ tự động.`);
            }
            console.log(`\n🎉🎉🎉 [${bTitle}] ĐÃ DỊCH HOÀN TẤT TRỌN VẸN 100% (${job.total}/${job.total} chương)! Đã xuất bản lên thư viện.`);
            break;
          } else if (waiting >= PUBLISH_EVERY_CHAPTERS) {
            sincePublish.set(job.bookId, 0);
            await publishBook(job);
            console.log(`  [${job.bookId}] -> đã publish tiến độ (+${waiting} chương)`);
          } else {
            sincePublish.set(job.bookId, waiting);
          }
        }

        if (result.failed && isSettled(job.state) && !isDone(job.state)) {
          touched.set(job.bookId, job);
          sincePublish.set(job.bookId, 0);
          await publishBook(job);
          const counts = summarize(job.state);
          if (!ONLY_BOOK && translationConfig.focusBookId === job.bookId) {
            translationConfig = await writeTranslationConfig(storage, { focusBookId: "" });
            console.log(`  Bộ ưu tiên không còn chương dịch được; trả dashboard về chế độ tự động.`);
          }
          console.warn(`  [${job.bookId}] Queue đã hết chương dịch được: ${counts.completed}/${counts.total} completed, ${counts.failed} failed. Đã publish trạng thái để worker không kẹt.`);
          break;
        }

        rotation.lastBookId = job.bookId;
        await storage.put(ROTATION_KEY, JSON.stringify(rotation)).catch(() => {});

        if (isSettled(job.state)) {
          break;
        }

        if (result.quotaExhausted) {
          const earliestMs = result.earliestCooldown ? Math.max(5000, result.earliestCooldown - Date.now()) : 30000;
          if (CONTINUOUS_MODE && earliestMs <= 90_000) {
            const waitSec = Math.min(60, Math.max(5, Math.round(earliestMs / 1000)));
            console.log(`  -> [${bTitle}] Key kế tiếp sắp sẵn sàng. Nghỉ ${waitSec} giây rồi tiếp tục...`);
            await new Promise((r) => setTimeout(r, waitSec * 1000));
          } else {
            stoppedForQuota = true;
            stop = true;
            quotaResumeAt = Number(result.earliestCooldown || Date.now() + 30_000);
            quotaBookId = job.bookId;
            quotaBookTitle = bTitle;
            quotaChapter = Number(result.chapter || job.state?.cursor || 0);
            quotaCompleted = Number(result.summary?.completed || 0);
            quotaTotal = Number(result.summary?.total || job.total || 0);
            const resumeLabel = new Date(quotaResumeAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
            console.log(`  -> Mạch quota đã mở. Không gửi thêm request; sẽ tiếp tục sau ${resumeLabel}.`);
            break;
          }
        } else if (!result.translated) {
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }

    // A full pass that translated nothing means every queue is finished or
    // waiting on a backoff.
    if (!translatedThisCycle) {
      if (stop) break;
      if (CONTINUOUS_MODE) {
        console.log("  [24/7 Continuous Mode] Hàng đợi tạm thời không còn chương chờ. Nghỉ 30s trước vòng lặp tiếp theo...");
        await new Promise((r) => setTimeout(r, 30000));
        continue;
      }
      break;
    }
  }

  // Anything with unpublished progress is written once at the end, so counts are
  // current even for books whose slice never reached the publish threshold.
  for (const [bookId, job] of touched) {
    if (!sincePublish.get(bookId)) continue;
    await publishBook(job);
  }

  await persistKeyHealth();
  await writeTranslateStatus(storage, {
    state: stoppedForQuota ? "paused_quota" : "idle",
    focusBookId: translationConfig.focusBookId,
    selectionMode: translationConfig.focusBookId ? "focused" : "automatic",
    ...summarizeKeyPool(allUniqueKeys),
    spacingMs: computeAdaptiveSpacing(allUniqueKeys),
    startedAt,
    finishedAt: new Date().toISOString(),
    currentBookId: stoppedForQuota ? quotaBookId : "",
    currentBookTitle: stoppedForQuota ? quotaBookTitle : "",
    currentChapter: stoppedForQuota ? quotaChapter : 0,
    currentCompleted: stoppedForQuota ? quotaCompleted : 0,
    currentTotalChapters: stoppedForQuota ? quotaTotal : 0,
    activityState: stoppedForQuota ? "waiting_quota" : "idle",
    resumesAt: stoppedForQuota && quotaResumeAt ? new Date(quotaResumeAt).toISOString() : null,
    translatedThisRun: translatedTotal,
    spentRequests: spentTotal,
    lastSuccessAt,
    lastSuccessfulChapter,
    lastError: lastRunError,
    message: stoppedForQuota
      ? `Tạm dừng an toàn: quota chưa hồi đầy, không gửi thêm request. Tự tiếp tục sau ${new Date(quotaResumeAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}. Phiên này đã dịch ${translatedTotal} chương.`
      : `Phiên dịch hoàn tất: Đã dịch ${translatedTotal} chương mới trên ${touched.size} bộ truyện.`,
    queue: queue.map((j) => {
      const counts = summarize(j.state);
      return {
        bookId: j.bookId,
        revision: j.revision,
        pending: Math.max(0, counts.total - counts.completed - counts.failed),
        highPriority: j.highPriority,
        total: counts.total,
        translated: counts.completed,
        failed: counts.failed
      };
    })
  });

  console.log(`\nĐã chạy ${cycle} vòng, ${touched.size} truyện có bản dịch mới.`);

  if (translatedTotal > 0) {
    await publishCatalogSnapshot({ storage, site: siteSettings(), log: (event) => console.log("  ", JSON.stringify(event)) });
  }

  const reason = stoppedForQuota
    ? " Circuit breaker đang chờ quota hồi đầy; lượt sau chỉ tiếp tục khi hết thời gian khóa."
    : Date.now() >= deadlineAt
      ? " Dừng vì hết thời gian chạy."
      : " Hết việc trong hàng đợi.";
  console.log(`\nXong: dịch ${translatedTotal} chương, dùng ${spentTotal} lượt gọi.${reason}`);
}

function translationKeyPriority(key) {
  const value = String(key || "");
  // Qwen on Groq is the primary translator. Gemini stays available as an
  // automatic fallback when Groq is cooling down or rejects a hard chapter.
  if (value.startsWith("gsk_")) return 0;
  if (value.startsWith("cfai:")) return 1;
  return 2;
}

async function listJobs(storage, onlyBook) {
  if (onlyBook) {
    // A deletion removes the published index. Old installations may still have
    // left a queue object behind, so index existence is the authority for
    // whether a book may consume translation capacity.
    const index = await readJson(storage, `books/${onlyBook}/index.json`);
    if (!index) return [];
    const state = await readJson(storage, jobStateKey(onlyBook));
    if (!state || !Array.isArray(state.chapters)) return [];
    const counts = summarize(state);
    if (isSettled(state)) return [];
    return [{
      bookId: state.bookId,
      revision: state.revision,
      state,
      total: counts.total,
      pending: counts.total - counts.completed - counts.failed,
      failed: counts.failed,
      highPriority: counts.highPriority || 0
    }];
  }

  const objects = await storage.list("jobs/");
  const jobs = [];
  for (const object of objects) {
    if (!object.key.endsWith("/translation.json")) continue;
    const state = await readJson(storage, object.key);
    if (!state || !Array.isArray(state.chapters)) continue;
    const index = await readJson(storage, `books/${state.bookId}/index.json`);
    if (!index) continue;

    // Recover work abandoned by an interrupted process. A `failed` entry is
    // terminal (including poison chapters rejected for quality); resetting it on
    // every cron made fully settled books re-enter the queue forever.
    let stateModified = false;
    for (const ch of state.chapters) {
      if (ch.status === "processing" && (Date.now() - new Date(state.updatedAt || 0).getTime() > 15 * 60 * 1000)) {
        ch.status = "pending";
        ch.attempts = 0;
        ch.nextAttemptAt = 0;
        stateModified = true;
      }
    }
    if (stateModified) {
      await storage.put(object.key, JSON.stringify(state));
    }

    const counts = summarize(state);
    if (isSettled(state)) continue;
    jobs.push({
      bookId: state.bookId,
      revision: state.revision,
      state,
      total: counts.total,
      pending: counts.total - counts.completed - counts.failed,
      failed: counts.failed,
      highPriority: counts.highPriority || 0
    });
  }
  return jobs;
}

async function ensureBookRow({ storage, db, job }) {
  if (!db) return;
  const index = await readJson(storage, `books/${job.bookId}/index.json`);
  if (!index) return;
  // Only creates a missing row. Overwriting an existing one would reset the
  // provenance the crawler depends on, since index.json carries no source or
  // source_id.
  const exists = await db.bookExists(job.bookId).catch(() => true);
  if (exists) return;
  await db
    .upsertBook({
      id: job.bookId,
      title: index.title,
      author: index.author,
      description: index.description,
      cover: index.cover,
      status: index.status,
      totalChapters: index.totalChapters || 0,
      translatedChapters: index.translatedChapters || 0,
      revision: job.revision,
      // Carried from the index so a row created here is not born as an admin
      // upload. The crawler recognises its books by these two fields.
      source: index.source || "admin",
      sourceId: index.sourceId || null,
      sourceUrl: index.sourceUrl || null
    })
    .catch((error) => console.warn(`  (Supabase book insert lỗi: ${error.message})`));
}

async function refreshBookOutputs({ storage, db, job, state }) {
  const index = await readJson(storage, `books/${job.bookId}/index.json`);
  if (!index) return;
  const statusByNumber = new Map(state.chapters.map((entry) => [entry.n, entry.status]));
  const chapters = index.chapters.map((entry) => {
    const translationStatus = statusByNumber.get(entry.n) || entry.status;
    const isCompleted = translationStatus === "completed";
    return {
      chapterNumber: entry.n,
      title: entry.title,
      translationStatus,
      provider: entry.provider || (isCompleted ? "gemini" : "crawler-convert"),
      model: entry.model || (isCompleted ? "gemini-3.6-flash" : undefined),
      qaReviewed: entry.qaReviewed
    };
  });
  const completed = chapters.filter((chapter) => chapter.translationStatus === "completed").length;
  const isFullBook = chapters.length > 0 && completed >= chapters.length;
  const bookStatus = isFullBook ? "Hoàn thành" : (index.status || "Đang cập nhật");

  await publishIndex({
    storage,
    book: {
      id: job.bookId,
      title: index.title,
      author: index.author,
      genre: index.genre,
      status: bookStatus,
      description: index.description,
      cover: index.cover
    },
    revision: job.revision,
    chapters,
    state
  });

  if (db) {
    await db
      .upsertChapters(job.bookId, job.revision, chapters)
      .catch((error) => console.warn(`  (Supabase chapters sync lỗi: ${error.message})`));
    // Counts only: title, cover and provenance belong to whoever ingested the book.
    await db
      .updateBookProgress(job.bookId, {
        totalChapters: chapters.length,
        translatedChapters: completed,
        status: bookStatus,
        revision: job.revision
      })
      .catch((error) => console.warn(`  (Supabase book update lỗi: ${error.message})`));

    await publishCatalogSnapshot({ storage, db, site: siteSettings() })
      .catch((error) => console.warn(`  (Catalog snapshot update lỗi: ${error.message})`));
  }
}

function siteSettings() {
  return {
    name: "Trạm Chữ",
    tagline: "Một góc đọc truyện Trung được tuyển chọn và dịch.",
    contactEmail: process.env.SITE_CONTACT_EMAIL || ""
  };
}

function bookOutputsNeedRefresh(index, state) {
  if (!index || !Array.isArray(index.chapters) || !state || !Array.isArray(state.chapters)) return false;
  const published = new Map(index.chapters.map((entry) => [entry.n, entry.status]));
  return state.chapters.some((entry) => published.get(entry.n) !== entry.status);
}

async function readJson(storage, key) {
  const buffer = await storage.get(key).catch(() => null);
  if (!buffer) return null;
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    return null;
  }
}

module.exports = {
  listJobs,
  refreshBookOutputs,
  ensureBookRow,
  bookOutputsNeedRefresh,
  summarizeKeyStats,
  sanitizeStatusError,
  translationKeyPriority
};

if (require.main === module) {
  main().catch((error) => {
    console.error("TRANSLATE WORKER FAILED:", error.message);
    process.exit(1);
  });
}
