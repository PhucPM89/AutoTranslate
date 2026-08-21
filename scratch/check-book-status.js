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

const { createSupabase } = require("../server/supabase");

async function main() {
  const db = createSupabase();
  if (db) {
    const rows = await db.listBooks({ limit: 15 });
    console.log("Sample books from Supabase:");
    for (const b of rows.slice(0, 10)) {
      console.log(`- [${b.id}] title: "${b.title}", status: "${b.status}", total: ${b.total_chapters}, translated: ${b.translated_chapters}`);
    }
  }
}

main().catch(console.error);
