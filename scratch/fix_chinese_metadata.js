"use strict";
const path = require("path");
const fs = require("fs");

function loadEnv(file) {
  if (fs.existsSync(file)) {
    for (const l of fs.readFileSync(file, "utf8").split("\n")) {
      const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        let v = m[2].trim();
        if (/^["'].*["']$/.test(v)) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  }
}
loadEnv(path.join(__dirname, "..", ".env"));
loadEnv(path.join(__dirname, "..", ".env.local"));

const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");
const { translateMetadata } = require("../server/gemini");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");

function hasHan(s) {
  return /[\u4e00-\u9fa5]/.test(String(s || ""));
}

async function main() {
  const storage = createStorage();
  const db = createSupabase(process.env);
  const keys = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").split(",").map(k => k.trim()).filter(Boolean);

  console.log("Fetching catalog from R2...");
  const rawCatalog = await storage.get("catalog/latest.json");
  const catalog = rawCatalog ? JSON.parse(rawCatalog.toString()) : { books: [] };
  const books = catalog.books || [];

  console.log(`Checking ${books.length} books in catalog for untranslated Chinese metadata...`);
  const untranslated = [];

  for (const book of books) {
    if (hasHan(book.title) || hasHan(book.author) || (book.description && hasHan(book.description))) {
      untranslated.push(book);
    }
  }

  console.log(`Found ${untranslated.length} books with Chinese metadata!`);
  for (const b of untranslated) {
    console.log(`- [${b.id}] Title: ${b.title} | Author: ${b.author}`);
  }

  let fixedCount = 0;
  for (let i = 0; i < untranslated.length; i++) {
    const book = untranslated[i];
    console.log(`\n[${i + 1}/${untranslated.length}] Translating metadata for: ${book.id} (${book.title})...`);

    // Fetch original raw metadata from storage index.json or epub if possible
    let sourceMeta = {
      title: book.title,
      author: book.author,
      description: book.description
    };

    const rawIndex = await storage.get(`books/${book.id}/index.json`);
    let indexObj = null;
    if (rawIndex) {
      indexObj = JSON.parse(rawIndex.toString());
      sourceMeta.title = indexObj.title || sourceMeta.title;
      sourceMeta.author = indexObj.author || sourceMeta.author;
      sourceMeta.description = indexObj.description || sourceMeta.description;
    }

    try {
      const translated = await translateMetadata(sourceMeta, keys);
      console.log(`  -> Translated Title: ${translated.title}`);
      console.log(`  -> Translated Author: ${translated.author}`);
      console.log(`  -> Model used: ${translated.model}`);

      // 1. Update R2 books/<bookId>/index.json
      if (indexObj) {
        indexObj.title = translated.title;
        indexObj.author = translated.author;
        indexObj.description = translated.description;
        await storage.put(`books/${book.id}/index.json`, Buffer.from(JSON.stringify(indexObj, null, 2)), "application/json");
      }

      // 2. Update book in in-memory catalog
      const catalogEntry = books.find(b => b.id === book.id);
      if (catalogEntry) {
        catalogEntry.title = translated.title;
        catalogEntry.author = translated.author;
        catalogEntry.description = translated.description;
      }

      // 3. Update Supabase if configured
      if (db) {
        try {
          await db.upsertBook({
            id: book.id,
            title: translated.title,
            author: translated.author,
            description: translated.description,
            cover_url: book.cover || indexObj?.cover,
            status: book.status || indexObj?.status || "Đang cập nhật",
            total_chapters: book.chapterCount || indexObj?.totalChapters || 0,
            translated_chapters: book.translatedChapters || indexObj?.translatedChapters || 0,
            revision: book.revision || indexObj?.revision || 1
          });
        } catch (dbErr) {
          console.warn(`  (Supabase update warning: ${dbErr.message})`);
        }
      }

      fixedCount++;
      // Wait a little bit between requests
      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      console.error(`  [ERROR] Failed translating metadata for ${book.id}:`, err.message);
    }
  }

  console.log(`\nFixed metadata for ${fixedCount}/${untranslated.length} books.`);

  // 4. Regenerate and publish catalog/latest.json to R2
  console.log("Publishing updated catalog snapshot to R2...");
  await publishCatalogSnapshot({ storage, env: process.env, log: console.log });

  console.log("All done!");
}

main().catch(console.error);
