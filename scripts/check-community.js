"use strict";
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

const { createSupabase } = require("../server/supabase");
const db = createSupabase();

async function main() {
  if (!db) {
    console.log("No Supabase configured.");
    return;
  }
  try {
    const comments = await db.request("paragraph_comments", { query: "?select=*&order=created_at.desc&limit=10" });
    console.log("Comments count returned:", comments?.length);
    console.log("Sample comments:", comments?.slice(0, 3));
  } catch (e) {
    console.log("Comments error:", e.message);
  }

  try {
    const suggestions = await db.request("glossary_suggestions", { query: "?select=*&order=created_at.desc&limit=10" });
    console.log("Glossary suggestions returned:", suggestions?.length);
    console.log("Sample suggestions:", suggestions?.slice(0, 3));
  } catch (e) {
    console.log("Glossary suggestions error:", e.message);
  }
}

main();
