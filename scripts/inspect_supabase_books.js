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

const { createSupabase } = require("../server/supabase");
const { createStorage } = require("../server/storage");

async function main() {
  const db = createSupabase();
  const storage = createStorage();

  console.log("=== 1. SUPABASE BOOKS TABLE ===");
  const rows = await db.request("books", { query: "?select=id,title,total_chapters,translated_chapters,published&limit=30" });
  console.table(rows);

  console.log("\n=== 2. CHECK R2 INDEX.JSON FOR FIRST 5 BOOKS ===");
  for (const r of rows.slice(0, 8)) {
    const raw = await storage.get(`books/${r.id}/index.json`);
    if (raw) {
      const idx = JSON.parse(raw.toString("utf8"));
      console.log(`[${r.id}] title: "${idx.title}" | totalChapters: ${idx.totalChapters} | translatedChapters: ${idx.translatedChapters} | chapters.length: ${idx.chapters?.length}`);
    } else {
      console.log(`[${r.id}] index.json NOT FOUND on R2`);
    }
  }
}

main().catch(console.error);
