#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
}
loadEnv(path.join(process.cwd(), ".env.local"));
loadEnv(path.join(process.cwd(), ".env"));

const { createStorage, LAYOUT } = require("../server/storage");
const { createTranslationEngine } = require("../server/translation-engine");
const { isProtectedGeminiDocument } = require("../server/translation-version");
const { buildSemanticReviewPrompt } = require("../server/semantic-review");
const { createGeminiBatchClient, batchResponseText } = require("../server/gemini-batch");
const { estimateTokens, canReserveBudget } = require("../server/qa-budget");

const storage = createStorage();
const engine = createTranslationEngine({ storage });
const MODEL = process.env.GEMINI_BATCH_MODEL || process.env.GEMINI_MODEL || "gemini-3.6-flash";
const BATCH_SIZE = Math.max(1, Math.min(100, Number(process.env.QA_BATCH_SIZE || 20)));
const MAX_BATCH_INPUT_TOKENS = Math.max(10_000, Number(process.env.QA_BATCH_MAX_INPUT_TOKENS || 200_000));
const DRY_RUN = process.argv.includes("--dry-run");
const ONLY_POLL = process.argv.includes("--poll-only");
const RETRY_FAILED = process.argv.includes("--retry-failed-batch");

async function readJson(key) {
  try { const raw = await storage.get(key); return raw ? JSON.parse(raw.toString("utf8")) : null; } catch { return null; }
}
async function putJson(key, value) { await storage.put(key, JSON.stringify(value, null, 2), { cacheControl: "private, no-store" }); }

async function failPreparedManifest(manifestKey, manifest, message) {
  const queue = await readJson(manifest.queueKey);
  const now = new Date().toISOString();
  for (const meta of manifest.entries || []) {
    const entry = queue?.entries?.find((item) => Number(item.chapterNumber) === Number(meta.chapterNumber) && item.fingerprint === meta.fingerprint);
    if (entry?.state === "batch_processing" && entry.batchId === manifest.batchId) {
      entry.state = "pending";
      entry.batchId = "";
      entry.lastError = `Batch create: ${String(message).slice(0, 300)}`;
      entry.updatedAt = now;
    }
  }
  if (queue) {
    queue.updatedAt = now;
    await putJson(manifest.queueKey, queue);
  }
  manifest.state = "failed";
  manifest.error = String(message).slice(0, 500);
  manifest.completedAt = now;
  for (const meta of manifest.entries || []) delete meta.prompt;
  await putJson(manifestKey, manifest);
}

async function pollManifests(client) {
  const objects = await storage.list("jobs/gemini-batches/");
  let completed = 0;
  for (const object of objects) {
    if (!object.key.endsWith(".json")) continue;
    const manifest = await readJson(object.key);
    if (!manifest || !["prepared", "submitted", "running"].includes(manifest.state)) continue;
    if (manifest.state === "prepared") {
      const queue = await readJson(manifest.queueKey);
      for (const meta of manifest.entries || []) {
        const entry = queue?.entries?.find((item) => Number(item.chapterNumber) === Number(meta.chapterNumber) && item.fingerprint === meta.fingerprint);
        if (entry) Object.assign(entry, { state: "batch_processing", batchId: manifest.batchId, updatedAt: new Date().toISOString() });
      }
      if (queue) await putJson(manifest.queueKey, queue);
      let created;
      try {
        const existing = await client.findByDisplayName(manifest.displayName);
        created = existing || await client.create({
          model: manifest.model,
          displayName: manifest.displayName,
          requests: manifest.entries.map((meta) => ({
            contents: [{ role: "user", parts: [{ text: meta.prompt }] }],
            metadata: { chapterNumber: String(meta.chapterNumber), fingerprint: meta.fingerprint },
            config: { temperature: 0.1, maxOutputTokens: 16384, responseMimeType: "application/json" }
          }))
        });
      } catch (error) {
        await failPreparedManifest(object.key, manifest, error.message);
        console.warn(`Batch ${manifest.batchId} không thể tạo; đã rollback queue: ${error.message}`);
        continue;
      }
      manifest.jobName = created.name;
      manifest.providerState = created.state;
      manifest.state = "submitted";
      manifest.submittedAt = new Date().toISOString();
      for (const meta of manifest.entries) delete meta.prompt;
      await putJson(object.key, manifest);
    }
    const job = await client.get(manifest.jobName);
    manifest.providerState = job.state;
    manifest.updatedAt = new Date().toISOString();
    if (["JOB_STATE_PENDING", "JOB_STATE_RUNNING"].includes(job.state)) {
      manifest.state = "running";
      await putJson(object.key, manifest);
      continue;
    }
    const succeeded = job.state === "JOB_STATE_SUCCEEDED";
    const responses = job.dest?.inlinedResponses || [];
    const queue = await readJson(manifest.queueKey);
    for (let index = 0; index < manifest.entries.length; index += 1) {
      const meta = manifest.entries[index];
      const entry = queue?.entries?.find((item) => Number(item.chapterNumber) === Number(meta.chapterNumber) && item.fingerprint === meta.fingerprint);
      if (!entry || entry.state !== "batch_processing" || entry.batchId !== manifest.batchId) continue;
      const responseText = succeeded ? batchResponseText(responses[index]) : "";
      entry.state = responseText ? "pending" : "retrying";
      entry.batchResponseText = responseText;
      entry.batchModel = MODEL;
      entry.batchId = "";
      entry.availableAt = new Date().toISOString();
      entry.lastError = responseText ? "" : String(responses[index]?.error?.message || job.error?.message || `Batch ${job.state}`).slice(0, 500);
      entry.updatedAt = new Date().toISOString();
    }
    if (queue) await putJson(manifest.queueKey, queue);
    manifest.state = succeeded ? "completed" : "failed";
    manifest.completedAt = new Date().toISOString();
    manifest.responseCount = responses.length;
    await putJson(object.key, manifest);
    completed += 1;
    console.log(`Batch ${manifest.batchId}: ${manifest.state} · ${responses.length}/${manifest.entries.length} kết quả.`);
  }
  return completed;
}

async function prepareCandidate(queue, entry) {
  const bookId = queue.bookId;
  const revision = Number(entry.revision || queue.revision || 1);
  const chapterNumber = Number(entry.chapterNumber);
  const [index, draft, published, original, glossary, previous, storyBible, storyContext] = await Promise.all([
    readJson(LAYOUT.bookIndex(bookId)), readJson(LAYOUT.chapterDraft(bookId, revision, chapterNumber)),
    readJson(LAYOUT.chapter(bookId, revision, chapterNumber)), readJson(LAYOUT.chapterOriginal(bookId, revision, chapterNumber)),
    engine.loadGlossary(bookId), chapterNumber > 1 ? readJson(LAYOUT.chapter(bookId, revision, chapterNumber - 1)) : null,
    readJson(LAYOUT.storyBible(bookId)), readJson(LAYOUT.storyContext(bookId))
  ]);
  const chapter = draft || published;
  if (isProtectedGeminiDocument(published)) return null;
  if (!chapter?.content || !original?.content) return null;
  const prompt = buildSemanticReviewPrompt({
    bookTitle: index?.title || bookId, chapterNumber, source: original.content, draft: chapter.content,
    glossary, previousContext: previous?.content || "", storyBible, recentContext: storyContext?.chapters || []
  });
  return { chapterNumber, fingerprint: entry.fingerprint, prompt, estimatedInputTokens: estimateTokens(prompt) };
}

async function submitOne(client) {
  const queues = (await storage.list("jobs/"))
    .map((item) => item.key).filter((key) => /^jobs\/[^/]+\/semantic-review\.json$/.test(key)).sort();
  for (const queueKey of queues) {
    const queue = await readJson(queueKey);
    if (!queue?.entries) continue;
    const activity = await readJson(`jobs/${queue.bookId}/hachimi-active.json`);
    if (activity?.active && Number(activity.expiresAtEpochMs || 0) > Date.now()) continue;
    const available = queue.entries.filter((entry) => entry.state === "pending" || (entry.state === "retrying" && Date.parse(entry.availableAt || 0) <= Date.now()));
    if (!available.length) continue;
    const candidates = [];
    let estimatedInputTokens = 0;
    for (const entry of available) {
      const candidate = await prepareCandidate(queue, entry);
      if (!candidate) continue;
      if (!canReserveBudget({ estimatedInputTokens, requests: candidates.length }, { inputTokens: candidate.estimatedInputTokens, requests: 1 }, { maxInputTokens: MAX_BATCH_INPUT_TOKENS, maxRequests: BATCH_SIZE }).ok) break;
      candidates.push(candidate);
      estimatedInputTokens += candidate.estimatedInputTokens;
    }
    if (!candidates.length) continue;
    const fingerprint = crypto.createHash("sha256").update(candidates.map((item) => `${item.chapterNumber}:${item.fingerprint}`).join("|")).digest("hex").slice(0, 16);
    const batchId = `${queue.bookId}-${queue.revision}-${fingerprint}`;
    const displayName = `tramchu-semantic-${batchId}`.slice(0, 120);
    const manifestKey = `jobs/gemini-batches/${batchId}.json`;
    let manifest = await readJson(manifestKey);
    if (manifest?.jobName) return null;
    if (manifest?.state === "failed" && !RETRY_FAILED) {
      console.log(`Batch ${batchId} từng bị provider từ chối; dùng --retry-failed-batch sau khi nâng tier/model.`);
      return null;
    }
    manifest = {
      schema: 1, batchId, displayName, model: MODEL, queueKey, bookId: queue.bookId,
      state: "prepared", estimatedInputTokens, createdAt: new Date().toISOString(),
      entries: candidates.map(({ chapterNumber, fingerprint, prompt }) => ({ chapterNumber, fingerprint, prompt }))
    };
    if (DRY_RUN) {
      console.log(`[dry-run] Batch ${batchId}: ${candidates.length} chương · ~${estimatedInputTokens} input tokens.`);
      return manifest;
    }
    await putJson(manifestKey, manifest);
    for (const candidate of candidates) {
      const entry = queue.entries.find((item) => item.chapterNumber === candidate.chapterNumber);
      Object.assign(entry, { state: "batch_processing", batchId, updatedAt: new Date().toISOString() });
    }
    await putJson(queueKey, queue);
    let job;
    try {
      const existing = await client.findByDisplayName(displayName);
      job = existing || await client.create({
        model: MODEL, displayName,
        requests: candidates.map((item) => ({
          contents: [{ role: "user", parts: [{ text: item.prompt }] }],
          metadata: { chapterNumber: String(item.chapterNumber), fingerprint: item.fingerprint },
          config: { temperature: 0.1, maxOutputTokens: 16384, responseMimeType: "application/json" }
        }))
      });
    } catch (error) {
      await failPreparedManifest(manifestKey, manifest, error.message);
      console.warn(`Không thể tạo Batch; đã rollback ${candidates.length} chương: ${error.message}`);
      return null;
    }
    manifest = { ...manifest, state: "submitted", jobName: job.name, providerState: job.state, submittedAt: new Date().toISOString() };
    for (const meta of manifest.entries) delete meta.prompt;
    await putJson(manifestKey, manifest);
    console.log(`Đã gửi Batch ${batchId}: ${candidates.length} chương · job ${job.name}.`);
    return manifest;
  }
  console.log("Không có chương backlog phù hợp để tạo Batch mới.");
  return null;
}

async function main() {
  const client = DRY_RUN ? null : createGeminiBatchClient({ apiKey: process.env.GEMINI_API_KEY });
  if (!DRY_RUN) await pollManifests(client);
  if (!ONLY_POLL) await submitOne(client);
}
main().catch((error) => { console.error("Gemini Batch worker lỗi:", error.message); process.exitCode = 1; });
