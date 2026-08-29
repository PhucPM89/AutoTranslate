#!/usr/bin/env node
"use strict";

/** Durable semantic QA worker: compares every queued Hachimi draft with source. */
const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
}
loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const { createStorage, LAYOUT } = require("../server/storage");
const { createTranslationEngine } = require("../server/translation-engine");
const { isProtectedGeminiDocument } = require("../server/translation-version");
const { generateStructuredText, getActiveKeys } = require("../server/gemini");
const {
  REVIEW_VERSION, reviewQueueKey, contentFingerprint, claimNextReview,
  settleReview, buildSemanticReviewPrompt, buildSemanticRepairPrompt, parseSemanticReview
} = require("../server/semantic-review");
const { mergeStoryBible, appendStoryContext, mergeApprovedTranslationMemory } = require("../server/story-bible");
const { estimateTokens, canReserveBudget, reserveBudget } = require("../server/qa-budget");

const storage = createStorage();
const engine = createTranslationEngine({ storage });
const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const ONLY_BOOK = getArg("--book");
const DRY_RUN = hasFlag("--dry-run");
const CONTINUOUS = hasFlag("--continuous") || hasFlag("-c");
const MAX_CHAPTERS = Math.max(1, Number(getArg("--max-chapters", process.env.QA_MAX_CHAPTERS || "20")));
const LEASE_MS = Math.max(60_000, Number(process.env.QA_LEASE_MS || 15 * 60_000));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.QA_MAX_ATTEMPTS || 4));
const OWNER = `${process.env.GITHUB_RUN_ID || "local"}-${process.pid}`;
const STATUS_KEY = "jobs/translate-status.json";
const CURSOR_KEY = "jobs/semantic-review-cursor.json";
const DAILY_MAX_INPUT_TOKENS = Math.max(1, Number(process.env.QA_DAILY_MAX_INPUT_TOKENS || 250_000));
const DAILY_MAX_REQUESTS = Math.max(1, Number(process.env.QA_DAILY_MAX_REQUESTS || 100));

async function readJson(key) {
  try {
    const raw = await storage.get(key);
    return raw ? JSON.parse(raw.toString("utf8")) : null;
  } catch (error) {
    console.warn(`Không đọc được ${key}: ${error.message}`);
    return null;
  }
}
async function putJson(key, value) {
  const options = key.startsWith("jobs/") ? { cacheControl: "private, no-store" } : {};
  await storage.put(key, JSON.stringify(value, null, 2), options);
}
async function writeStatus(status) {
  await putJson(STATUS_KEY, { updatedAt: new Date().toISOString(), pipeline: REVIEW_VERSION, ...status }).catch(() => {});
}
async function generateBudgeted(prompt, keys, config) {
  const date = new Date().toISOString().slice(0, 10);
  const key = `jobs/qa-budget/${date}.json`;
  const ledger = await readJson(key);
  const reservation = { inputTokens: estimateTokens(prompt), requests: 1 };
  const check = canReserveBudget(ledger, reservation, { maxInputTokens: DAILY_MAX_INPUT_TOKENS, maxRequests: DAILY_MAX_REQUESTS });
  if (!check.ok) {
    const error = new Error(`Đã chạm ngân sách semantic QA ngày ${date}.`);
    error.code = "qa_budget_exhausted";
    throw error;
  }
  await putJson(key, reserveBudget(ledger, reservation));
  return generateStructuredText(prompt, keys, config);
}
async function listQueueKeys() {
  if (ONLY_BOOK) return [reviewQueueKey(ONLY_BOOK)];
  const objects = await storage.list("jobs/");
  const keys = objects.map((item) => item.key).filter((key) => /^jobs\/[^/]+\/semantic-review\.json$/.test(key)).sort();
  const cursor = await readJson(CURSOR_KEY);
  const position = keys.indexOf(cursor?.lastQueueKey);
  return position >= 0 ? [...keys.slice(position + 1), ...keys.slice(0, position + 1)] : keys;
}
function markSkippedGemini(queue, entry) {
  entry.state = "skipped_gemini";
  entry.updatedAt = new Date().toISOString();
  entry.leaseOwner = "";
  entry.leaseUntil = "";
  entry.lastError = "";
  queue.updatedAt = entry.updatedAt;
}

async function processClaim(queueKey, queue, entry, keys) {
  const bookId = queue.bookId;
  const revision = Number(entry.revision || queue.revision || 1);
  const chapterNumber = Number(entry.chapterNumber);
  const chapterKey = LAYOUT.chapter(bookId, revision, chapterNumber);
  const draftKey = LAYOUT.chapterDraft(bookId, revision, chapterNumber);
  const [index, published, privateDraft, original, glossary, previous, storyBible, storyContext] = await Promise.all([
    readJson(LAYOUT.bookIndex(bookId)),
    readJson(chapterKey),
    readJson(draftKey),
    readJson(LAYOUT.chapterOriginal(bookId, revision, chapterNumber)),
    engine.loadGlossary(bookId),
    chapterNumber > 1 ? readJson(LAYOUT.chapter(bookId, revision, chapterNumber - 1)) : null,
    readJson(LAYOUT.storyBible(bookId)),
    readJson(LAYOUT.storyContext(bookId))
  ]);
  if (isProtectedGeminiDocument(published)) {
    markSkippedGemini(queue, entry);
    await putJson(queueKey, queue);
    console.log(`  ↷ ${bookId} ch ${chapterNumber}: đã có provenance Gemini, giữ nguyên.`);
    return { skipped: true };
  }
  const chapter = privateDraft || published;
  if (!chapter?.content || !original?.content) throw new Error("Thiếu bản gốc hoặc bản Hachimi.");
  const fingerprint = (document) => contentFingerprint({
    revision, chapterNumber, translationVersion: document?.translationVersion, content: document?.content
  });
  if (fingerprint(chapter) !== entry.fingerprint) throw new Error("Bản Hachimi đã thay đổi sau khi vào queue.");

  const prompt = buildSemanticReviewPrompt({
    bookTitle: index?.title || bookId,
    chapterNumber,
    source: original.content,
    draft: chapter.content,
    glossary,
    previousContext: previous?.content || "",
    storyBible,
    recentContext: storyContext?.chapters || []
  });
  const response = entry.batchResponseText
    ? { text: entry.batchResponseText, model: entry.batchModel || "gemini-batch" }
    : await generateBudgeted(prompt, keys, { temperature: 0.1, thinkingBudget: 256 });
  const initialReview = parseSemanticReview(response.text, { source: original.content, draft: chapter.content });
  const repaired = initialReview.decision !== "pass";
  let content = chapter.content;
  if (repaired) {
    let repairedText = initialReview.correctedTranslation;
    if (!repairedText) {
      const repairPrompt = buildSemanticRepairPrompt({
        bookTitle: index?.title || bookId, chapterNumber, source: original.content, draft: chapter.content,
        glossary, issues: initialReview.issues, storyBible, previousContext: previous?.content || ""
      });
      const repairResponse = await generateBudgeted(repairPrompt, keys, { temperature: 0.15, thinkingBudget: 128, responseFormat: "text" });
      repairedText = repairResponse.text;
    }
    content = engine.postProcessTranslation(repairedText, glossary);
    const formalQuality = require("../server/translation-quality").evaluateTranslationQuality(original.content, content);
    if (formalQuality.qaRequired) throw new Error(`Bản Gemini sửa không hợp lệ: ${formalQuality.qaIssues.join("; ")}`);
  }
  let review = initialReview;
  let verifierModel = response.model;
  // A model correcting its own answer is not proof that the correction is
  // faithful. All repaired chapters receive a second source-vs-output pass.
  if (repaired) {
    const verifyPrompt = buildSemanticReviewPrompt({
      bookTitle: index?.title || bookId,
      chapterNumber,
      source: original.content,
      draft: content,
      glossary,
      previousContext: previous?.content || ""
    });
    const verification = await generateBudgeted(verifyPrompt, keys, { temperature: 0.05, thinkingBudget: 256 });
    review = parseSemanticReview(verification.text, { source: original.content, draft: content });
    verifierModel = verification.model;
    if (review.decision !== "pass") throw new Error("Bản Gemini sửa chưa vượt qua vòng semantic verification độc lập.");
  }
  const now = new Date().toISOString();
  const averageScore = Object.values(review.scores).reduce((sum, score) => sum + score, 0) / 4;

  // Re-read before PUT: never overwrite a result written while Gemini was reviewing.
  const [latestPublished, latestDraft] = await Promise.all([readJson(chapterKey), readJson(draftKey)]);
  if (isProtectedGeminiDocument(latestPublished) && latestPublished.updatedAt !== published?.updatedAt) {
    markSkippedGemini(queue, entry);
    await putJson(queueKey, queue);
    return { skipped: true };
  }
  if (fingerprint(latestDraft || latestPublished) !== entry.fingerprint) throw new Error("Chương đổi nội dung trong lúc Gemini đang review.");

  const updatedChapter = {
    ...chapter,
    content,
    paragraphs: content.split("\n").map((part) => part.trim()).filter(Boolean),
    characters: content.length,
    provider: repaired ? "gemini-review" : chapter.provider,
    model: repaired ? response.model : chapter.model,
    qaStatus: "approved",
    qaReviewed: true,
    qaReviewedAt: now,
    qaRequired: false,
    qaIssues: [],
    qaIssuesFixed: repaired ? initialReview.issues.map((issue) => issue.explanation || issue.type).filter(Boolean) : [],
    qualityScore: Number(averageScore.toFixed(2)),
    semanticReview: {
      version: REVIEW_VERSION, decision: repaired ? initialReview.decision : review.decision,
      model: response.model, verifierModel,
      scores: review.scores, issues: initialReview.issues, reviewedAt: now
    },
    updatedAt: now
  };

  if (!DRY_RUN) {
    await putJson(chapterKey, updatedChapter);
    const indexEntry = index?.chapters?.find((item) => Number(item.n || item.chapterNumber) === chapterNumber);
    if (indexEntry) {
      Object.assign(indexEntry, {
        title: updatedChapter.title,
        provider: updatedChapter.provider, model: updatedChapter.model,
        qaStatus: "approved", qaReviewed: true, qaRequired: false,
        qualityScore: updatedChapter.qualityScore
      });
      index.updatedAt = now;
      await putJson(LAYOUT.bookIndex(bookId), index);
    }
    const [latestBible, latestContext, latestTm] = await Promise.all([
      readJson(LAYOUT.storyBible(bookId)),
      readJson(LAYOUT.storyContext(bookId)),
      readJson(LAYOUT.bookTranslationMemory(bookId))
    ]);
    await Promise.all([
      putJson(LAYOUT.storyBible(bookId), mergeStoryBible(latestBible, review.storyBibleUpdates, {
        bookId, chapterNumber, evidenceText: `${original.content}\n${content}`, now
      })),
      putJson(LAYOUT.storyContext(bookId), appendStoryContext(latestContext, { chapterNumber, summary: review.chapterSummary, now })),
      putJson(LAYOUT.bookTranslationMemory(bookId), mergeApprovedTranslationMemory(latestTm, review.translationMemoryUpdates, {
        chapterNumber, source: original.content, translation: content, now
      }))
    ]);
  }
  settleReview(queue, chapterNumber, {
    approved: true, decision: repaired ? initialReview.decision : review.decision, model: verifierModel,
    scores: review.scores, issues: initialReview.issues
  }, { maxAttempts: MAX_ATTEMPTS });
  delete entry.batchResponseText;
  delete entry.batchModel;
  if (!DRY_RUN) await putJson(queueKey, queue);
  console.log(`  ✓ ${bookId} ch ${chapterNumber}: ${repaired ? initialReview.decision : review.decision} · ${response.model} · ${averageScore.toFixed(1)}/10`);
  return { approved: true, repaired };
}

async function runOnce() {
  const keys = getActiveKeys().filter((key) => !key.startsWith("gsk_"));
  if (!keys.length && !DRY_RUN) throw new Error("Không có Gemini API key hợp lệ cho semantic review.");
  const queueKeys = await listQueueKeys();
  console.log(`Semantic QA ${REVIEW_VERSION}: ${queueKeys.length} queue · tối đa ${MAX_CHAPTERS} chương/lần.`);
  let processed = 0, approved = 0, repaired = 0, failed = 0, lastQueueKey = "", providerStopped = false;

  for (const queueKey of queueKeys) {
    if (processed >= MAX_CHAPTERS || providerStopped) break;
    const queue = await readJson(queueKey);
    if (!queue?.bookId || !Array.isArray(queue.entries)) continue;
    const hachimiActivity = await readJson(`jobs/${queue.bookId}/hachimi-active.json`);
    if (hachimiActivity?.active && Number(hachimiActivity.expiresAtEpochMs || 0) > Date.now()) {
      console.log(`  ↷ ${queue.bookId}: Hachimi đang ghi bộ này, chuyển sang queue kế tiếp.`);
      lastQueueKey = queueKey;
      continue;
    }
    lastQueueKey = queueKey;
    while (processed < MAX_CHAPTERS) {
      const entry = claimNextReview(queue, { owner: OWNER, leaseMs: LEASE_MS });
      if (!entry) break;
      if (DRY_RUN) {
        console.log(`  [dry-run] ${queue.bookId} ch ${entry.chapterNumber} đang chờ semantic review.`);
        processed += 1;
        continue;
      }
      await putJson(queueKey, queue); // Persist lease before external request.
      processed += 1;
      try {
        const result = await processClaim(queueKey, queue, entry, keys);
        if (result.approved) approved += 1;
        if (result.repaired) repaired += 1;
      } catch (error) {
        failed += 1;
        const temporaryProviderError = [429, 500, 502, 503, 504].includes(error.status) || /quota|rate limit|resource_exhausted/i.test(error.message);
        const budgetStopped = error.code === "qa_budget_exhausted";
        const nextUtcDayMs = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1) - Date.now() + 60_000;
        settleReview(queue, entry.chapterNumber, {
          error: error.message,
          retryable: temporaryProviderError || budgetStopped,
          retryAfterMs: budgetStopped ? nextUtcDayMs : error.retryAfterMs
        }, { maxAttempts: MAX_ATTEMPTS });
        await putJson(queueKey, queue);
        console.error(`  ✗ ${queue.bookId} ch ${entry.chapterNumber}: ${error.message}`);
        if (temporaryProviderError || budgetStopped || [403, 401].includes(error.status)) {
          providerStopped = true;
          break;
        }
      }
    }
  }
  if (lastQueueKey && !ONLY_BOOK && !DRY_RUN) {
    await putJson(CURSOR_KEY, { schema: 1, lastQueueKey, updatedAt: new Date().toISOString() });
  }
  const summary = { processed, approved, repaired, failed, providerStopped, queueCount: queueKeys.length };
  await writeStatus({ state: "idle", activityState: "semantic_review", ...summary, message: `Semantic QA: ${approved} duyệt, ${repaired} sửa, ${failed} lỗi.` });
  console.log(`Hoàn tất: xử lý ${processed}, duyệt ${approved}, sửa ${repaired}, lỗi ${failed}.`);
  return summary;
}

async function main() {
  do {
    const result = await runOnce();
    if (!CONTINUOUS) break;
    await new Promise((resolve) => setTimeout(resolve, result.processed ? 5_000 : 60_000));
  } while (true);
}
main().catch(async (error) => {
  console.error("Semantic QA worker dừng:", error.message);
  await writeStatus({ state: "error", activityState: "semantic_review", message: error.message });
  process.exitCode = 1;
});
