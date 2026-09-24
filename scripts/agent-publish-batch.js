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
const { createSupabase } = require("../server/supabase");

/**
 * Batch publish agent-translated chapters (5-10 chapters at once)
 * Writes individual chapter JSONs to R2, then updates index.json, catalog and Supabase in ONE pass.
 * 
 * @param {Object} params
 * @param {string} params.bookId
 * @param {number} [params.revision=1]
 * @param {Array<{ chapterNumber: number, title: string, content: string }>} params.chapters
 * @param {string} [params.provider="agent"]
 * @param {string} [params.model="deepmind-agent"]
 */
async function publishAgentChapterBatch({
  bookId,
  revision = 1,
  chapters = [],
  provider = "agent",
  model = "deepmind-agent"
}) {
  if (!bookId || !chapters.length) {
    throw new Error("Missing required parameters: bookId, chapters");
  }

  const storage = createStorage(process.env);
  const now = new Date().toISOString();
  console.log(`[BATCH-PUBLISH] Bắt đầu publish batch ${chapters.length} chương cho bộ ${bookId}...`);

  // 1. Write individual chapter documents in parallel
  await Promise.all(chapters.map(async (ch) => {
    const n = Number(ch.chapterNumber);
    const chapterKey = `books/${bookId}/r${revision}/ch/${n}.json`;
    const doc = {
      schema: 1,
      bookId,
      revision: Number(revision),
      chapterNumber: n,
      title: ch.title || `Chương ${n}`,
      content: String(ch.content).trim(),
      translationStatus: "completed",
      characters: ch.content.length,
      provider,
      model,
      updatedAt: now,
      manualEdited: true
    };
    await storage.put(chapterKey, JSON.stringify(doc, null, 2), {
      contentType: "application/json; charset=utf-8",
      cacheControl: "public, max-age=60, stale-while-revalidate=600"
    });
    console.log(`  ✓ Đã ghi R2 Chương ${n}: "${ch.title}" (${ch.content.length} ký tự)`);
  }));

  // 2. Read and update books/${bookId}/index.json once
  const indexKey = LAYOUT.bookIndex(bookId);
  const rawIndex = await storage.get(indexKey);
  let updatedIndex = null;
  if (rawIndex) {
    const indexDoc = JSON.parse(rawIndex.toString("utf8"));
    const chMap = new Map(chapters.map(c => [Number(c.chapterNumber), c]));
    if (Array.isArray(indexDoc.chapters)) {
      for (const entry of indexDoc.chapters) {
        const match = chMap.get(Number(entry.n));
        if (match) {
          entry.status = "completed";
          if (match.title) entry.title = String(match.title).trim();
          entry.provider = provider;
          entry.model = model;
          entry.manualEdited = true;
        }
      }
      indexDoc.translatedChapters = indexDoc.chapters.filter(c => c.status === "completed").length;
      if (indexDoc.totalChapters && indexDoc.translatedChapters >= indexDoc.totalChapters) {
        indexDoc.status = "Hoàn thành";
      }
      indexDoc.updatedAt = now;
      await storage.put(indexKey, JSON.stringify(indexDoc, null, 2), {
        contentType: "application/json; charset=utf-8",
        cacheControl: "public, max-age=60, stale-while-revalidate=600"
      });
      // Also sync r1/index.json if exists
      await storage.put(`books/${bookId}/r${revision}/index.json`, JSON.stringify(indexDoc, null, 2), {
        contentType: "application/json; charset=utf-8",
        cacheControl: "no-cache, no-store, must-revalidate"
      }).catch(() => {});

      updatedIndex = indexDoc;
      console.log(`[BATCH-PUBLISH] Đã cập nhật index: ${indexDoc.translatedChapters}/${indexDoc.totalChapters || indexDoc.chapterCount} chương hoàn thành.`);
    }
  }

  // 3. Update Supabase once
  const supabase = createSupabase(process.env, { role: "service" });
  if (supabase) {
    try {
      for (const ch of chapters) {
        const n = Number(ch.chapterNumber);
        await supabase.request("chapters", {
          method: "PATCH",
          query: `?book_id=eq.${encodeURIComponent(bookId)}&chapter_number=eq.${n}`,
          body: {
            title: ch.title,
            translation_status: "completed",
            characters: ch.content.length,
            updated_at: now
          }
        }).catch(() => {});
      }
      if (updatedIndex) {
        await supabase.updateBookProgress(bookId, {
          totalChapters: updatedIndex.totalChapters,
          translatedChapters: updatedIndex.translatedChapters,
          revision: Number(revision),
          status: updatedIndex.status
        }).catch(() => {});
      }
      console.log(`[BATCH-PUBLISH] Đã đồng bộ tiến độ lên cơ sở dữ liệu Supabase.`);
    } catch (err) {
      console.warn("[BATCH-PUBLISH] Supabase warning:", err.message);
    }
  }

  console.log(`[BATCH-PUBLISH] Hoàn tất công bố đợt batch ${chapters.length} chương!`);
  return { ok: true, count: chapters.length, updatedIndex };
}

module.exports = { publishAgentChapterBatch };
