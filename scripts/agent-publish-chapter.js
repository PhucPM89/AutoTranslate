"use strict";

const fsSync = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
for (const envName of [".env", ".env.local"]) {
  const envFile = path.join(ROOT, envName);
  if (!fsSync.existsSync(envFile)) continue;
  for (const line of fsSync.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      let val = match[2].trim();
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      process.env[match[1]] = val;
    }
  }
}

const { createStorage, LAYOUT } = require("../server/storage");
const { syncCompletedChapter } = require("../server/ingest/chapter-progress");
const { createSupabase } = require("../server/supabase");

/**
 * Publish an agent-translated chapter to R2 storage and Supabase
 * @param {Object} params
 * @param {string} params.bookId
 * @param {number} params.chapterNumber
 * @param {number} [params.revision=1]
 * @param {string} params.title - Vietnamese chapter title
 * @param {string} params.content - High-quality translated Vietnamese content
 * @param {string} [params.provider="agent"]
 * @param {string} [params.model="deepmind-agent"]
 */
async function publishAgentChapter({
  bookId,
  chapterNumber,
  revision = 1,
  title,
  content,
  provider = "agent",
  model = "deepmind-agent"
}) {
  if (!bookId || !chapterNumber || !content) {
    throw new Error("Missing required parameters: bookId, chapterNumber, content");
  }

  const storage = createStorage(process.env);
  const n = Number(chapterNumber);
  const now = new Date().toISOString();

  // 1. Build chapter document
  const chapterKey = `books/${bookId}/r${revision}/ch/${n}.json`;
  let existingDoc = null;
  try {
    const raw = await storage.get(chapterKey);
    if (raw) existingDoc = JSON.parse(raw.toString("utf8"));
  } catch {}

  const finalTitle = title || existingDoc?.title || `Chương ${n}`;
  const doc = {
    schema: 1,
    bookId,
    revision: Number(revision),
    chapterNumber: n,
    title: finalTitle,
    content: String(content).trim(),
    translationStatus: "completed",
    characters: content.length,
    provider,
    model,
    updatedAt: now,
    manualEdited: true
  };

  // 2. Put chapter JSON in R2
  await storage.put(chapterKey, JSON.stringify(doc, null, 2), {
    contentType: "application/json; charset=utf-8",
    cacheControl: "public, max-age=60, stale-while-revalidate=600"
  });

  // 3. Sync translation queue and index.json
  const syncResult = await syncCompletedChapter({
    storage,
    bookId,
    revision: Number(revision),
    chapterNumber: n,
    title: finalTitle,
    provider,
    model,
    manualEdited: true
  });

  // 4. Update Supabase if configured
  const supabase = createSupabase(process.env, { role: "service" });
  if (supabase) {
    try {
      await supabase.request("chapters", {
        method: "PATCH",
        query: `?book_id=eq.${encodeURIComponent(bookId)}&chapter_number=eq.${n}`,
        body: {
          title: finalTitle,
          translation_status: "completed",
          characters: content.length,
          updated_at: now
        }
      }).catch(err => console.warn(`Supabase patch chapter ${n} warning:`, err.message));

      if (syncResult?.index) {
        await supabase.updateBookProgress(bookId, {
          totalChapters: syncResult.index.totalChapters,
          translatedChapters: syncResult.index.translatedChapters,
          revision: Number(revision),
          status: syncResult.index.status
        }).catch(err => console.warn("Supabase update progress warning:", err.message));
      }
    } catch (err) {
      console.warn("Supabase update error:", err.message);
    }
  }

  console.log(`[AGENT-PUBLISH] Đã cập nhật thành công Chương ${n}: "${finalTitle}" (${content.length} ký tự)`);
  return { ok: true, chapterNumber: n, title: finalTitle, characters: content.length };
}

module.exports = { publishAgentChapter };
