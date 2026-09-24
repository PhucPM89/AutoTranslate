"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
for (const envName of [".env.local", ".env"]) {
  const envPath = path.join(ROOT, envName);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

const { createSupabase } = require("../server/supabase");
const supabase = createSupabase();

async function main() {
  const books = await supabase.request("books", {
    query: "?select=id,title,total_chapters,translated_chapters,status"
  });
  console.log("Books list:");
  console.table(books);
}

main().catch(console.error);
