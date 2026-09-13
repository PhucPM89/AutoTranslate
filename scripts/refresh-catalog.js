#!/usr/bin/env node
"use strict";

/**
 * REFRESH & SYNC CATALOG
 * Re-scans all books in Storage/Supabase, recalculates real translated chapter counts,
 * updates updated_at timestamps, and publishes catalog/latest.json to R2 storage.
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
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");

const storage = createStorage();
const db = createSupabase();

async function readJson(stor, key) {
  try {
    const raw = await stor.get(key);
    return raw ? JSON.parse(raw.toString("utf8")) : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("\n=======================================================");
  console.log("   🔄 REFRESHING CATALOG & WEBSITE BOOK STATS");
  console.log("=======================================================\n");

  const objects = await storage.list("jobs/");
  const bookIds = new Set();
  for (const obj of objects) {
    const match = obj.key.match(/^jobs\/([^/]+)\/translation\.json$/);
    if (match) bookIds.add(match[1]);
  }

  // Also include books from Supabase
  if (db) {
    try {
      const dbBooks = await db.listBooks({ limit: 1000 });
      for (const b of dbBooks || []) {
        bookIds.add(b.id);
      }
    } catch {}
  }

  console.log(`Tìm thấy ${bookIds.size} bộ truyện trong hệ thống.\n`);

  for (const bookId of bookIds) {
    const indexKeyPath = `books/${bookId}/index.json`;
    const r1KeyPath = `books/${bookId}/r1/index.json`;
    const index = await readJson(storage, indexKeyPath);
    const r1Index = await readJson(storage, r1KeyPath);
    const targetIndex = r1Index || index;
    if (!targetIndex || !Array.isArray(targetIndex.chapters)) continue;

    const revision = targetIndex.revision || index?.revision || 1;
    const jobState = (await readJson(storage, `jobs/${bookId}/translation.json`)) || {};
    const statusMap = new Map((jobState.chapters || []).map((c) => [c.n, c.status]));

    let realTranslated = 0;
    const completedChapters = [];

    for (const ch of targetIndex.chapters) {
      const n = Number(ch.chapterNumber || ch.number || ch.n);
      const isCompletedInJob = statusMap.get(n) === "completed";
      const isTranslated =
        isCompletedInJob ||
        (ch.translationStatus === "completed" && ch.provider !== "crawler-convert" && ch.provider !== "hachimi") ||
        ch.provider === "antigravity-direct" ||
        (typeof ch.model === "string" && ch.model.startsWith("direct-"));

      if (isTranslated) {
        ch.translationStatus = "completed";
        ch.status = "completed";
        realTranslated++;
        completedChapters.push({
          chapterNumber: n,
          title: ch.title,
          translationStatus: "completed",
          characters: ch.characters || 0
        });
      } else {
        ch.translationStatus = "pending";
        if (ch.status === "completed" && (ch.provider === "crawler-convert" || !ch.provider || ch.provider === "hachimi")) {
          ch.status = "pending";
        }
      }
    }

    const totalChapters = targetIndex.chapters.length;
    const status = realTranslated >= totalChapters && totalChapters > 0 ? "Hoàn thành" : (targetIndex.status || "Đang cập nhật");

    if (index) {
      index.totalChapters = totalChapters;
      index.translatedChapters = realTranslated;
      index.status = status;
      index.updatedAt = new Date().toISOString();
      await storage.put(indexKeyPath, JSON.stringify(index), {
        contentType: "application/json",
        cacheControl: "no-cache"
      });
    }

    if (r1Index) {
      r1Index.totalChapters = totalChapters;
      r1Index.translatedChapters = realTranslated;
      r1Index.status = status;
      r1Index.updatedAt = new Date().toISOString();
      await storage.put(r1KeyPath, JSON.stringify(r1Index), {
        contentType: "application/json",
        cacheControl: "no-cache"
      });
    }

    // Update Supabase DB
    if (db) {
      try {
        await db.updateBookProgress(bookId, {
          totalChapters,
          translatedChapters: realTranslated,
          revision,
          status
        });
        if (completedChapters.length > 0) {
          await db.upsertChapters(bookId, revision, completedChapters);
        }
      } catch (err) {
        console.warn(`  [${bookId}] Lỗi sync Supabase:`, err.message);
      }
    }

    if (realTranslated > 0) {
      console.log(`✓ [${targetIndex.title || bookId}] -> Đã cập nhật: ${realTranslated}/${totalChapters} chương (${status})`);
    }
  }

  // Publish updated catalog/latest.json
  try {
    console.log("\n📦 Đang xuất bản catalog/latest.json lên CDN...");
    await publishCatalogSnapshot({ storage, db });
    console.log("✅ Đã xuất bản catalog snapshot thành công!");
  } catch (err) {
    console.error("❌ Lỗi xuất bản catalog snapshot:", err.message);
  }

  console.log("\n=======================================================");
  console.log("🎉 HOÀN TẤT CẬP NHẬT THÔNG SỐ TOÀN BỘ WEBSITE!");
  console.log("=======================================================\n");
}

main().catch(console.error);
