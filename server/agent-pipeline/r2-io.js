"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createStorage, LAYOUT } = require("../storage");
const { createSupabase } = require("../supabase");
const { syncCompletedChapter } = require("../ingest/chapter-progress");
const { publishCatalogSnapshot } = require("../ingest/catalog-snapshot");

class R2IOManager {
  constructor({
    storage = null,
    db = null,
    rawCacheDir = path.resolve(process.cwd(), ".cache", "raw-chapters"),
    rollbackDir = path.resolve(process.cwd(), ".cache", "rollbacks")
  } = {}) {
    this.storage = storage || createStorage();
    this.db = db || createSupabase();
    this.rawCacheDir = rawCacheDir;
    this.rollbackDir = rollbackDir;

    if (!fs.existsSync(this.rawCacheDir)) fs.mkdirSync(this.rawCacheDir, { recursive: true });
    if (!fs.existsSync(this.rollbackDir)) fs.mkdirSync(this.rollbackDir, { recursive: true });

    // In-memory prefetch cache & promises
    this.prefetchCache = new Map();
    this.prefetchPromises = new Map();

    // Track R2 GET / PUT metrics
    this.getCount = 0;
    this.putCount = 0;
  }

  getRawCachePath(bookId, rev, chapterNumber) {
    const safeBook = bookId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const dir = path.join(this.rawCacheDir, safeBook, `r${rev}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${chapterNumber}.json`);
  }

  getRollbackPath(bookId, rev, chapterNumber) {
    const safeBook = bookId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const dir = path.join(this.rollbackDir, safeBook, `r${rev}`);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${chapterNumber}-${Date.now()}.backup.json`);
  }

  /**
   * Fetches raw chapter from R2 or local disk cache.
   * Checks prefetch cache first.
   */
  async fetchSourceChapter({ bookId, revision = 1, chapterNumber }) {
    const cacheKey = `${bookId}:r${revision}:${chapterNumber}`;

    // 1. Check in-memory prefetch cache
    if (this.prefetchCache.has(cacheKey)) {
      const cached = this.prefetchCache.get(cacheKey);
      this.prefetchCache.delete(cacheKey);
      return cached;
    }

    // 2. If a prefetch is actively running, await it
    if (this.prefetchPromises.has(cacheKey)) {
      const res = await this.prefetchPromises.get(cacheKey);
      this.prefetchPromises.delete(cacheKey);
      return res;
    }

    // 3. Check local raw cache on disk
    const diskPath = this.getRawCachePath(bookId, revision, chapterNumber);
    if (fs.existsSync(diskPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(diskPath, "utf8"));
        if (raw?.content) return raw;
      } catch {
        // Continue to network fetch
      }
    }

    // 4. Fetch from R2: try .original.json first, then .json
    this.getCount++;
    const originalKey = LAYOUT.chapterOriginal(bookId, revision, chapterNumber);
    let rawJson = await this.storage.get(originalKey);

    if (!rawJson) {
      this.getCount++;
      const stdKey = LAYOUT.chapter(bookId, revision, chapterNumber);
      rawJson = await this.storage.get(stdKey);
    }

    if (!rawJson) {
      throw new Error(`Chapter ${chapterNumber} not found on R2 for book ${bookId} (rev ${revision})`);
    }

    const parsed = JSON.parse(rawJson);
    fs.writeFileSync(diskPath, JSON.stringify(parsed, null, 2), "utf8");
    return parsed;
  }

  /**
   * Prefetches the next chapter in the background without blocking the worker.
   */
  prefetchNextChapter({ bookId, revision = 1, chapterNumber }) {
    const nextChapter = chapterNumber + 1;
    const cacheKey = `${bookId}:r${revision}:${nextChapter}`;

    if (this.prefetchCache.has(cacheKey) || this.prefetchPromises.has(cacheKey)) {
      return; // Already prefetching or prefetch done
    }

    const promise = this.fetchSourceChapter({ bookId, revision, chapterNumber: nextChapter })
      .then(result => {
        this.prefetchCache.set(cacheKey, result);
        this.prefetchPromises.delete(cacheKey);
        return result;
      })
      .catch(() => {
        this.prefetchPromises.delete(cacheKey);
        return null;
      });

    this.prefetchPromises.set(cacheKey, promise);
  }

  /**
   * Performs ONE single atomic chapter write to R2 after validation.
   */
  async publishChapterAtomic({
    bookId,
    revision = 1,
    chapterNumber,
    title,
    assembledContent,
    characters,
    metadata = {}
  }) {
    if (!bookId || !chapterNumber || !title || !assembledContent) {
      throw new Error("Missing required parameters for atomic chapter publish");
    }

    const key = LAYOUT.chapter(bookId, revision, chapterNumber);
    const now = new Date().toISOString();

    // 1. Safety Rollback: backup previous R2 version if it exists
    try {
      this.getCount++;
      const currentRemote = await this.storage.get(key);
      if (currentRemote) {
        const backupFile = this.getRollbackPath(bookId, revision, chapterNumber);
        fs.writeFileSync(backupFile, currentRemote, "utf8");
      }
    } catch {
      // Non-blocking rollback backup
    }

    // 2. Prepare chapter document
    const chapterDoc = {
      schema: 1,
      bookId,
      revision,
      chapterNumber,
      title: title.trim(),
      content: assembledContent.trim(),
      translationStatus: "completed",
      characters: characters || assembledContent.trim().length,
      updatedAt: now,
      provider: metadata.provider || "agent-runtime",
      model: metadata.model || "agent-native",
      translationVersion: metadata.translationVersion || "agent-v2"
    };

    // 3. Single atomic PUT to R2
    this.putCount++;
    await this.storage.put(key, JSON.stringify(chapterDoc, null, 2), {
      contentType: "application/json; charset=utf-8",
      cacheControl: "public, max-age=60, stale-while-revalidate=600"
    });

    // 4. Verify read-back immediately
    this.getCount++;
    const verifiedRaw = await this.storage.get(key);
    if (!verifiedRaw) {
      throw new Error(`R2 write verification failed: read-back returned null for ${key}`);
    }
    const verified = JSON.parse(verifiedRaw);
    if (verified.characters !== chapterDoc.characters) {
      throw new Error(`R2 write verification failed: characters mismatch on ${key} (expected ${chapterDoc.characters}, got ${verified.characters})`);
    }

    // 5. Keep the durable queue and reader index consistent with the chapter.
    const syncResult = await syncCompletedChapter({
      storage: this.storage,
      bookId,
      revision,
      chapterNumber,
      title,
      provider: chapterDoc.provider,
      model: chapterDoc.model
    });

    // 6. Sync Supabase book progress if configured
    if (this.db) {
      try {
        await this.db.upsertChapters(bookId, revision, [
          {
            chapterNumber,
            title: title.trim(),
            translationStatus: "completed"
          }
        ]);
        if (syncResult?.index) {
          await this.db.updateBookProgress(bookId, {
            totalChapters: syncResult.index.totalChapters,
            translatedChapters: syncResult.index.translatedChapters,
            revision,
            status: syncResult.index.status
          });
        }
      } catch (e) {
        // Non-blocking db sync
      }
    }

    // 7. Regenerate catalog/latest.json
    try {
      await publishCatalogSnapshot({
        storage: this.storage,
        db: this.db
      });
    } catch (e) {
      // Non-blocking catalog publish
    }

    return {
      success: true,
      key,
      characters: chapterDoc.characters,
      translatedChapters: syncResult?.index?.translatedChapters
    };
  }

  getMetrics() {
    return {
      r2GetCount: this.getCount,
      r2PutCount: this.putCount
    };
  }
}

module.exports = {
  R2IOManager
};
