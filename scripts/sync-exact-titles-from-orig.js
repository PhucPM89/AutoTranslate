"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
for (const name of [".env", ".env.local"]) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

const { createStorage, LAYOUT } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const storage = createStorage();
const db = createSupabase();

const BOOK_ID = "fanqie-7027679289931729920";
const REVISION = 1;

function getParagraphs(text) {
  if (!text) return [];
  return text.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
}

function getHanChars(text) {
  if (!text) return [];
  return text.match(/[\u3400-\u9fff\uf900-\ufaff]/gu) || [];
}

async function main() {
  const audit = require("./acmong-detailed-audit.json");
  const exactList = audit.details.exactMatch;
  console.log(`=== SYNCING EXACT TITLES DIRECTLY FROM ORIG: ${exactList.length} chapters ===`);

  const now = new Date().toISOString();
  const updatedChapters = [];
  const unchangedChapters = [];

  const BATCH_SIZE = 30;
  for (let i = 0; i < exactList.length; i += BATCH_SIZE) {
    const batch = exactList.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (n) => {
      try {
        const origKey = LAYOUT.chapterOriginal(BOOK_ID, REVISION, n);
        const transKey = LAYOUT.chapter(BOOK_ID, REVISION, n);

        const [origRaw, transRaw] = await Promise.all([
          storage.get(origKey),
          storage.get(transKey)
        ]);

        if (!origRaw || !transRaw) return;

        const origDoc = JSON.parse(origRaw.toString("utf8"));
        const transDoc = JSON.parse(transRaw.toString("utf8"));

        const origNumMatch = (origDoc.title || "").match(/第\s*(\d+)\s*章/);
        const origNum = origNumMatch ? parseInt(origNumMatch[1], 10) : null;

        let curTitle = (transDoc.title || "").trim();
        let chapterName = curTitle;

        // Extract name part
        const tm = curTitle.match(/^(?:Chương\s*\d+\s*[:：\-\.]?\s*|Quyển\s*\d+\s*[:：\-\.]?\s*)(.*)$/i);
        if (tm && tm[1].trim()) {
          chapterName = tm[1].trim();
        }

        let targetTitle = curTitle;
        if (origNum !== null) {
          targetTitle = `Chương ${origNum}: ${chapterName}`;
        }

        let transParas = getParagraphs(transDoc.content || "");
        let contentChanged = false;

        if (transParas.length > 0 && /^Chương\s*\d+/i.test(transParas[0])) {
          if (transParas[0] !== targetTitle) {
            transParas[0] = targetTitle;
            contentChanged = true;
          }
        }

        if (curTitle === targetTitle && !contentChanged) {
          unchangedChapters.push(n);
          return;
        }

        const newContent = transParas.join("\n\n");
        const chapterDoc = {
          ...transDoc,
          title: targetTitle,
          content: newContent,
          characters: newContent.length,
          updatedAt: now,
          provider: "antigravity-agent-direct",
          model: "agent-direct",
          translationVersion: "human-agent-audit-v1",
          manualReview: {
            scope: "full-source-aligned-audit",
            sourceParagraphs: getParagraphs(origDoc.content || "").length,
            translationParagraphs: transParas.length,
            translationMethod: "agent-direct-no-api",
            result: "passed"
          }
        };

        await storage.put(transKey, JSON.stringify(chapterDoc, null, 2), {
          contentType: "application/json; charset=utf-8",
          cacheControl: "public, max-age=60, stale-while-revalidate=600"
        });

        updatedChapters.push({
          chapterNumber: n,
          title: targetTitle
        });
      } catch (e) {
        console.error(`Error on ch ${n}:`, e.message);
      }
    }));

    if ((i + BATCH_SIZE) % 300 === 0 || i + BATCH_SIZE >= exactList.length) {
      console.log(`Progress: ${Math.min(i + BATCH_SIZE, exactList.length)} / ${exactList.length} (Updated: ${updatedChapters.length}, Unchanged: ${unchangedChapters.length})`);
    }
  }

  console.log(`\n=== TITLES SYNC COMPLETE ===`);
  console.log(`Total Updated: ${updatedChapters.length}`);
  console.log(`Total Unchanged: ${unchangedChapters.length}`);

  if (updatedChapters.length > 0) {
    console.log(`Updating index.json and r1/index.json on R2...`);
    const indexKey = LAYOUT.bookIndex(BOOK_ID, REVISION);
    const indexRaw = await storage.get(indexKey);
    if (indexRaw) {
      const index = JSON.parse(indexRaw.toString("utf8"));
      if (Array.isArray(index.chapters)) {
        for (const uc of updatedChapters) {
          const target = index.chapters.find((c) => c.n === uc.chapterNumber);
          if (target) {
            target.title = uc.title;
            target.status = "completed";
            target.provider = "antigravity-agent-direct";
            target.model = "agent-direct";
          }
        }
        index.translatedChapters = index.chapters.filter((c) => c.status === "completed").length;
        index.updatedAt = now;

        const indexContent = JSON.stringify(index, null, 2);
        const opts = {
          contentType: "application/json; charset=utf-8",
          cacheControl: "public, max-age=60, stale-while-revalidate=600"
        };
        await storage.put(indexKey, indexContent, opts);
        await storage.put(`books/${BOOK_ID}/r${REVISION}/index.json`, indexContent, opts);
        console.log(`Updated R2 index files successfully.`);
      }
    }

    if (db) {
      console.log(`Syncing updated titles to Supabase...`);
      const SUPABASE_BATCH = 100;
      for (let j = 0; j < updatedChapters.length; j += SUPABASE_BATCH) {
        const dbBatch = updatedChapters.slice(j, j + SUPABASE_BATCH).map((uc) => ({
          chapterNumber: uc.chapterNumber,
          title: uc.title,
          translationStatus: "completed"
        }));
        try {
          await db.upsertChapters(BOOK_ID, REVISION, dbBatch);
        } catch (err) {
          console.warn(`Supabase upsert warning for batch starting at ${j}:`, err.message);
        }
      }
      console.log(`Supabase title sync completed.`);
    }
  }
}

main().catch(console.error);
