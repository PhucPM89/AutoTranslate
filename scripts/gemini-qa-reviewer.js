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
  settleReview, buildSemanticReviewPrompt, parseSemanticReview
} = require("../server/semantic-review");

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
  const [index, chapter, original, glossary, previous] = await Promise.all([
    readJson(LAYOUT.bookIndex(bookId)),
    readJson(chapterKey),
    readJson(LAYOUT.chapterOriginal(bookId, revision, chapterNumber)),
    engine.loadGlossary(bookId),
    chapterNumber > 1 ? readJson(LAYOUT.chapter(bookId, revision, chapterNumber - 1)) : null
  ]);
  if (isProtectedGeminiDocument(chapter)) {
    markSkippedGemini(queue, entry);
    await putJson(queueKey, queue);
    console.log(`  ↷ ${bookId} ch ${chapterNumber}: đã có provenance Gemini, giữ nguyên.`);
    return { skipped: true };
  }
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
    previousContext: previous?.content || ""
  });
  const response = await generateStructuredText(prompt, keys, { temperature: 0.1, thinkingBudget: 256 });
  const initialReview = parseSemanticReview(response.text, { source: original.content, draft: chapter.content });
  const repaired = initialReview.decision !== "pass";
  const content = repaired ? engine.postProcessTranslation(initialReview.correctedTranslation, glossary) : chapter.content;
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
    const verification = await generateStructuredText(verifyPrompt, keys, { temperature: 0.05, thinkingBudget: 256 });
    review = parseSemanticReview(verification.text, { source: original.content, draft: content });
    verifierModel = verification.model;
    if (review.decision !== "pass") throw new Error("Bản Gemini sửa chưa vượt qua vòng semantic verification độc lập.");
  }
  const now = new Date().toISOString();
  const averageScore = Object.values(review.scores).reduce((sum, score) => sum + score, 0) / 4;

  // Re-read before PUT: never overwrite a result written while Gemini was reviewing.
  const latest = await readJson(chapterKey);
  if (isProtectedGeminiDocument(latest) && latest.updatedAt !== chapter.updatedAt) {
    markSkippedGemini(queue, entry);
    await putJson(queueKey, queue);
    return { skipped: true };
  }
  if (fingerprint(latest) !== entry.fingerprint) throw new Error("Chương đổi nội dung trong lúc Gemini đang review.");

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
        provider: updatedChapter.provider, model: updatedChapter.model,
        qaStatus: "approved", qaReviewed: true, qaRequired: false,
        qualityScore: updatedChapter.qualityScore
      });
      index.updatedAt = now;
      await putJson(LAYOUT.bookIndex(bookId), index);
    }
  }
  settleReview(queue, chapterNumber, {
    approved: true, decision: repaired ? initialReview.decision : review.decision, model: verifierModel,
    scores: review.scores, issues: initialReview.issues
  }, { maxAttempts: MAX_ATTEMPTS });
  if (!DRY_RUN) await putJson(queueKey, queue);
  console.log(`  ✓ ${bookId} ch ${chapterNumber}: ${repaired ? initialReview.decision : review.decision} · ${response.model} · ${averageScore.toFixed(1)}/10`);
  return { approved: true, repaired };
}

async function runOnce() {
  const keys = getActiveKeys().filter((key) => !key.startsWith("gsk_"));
  if (!keys.length && !DRY_RUN) throw new Error("Không có Gemini API key hợp lệ cho semantic review.");
  const queueKeys = await listQueueKeys();
  console.log(`Semantic QA ${REVIEW_VERSION}: ${queueKeys.length} queue · tối đa ${MAX_CHAPTERS} chương/lần.`);
  let processed = 0, approved = 0, repaired = 0, failed = 0, lastQueueKey = "";

  for (const queueKey of queueKeys) {
    if (processed >= MAX_CHAPTERS) break;
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
        settleReview(queue, entry.chapterNumber, { error: error.message }, { maxAttempts: MAX_ATTEMPTS });
        await putJson(queueKey, queue);
        console.error(`  ✗ ${queue.bookId} ch ${entry.chapterNumber}: ${error.message}`);
        if ([429, 403, 401].includes(error.status)) break;
      }
    }
  }
  if (lastQueueKey && !ONLY_BOOK && !DRY_RUN) {
    await putJson(CURSOR_KEY, { schema: 1, lastQueueKey, updatedAt: new Date().toISOString() });
  }
  const summary = { processed, approved, repaired, failed, queueCount: queueKeys.length };
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
