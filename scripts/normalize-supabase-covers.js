"use strict";

const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[match[1]] = val;
      }
    }
  }
}
loadEnvFile(path.join(__dirname, "..", ".env.local"));
loadEnvFile(path.join(__dirname, "..", ".env"));

const { createSupabase } = require("../server/supabase");
const db = createSupabase(process.env, { role: "service" });

async function main() {
  if (!db) {
    console.error("Supabase not configured");
    process.exit(1);
  }

  const books = await db.request("books", { query: "?select=id,title,cover_url&limit=1000" });
  console.log(`Tìm thấy ${books.length} sách trong Supabase.`);

  let updated = 0;
  for (const b of books) {
    const targetCover = `/covers/${b.id}.jpg`;
    if (b.cover_url !== targetCover) {
      await db.request("books", {
        method: "PATCH",
        query: `?id=eq.${encodeURIComponent(b.id)}`,
        headers: { Prefer: "return=minimal" },
        body: { cover_url: targetCover }
      });
      updated++;
    }
  }

  console.log(`Đã cập nhật ${updated}/${books.length} sách sang chuẩn '/covers/{id}.jpg'.`);
}

main().catch(console.error);
