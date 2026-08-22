"use strict";

const path = require("path");
const fs = require("fs");

function loadEnvFile(file) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match) {
        let val = match[2].trim();
        if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
        process.env[match[1]] = val;
      }
    }
  }
}

loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { createArchiveStorage, createStorage } = require("../server/storage");
const { createSupabase } = require("../server/supabase");

async function main() {
  const archive = createArchiveStorage();
  const reader = createStorage();
  const db = createSupabase();

  console.log("Checking R2 archive bucket for book archives...");
  const archiveFiles = await archive.list("archive/");
  console.log(`Found ${archiveFiles.length} archive files in R2.`);
  for (const f of archiveFiles.slice(-10)) {
    console.log(`- ${f.key} (${Math.round(f.size / 1024)} KB)`);
  }

  console.log("\nChecking R2 reader bucket for books...");
  const bookIndexFiles = (await reader.list("books/")).filter(o => o.key.endsWith("/index.json"));
  console.log(`Found ${bookIndexFiles.length} book index.json files in reader bucket.`);

  if (db) {
    const books = await db.listBooks({ limit: 500 });
    console.log(`\nFound ${books.length} published books in Supabase database.`);
  }
}

main().catch(console.error);
