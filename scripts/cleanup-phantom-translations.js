// scripts/cleanup-phantom-translations.js
const { createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");

async function main() {
  const storage = createStorage(process.env);
  const supabase = createSupabase(process.env);

  const phantomBookIds = [
    "fanqie-7416384524231134270",
    "fanqie-7415542657239223358",
    "fanqie-7373165433928567832"
  ];

  console.log("Starting cleanup of phantom translation records...");

  for (const bookId of phantomBookIds) {
    console.log(`\n--- Cleaning book: ${bookId} ---`);
    let bookTotal = 0;
    for (const key of [`books/${bookId}/r1/index.json`, `books/${bookId}/index.json`]) {
      try {
        const raw = await storage.get(key);
        if (!raw) continue;
        const data = JSON.parse(raw.toString("utf8"));
        console.log(`Read ${key}: currently translatedChapters=${data.translatedChapters}`);
        data.translatedChapters = 0;
        data.status = "Chờ dịch";
        if (Array.isArray(data.chapters)) {
          bookTotal = data.chapters.length;
          for (const ch of data.chapters) {
            ch.status = "pending";
            ch.translationStatus = "pending";
            if (ch.provider === "hachimi") delete ch.provider;
            if (ch.model && ch.model.includes("Hachimi")) delete ch.model;
          }
        }
        await storage.put(key, JSON.stringify(data), {
          contentType: "application/json",
          cacheControl: "no-cache"
        });
        console.log(`Updated ${key} to translatedChapters=0, status='Chờ dịch'`);
      } catch (err) {
        console.warn(`Could not update ${key}:`, err.message);
      }
    }

    // Update Supabase
    try {
      await supabase.updateBookProgress(bookId, {
        totalChapters: bookTotal,
        translatedChapters: 0,
        status: "Chờ dịch"
      });
      console.log(`Supabase updated for ${bookId} to 0 translated.`);
    } catch (err) {
      console.error(`Supabase error for ${bookId}:`, err.message);
    }
  }

  // Also scan all other books in R2: if index.json has status: 'completed' on chapters but translatedChapters === 0, clean them up!
  console.log("\nScanning all books for chapters with raw crawler 'status: completed' but translationStatus: 'pending'...");
  const prefix = "books/";
  let cursor;
  let fixedBooks = 0;
  do {
    const listRes = await storage.list({ prefix, cursor, limit: 200 });
    const files = listRes.files || [];
    for (const file of files) {
      if (file.key.endsWith("/r1/index.json")) {
        const bookId = file.key.replace("books/", "").replace("/r1/index.json", "");
        // Skip legitimate translated books
        if (["fanqie-7379865527998483480", "fanqie-7027679289931729920", "fanqie-6569423930556156942"].includes(bookId)) {
          continue;
        }

        try {
          const raw = await storage.get(file.key);
          if (!raw) continue;
          const data = JSON.parse(raw.toString("utf8"));
          if ((!data.translatedChapters || data.translatedChapters === 0) && Array.isArray(data.chapters)) {
            let hasMisleadingStatus = false;
            for (const ch of data.chapters) {
              if (ch.status === "completed" && ch.translationStatus !== "completed") {
                ch.status = "pending";
                ch.translationStatus = "pending";
                hasMisleadingStatus = true;
              }
            }
            if (hasMisleadingStatus) {
              await storage.put(file.key, JSON.stringify(data), {
                contentType: "application/json",
                cacheControl: "no-cache"
              });
              console.log(`Fixed misleading crawler status for ${bookId}`);
              fixedBooks++;
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }
    cursor = listRes.cursor;
  } while (cursor);

  console.log(`\nDone! Fixed crawler status for ${fixedBooks} books.`);
}

main().catch(console.error);
