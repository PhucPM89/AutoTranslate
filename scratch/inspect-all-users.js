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

const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function check() {
  const authRes = await fetch(`${url}/auth/v1/admin/users?per_page=100`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const authData = await authRes.json();
  console.log("Auth users count:", authData.users?.length);
  for (const u of (authData.users || [])) {
    console.log(`- Auth User: ${u.id} | email: ${u.email} | name: ${u.user_metadata?.full_name || u.user_metadata?.name}`);
  }

  const profRes = await fetch(`${url}/rest/v1/reader_leaderboard?select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const profData = await profRes.json();
  console.log("\nLeaderboard profiles count:", profData.length);
  for (const p of profData) {
    console.log(`- Profile: ${p.id} | display: ${p.display_name} | exp: ${p.exp} | chapters: ${p.chapters_read}`);
  }
}

check().catch(console.error);
