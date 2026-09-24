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

const { createSupabase } = require("../server/supabase");
const { createStorage } = require("../server/storage");

const BOOK_ID = "qidian-1036575193";

async function main() {
  console.log("=== SYNCING ALL 250 CHAPTER METADATA AND FORMATTING ===");
  const supabase = createSupabase();
  const storage = createStorage();

  let normalizedFormatCount = 0;
  let updatedDbCount = 0;

  for (let n = 1; n <= 250; n++) {
    const chapterKey = `books/${BOOK_ID}/r1/ch/${n}.json`;
    const buf = await storage.get(chapterKey);
    if (!buf) {
      console.error(`❌ Chapter ${n} NOT FOUND in R2!`);
      continue;
    }

    const doc = JSON.parse(buf.toString("utf8"));
    let content = (doc.content || "").trim();

    // Check if content has single newlines where paragraphs should have double newlines
    const doubleCount = content.split(/\n\s*\n/).filter(p => p.trim()).length;
    const singleCount = content.split(/\n+/).filter(p => p.trim()).length;

    let modifiedR2 = false;
    if (doubleCount === 1 && singleCount > 10) {
      // It's single-newline separated! Convert to double newlines
      const lines = content.split(/\n+/).map(l => l.trim()).filter(Boolean);
      content = lines.join("\n\n");
      doc.content = content;
      doc.characters = content.length;
      modifiedR2 = true;
      normalizedFormatCount++;
      console.log(`[FORMAT] Chapter ${n}: Normalized ${singleCount} paragraphs to double newlines.`);
    }

    if (modifiedR2) {
      await storage.put(chapterKey, JSON.stringify(doc, null, 2), {
        contentType: "application/json; charset=utf-8",
        cacheControl: "public, max-age=60, stale-while-revalidate=600"
      });
    }

    const charCount = content.length;
    const finalTitle = doc.title || `Chương ${n}`;

    // Update Supabase
    try {
      await supabase.request("chapters", {
        method: "PATCH",
        query: `?book_id=eq.${encodeURIComponent(BOOK_ID)}&chapter_number=eq.${n}`,
        body: {
          title: finalTitle,
          translation_status: "completed",
          characters: charCount,
          updated_at: new Date().toISOString()
        }
      });
      updatedDbCount++;
    } catch (err) {
      console.warn(`Supabase patch chapter ${n} error:`, err.message);
    }
  }

  // Update book progress
  await supabase.request("books", {
    method: "PATCH",
    query: `?id=eq.${encodeURIComponent(BOOK_ID)}`,
    body: {
      translated_chapters: 250,
      updated_at: new Date().toISOString()
    }
  });

  console.log("\n--- SYNC COMPLETED ---");
  console.log(`Normalized R2 formatting: ${normalizedFormatCount} chapters`);
  console.log(`Updated Supabase chapters: ${updatedDbCount}/250 chapters`);
  console.log(`Updated Supabase book 'translated_chapters': 250`);
}

main().catch(console.error);
