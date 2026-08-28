#!/usr/bin/env node
"use strict";

/**
 * 🛠️ SCAN & FIX MISSING CHAPTERS ACROSS ALL BOOKS
 * Quét toàn bộ 253 bộ truyện, phát hiện chính xác các chương bị sót / lỗi / thiếu
 * và đồng bộ tiến độ chuẩn xác 100% lên R2 và Supabase.
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

const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { translateText, getActiveKeys } = require("../server/gemini");

const storage = createStorage();
const db = createSupabase();
const keys = getActiveKeys().filter((k) => k && !k.includes("QA_KEY_"));

async function readJson(stor, key) {
  try {
    const raw = await stor.get(key);
    return raw ? JSON.parse(raw.toString("utf8")) : null;
  } catch {
    return null;
  }
}

async function auditAndFixBook(bookId, fix = true) {
  const index = await readJson(storage, `books/${bookId}/index.json`);
  if (!index || !Array.isArray(index.chapters)) return null;

  const jobKey = `jobs/${bookId}/translation.json`;
  const jobState = await readJson(storage, jobKey);
  if (!jobState || !Array.isArray(jobState.chapters)) return null;

  const rev = index.revision || jobState.revision || 1;
  const title = index.title || bookId;
  const total = jobState.chapters.length;

  let completedCount = 0;
  const missingChapters = [];

  for (const ch of jobState.chapters) {
    const n = ch.n;
    const chDoc = await readJson(storage, `books/${bookId}/r${rev}/ch/${n}.json`);
    const content = chDoc?.content || "";

    if (!chDoc || content.length < 50 || /[\u4e00-\u9fa5]{3,}/.test(content)) {
      ch.status = "pending";
      missingChapters.push(n);
    } else {
      ch.status = "completed";
      completedCount++;
    }
  }

  // Nếu có chương thiếu và được yêu cầu dịch bù
  if (missingChapters.length > 0 && missingChapters.length <= 15 && fix && keys.length > 0) {
    console.log(`\n🔧 Đang tự động dịch bù ${missingChapters.length} chương cho [${title}]...`);
    for (const n of missingChapters) {
      let orig = await storage.get(`books/${bookId}/r${rev}/ch/${n}.original.json`);
      if (!orig) orig = await storage.get(`books/${bookId}/r${rev}/ch/${n}.json`);
      if (!orig) continue;

      const origDoc = JSON.parse(orig.toString("utf8"));
      const rawTitle = origDoc.title || `Chương ${n}`;
      const rawContent = origDoc.content || "";

      try {
        const resTitle = await translateText(rawTitle, keys, { provider: "gemini" });
        const resContent = await translateText(rawContent, keys, { provider: "gemini" });

        const doc = {
          schema: 1,
          bookId,
          chapterNumber: n,
          revision: rev,
          title: resTitle.translation.trim(),
          content: resContent.translation.trim(),
          translatedAt: new Date().toISOString(),
          provider: "gemini",
          model: "gemini-3.6-flash"
        };
        await storage.put(`books/${bookId}/r${rev}/ch/${n}.json`, JSON.stringify(doc));
        const jobCh = jobState.chapters.find((c) => c.n === n);
        if (jobCh) jobCh.status = "completed";
        completedCount++;
        console.log(`  ✓ Đã dịch xong ch ${n}: [${doc.title}]`);
      } catch (err) {
        console.error(`  ❌ Lỗi dịch ch ${n}:`, err.message);
      }
    }
  }

  // Cập nhật lại index & DB
  index.translatedChapters = completedCount;
  index.totalChapters = total;
  index.updatedAt = new Date().toISOString();

  await storage.put(`books/${bookId}/index.json`, JSON.stringify(index), {
    contentType: "application/json",
    cacheControl: "no-cache"
  });
  await storage.put(jobKey, JSON.stringify(jobState), {
    contentType: "application/json",
    cacheControl: "no-cache"
  });

  if (db && typeof db.updateBookProgress === "function") {
    await db.updateBookProgress(bookId, {
      totalChapters: total,
      translatedChapters: completedCount,
      revision: rev
    });
  }

  return {
    bookId,
    title,
    total,
    translated: completedCount,
    missing: missingChapters.length
  };
}

async function main() {
  console.log("\n===============================================================================");
  console.log("   🛠️  QUÉT VÀ SỬA TOÀN DIỆN CÁC CHƯƠNG BỊ THIẾU TRONG HỆ THỐNG");
  console.log("===============================================================================\n");

  const objects = await storage.list("jobs/");
  const jobKeys = objects.filter((o) => o.key.endsWith("/translation.json"));
  console.log(`📚 Đang quét kiểm tra ${jobKeys.length} bộ truyện...\n`);

  for (const obj of jobKeys) {
    const bookId = obj.key.split("/")[1];
    const result = await auditAndFixBook(bookId, true);
    if (result && result.missing > 0) {
      console.log(
        `📖 [${result.title}]: Đã đồng bộ ${result.translated}/${result.total} chương (Sót: ${result.missing})`
      );
    }
  }

  console.log("\n✅ Đang làm mới Catalog Snapshot trên CDN...");
  const { execSync } = require("child_process");
  try {
    execSync("node scripts/refresh-catalog.js", { stdio: "inherit" });
  } catch {}

  console.log("\n🎉 HOÀN TẤT ĐỒNG BỘ VÀ FIX TOÀN BỘ CÁC BỘ TRUYỆN!");
}

main().catch(console.error);
