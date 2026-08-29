#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

for (const file of [".env.local", ".env"]) {
  const target = path.join(process.cwd(), file);
  if (!fs.existsSync(target)) continue;
  for (const line of fs.readFileSync(target, "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
}

const { createStorage, LAYOUT } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { createJobState } = require("../server/ingest/translation-queue");

const storage = createStorage();
const supabase = createSupabase();
const args = new Set(process.argv.slice(2));
const EXECUTE = args.has("--execute");
const CONFIRMED = args.has("--confirm-reset-all");
const CONCURRENCY = Math.max(1, Math.min(40, Number(process.env.RESET_CONCURRENCY || 20)));
const NOW = new Date().toISOString();
const CHAPTER_RE = /^books\/([^/]+)\/r(\d+)\/ch\/(\d+)\.json$/;
const ORIGINAL_RE = /^books\/([^/]+)\/r(\d+)\/ch\/(\d+)\.original\.json$/;
const INDEX_RE = /^books\/([^/]+)\/index\.json$/;
const RESET_MARKER = "jobs/reset-active.json";

if (EXECUTE && !CONFIRMED) {
  console.error("Từ chối thực thi: cần đồng thời --execute --confirm-reset-all.");
  process.exit(2);
}

async function mapConcurrent(items, concurrency, mapper) {
  let cursor = 0;
  const results = new Array(items.length);
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function readJson(key) {
  const raw = await storage.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw.toString("utf8")); } catch { return null; }
}

function chapterNumber(entry) {
  const value = Number(entry?.n ?? entry?.chapterNumber);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function cleanIndexEntry(entry, original) {
  const next = { ...entry };
  for (const key of [
    "provider", "translationProvider", "model", "translationVersion", "convertVersion",
    "qaStatus", "qaReviewed", "qaReviewedAt", "qaRequired", "qaIssues", "qaIssuesFixed",
    "qualityScore", "semanticReview", "translatedAt", "completedAt"
  ]) delete next[key];
  next.translationStatus = "pending";
  if (original?.title) next.title = original.title;
  if (original?.characters != null) next.characters = original.characters;
  return next;
}

async function main() {
  if (storage.driver !== "r2") throw new Error("Reset toàn thư viện chỉ được chạy khi storage driver là R2.");
  if (!supabase) throw new Error("Thiếu cấu hình Supabase service-role.");
  if (EXECUTE) {
    await storage.put(RESET_MARKER, JSON.stringify({
      schema: 1, active: true, startedAt: NOW, expiresAtEpochMs: Date.now() + 2 * 60 * 60_000
    }), { cacheControl: "private, no-store" });
  }
  console.log(`RESET translation pipeline: ${EXECUTE ? "THỰC THI" : "DRY-RUN"}`);
  console.log("Giữ: original, EPUB, cover, metadata sách và reader fallback. Reset: draft, glossary, QA/story/TM và queue.");

  console.log("[1/5] Đang lập inventory R2...");
  const prefixes = ["books/", "drafts/", "glossary/", "glossary-meta/", "story-bible/", "story-context/", "tm/books/", "jobs/"];
  const listed = await Promise.all(prefixes.map((prefix) => storage.list(prefix)));
  const objects = Object.fromEntries(prefixes.map((prefix, index) => [prefix, listed[index]]));
  const bookObjects = objects["books/"];
  const indexKeys = bookObjects.map((item) => item.key).filter((key) => INDEX_RE.test(key));
  const originalKeys = new Set(bookObjects.map((item) => item.key).filter((key) => ORIGINAL_RE.test(key)));
  const translatedKeys = bookObjects.map((item) => item.key).filter((key) => CHAPTER_RE.test(key));

  const activeKeys = objects["jobs/"].map((item) => item.key).filter((key) => /\/(?:hachimi-active|semantic-review\.lock)\.json$/.test(key));
  const activeDocuments = (await mapConcurrent(activeKeys, CONCURRENCY, async (key) => ({ key, value: await readJson(key) })))
    .filter(({ value }) => value && ((value.active && Number(value.expiresAtEpochMs || 0) > Date.now()) || Number(value.expiresAtEpochMs || 0) > Date.now()));
  if (activeDocuments.length) {
    console.error(`Phát hiện ${activeDocuments.length} worker/lock còn hoạt động. Hãy dừng Colab/QA rồi chờ lease hết:`);
    for (const item of activeDocuments.slice(0, 20)) console.error(`  - ${item.key}`);
    throw new Error("Không reset khi pipeline còn writer hoạt động.");
  }

  console.log(`[2/5] Đang đọc ${indexKeys.length} index và đối chiếu original...`);
  const indexes = (await mapConcurrent(indexKeys, CONCURRENCY, async (key) => ({ key, value: await readJson(key) })))
    .filter((item) => item.value?.bookId || INDEX_RE.test(item.key));
  const plans = [];
  let missingOriginals = 0;
  for (const { key, value: index } of indexes) {
    if (!index) throw new Error(`Index không hợp lệ: ${key}`);
    const bookId = index.bookId || key.match(INDEX_RE)[1];
    const revision = Number(index.revision || 1);
    const chapters = Array.isArray(index.chapters) ? index.chapters : [];
    const chapterOriginalKeys = chapters.map((entry) => {
      const number = chapterNumber(entry);
      if (!number) return null;
      const originalKey = LAYOUT.chapterOriginal(bookId, revision, number);
      if (!originalKeys.has(originalKey)) return null;
      return originalKey;
    });
    missingOriginals += chapters.length - chapterOriginalKeys.filter(Boolean).length;
    plans.push({ key, bookId, revision, index, chapters, chapterOriginalKeys });
  }
  if (missingOriginals) throw new Error(`Thiếu ${missingOriginals} original của revision hiện hành; dừng để không tạo thư viện khuyết chương.`);

  const bookIds = new Set(plans.map((plan) => plan.bookId));
  const resetPrefixes = ["drafts/", "glossary/", "glossary-meta/", "story-bible/", "story-context/", "tm/books/"];
  const privateKeys = resetPrefixes.flatMap((prefix) => objects[prefix].map((item) => item.key)).filter((key) => {
    const parts = key.split("/");
    const id = key.startsWith("tm/books/") ? parts[2]?.replace(/\.json$/, "") : parts[1]?.replace(/\.json$/, "");
    return bookIds.has(id);
  });
  const jobKeysToDelete = objects["jobs/"].map((item) => item.key).filter((key) => {
    if (/^jobs\/(?:gemini-batches|qa-budget)\//.test(key)) return true;
    if (["jobs/semantic-review-cursor.json", "jobs/translate-status.json", "jobs/translate-rotation.json"].includes(key)) return true;
    const match = key.match(/^jobs\/([^/]+)\/(semantic-review(?:\.lock)?|hachimi-active)\.json$/);
    return Boolean(match && bookIds.has(match[1]));
  });
  const currentReaderKeys = new Set(plans.flatMap((plan) => plan.chapters.map((entry) => {
    const number = chapterNumber(entry);
    return number ? LAYOUT.chapter(plan.bookId, plan.revision, number) : "";
  }).filter(Boolean)));
  const oldReaderKeys = translatedKeys.filter((key) => !currentReaderKeys.has(key));

  console.log("[3/5] Kế hoạch reset:");
  console.log(`  Sách: ${plans.length}`);
  console.log(`  Chương hiện hành bắt buộc dịch lại: ${currentReaderKeys.size}`);
  console.log(`  Chapter bản dịch revision cũ sẽ xóa: ${oldReaderKeys.length}`);
  console.log(`  Draft/glossary/story/TM sẽ xóa: ${privateKeys.length}`);
  console.log(`  Queue/lock/batch/budget sẽ xóa: ${jobKeysToDelete.length}`);
  console.log(`  Translation queue sẽ dựng lại: ${plans.length}`);
  if (!EXECUTE) {
    console.log("DRY-RUN hoàn tất. Không có object hay database row nào bị thay đổi.");
    console.log("Để thực thi: node scripts/reset-all-translations.js --execute --confirm-reset-all");
    return;
  }

  try {
    console.log("[4/5] Đang xóa state cũ và dựng lại chapter pending...");
    const deleteKeys = [...new Set([...oldReaderKeys, ...privateKeys, ...jobKeysToDelete])].filter((key) => key !== RESET_MARKER);
    await mapConcurrent(deleteKeys, CONCURRENCY, (key) => storage.remove(key));

    let completed = 0;
    await mapConcurrent(plans, Math.min(6, CONCURRENCY), async (plan) => {
      const nextIndex = {
        ...plan.index,
        chapters: plan.chapters.map((entry) => cleanIndexEntry(entry, null)),
        translatedChapters: 0,
        approvedChapters: 0,
        draftedChapters: 0,
        status: "Đang cập nhật",
        updatedAt: NOW
      };
      const job = createJobState({
        bookId: plan.bookId,
        revision: plan.revision,
        chapters: plan.chapters.map((entry) => ({ chapterNumber: chapterNumber(entry) }))
      });
      job.forceRetranslateAll = true;
      job.resetAt = NOW;
      await Promise.all([
        storage.put(plan.key, JSON.stringify(nextIndex, null, 2), { cacheControl: "no-cache" }),
        storage.put(`jobs/${plan.bookId}/translation.json`, JSON.stringify(job, null, 2), { cacheControl: "private, no-store" }),
        supabase.updateBookProgress(plan.bookId, {
          totalChapters: plan.chapters.length,
          translatedChapters: 0,
          revision: plan.revision,
          status: "Đang cập nhật"
        })
      ]);
      completed += 1;
      if (completed % 10 === 0 || completed === plans.length) console.log(`  Đã reset ${completed}/${plans.length} sách...`);
    });

    console.log("[5/5] Đang kiểm tra hậu reset...");
    const bad = [];
    for (const plan of plans) {
      const [index, job] = await Promise.all([readJson(plan.key), readJson(`jobs/${plan.bookId}/translation.json`)]);
      if (Number(index?.translatedChapters) !== 0 || index?.status === "Hoàn thành") bad.push(`${plan.bookId}: index`);
      if (!job || job.chapters?.length !== plan.chapters.length || job.chapters.some((entry) => entry.status !== "pending")) bad.push(`${plan.bookId}: queue`);
    }
    if (bad.length) throw new Error(`Hậu kiểm thất bại: ${bad.slice(0, 20).join(", ")}`);
  } finally {
    await storage.remove(RESET_MARKER).catch(() => {});
  }
  console.log(`RESET HOÀN TẤT: ${plans.length} sách, ${currentReaderKeys.size} chương bắt buộc dịch lại, queue sạch đã sẵn sàng.`);
}

main().catch(async (error) => {
  console.error("RESET thất bại:", error.message);
  if (EXECUTE) await storage.remove(RESET_MARKER).catch(() => {});
  process.exitCode = 1;
});
