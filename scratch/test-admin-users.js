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

async function main() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log("Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return;
  }

  // 1. Fetch Auth Users
  const authRes = await fetch(`${url}/auth/v1/admin/users`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });

  console.log("Auth Admin Users status:", authRes.status);
  const authData = await authRes.json().catch(() => ({}));
  console.log("Auth users count:", authData.users ? authData.users.length : (Array.isArray(authData) ? authData.length : 0));
  if (authData.users && authData.users[0]) {
    console.log("Sample Auth User:", {
      id: authData.users[0].id,
      email: authData.users[0].email,
      created_at: authData.users[0].created_at,
      last_sign_in_at: authData.users[0].last_sign_in_at,
      user_metadata: authData.users[0].user_metadata
    });
  }

  // 2. Fetch Leaderboard profiles
  const leadRes = await fetch(`${url}/rest/v1/reader_leaderboard?select=*`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });
  console.log("Leaderboard status:", leadRes.status);
  const leadData = await leadRes.json().catch(() => []);
  console.log("Leaderboard profiles count:", Array.isArray(leadData) ? leadData.length : 0);
  if (Array.isArray(leadData) && leadData[0]) {
    console.log("Sample Leaderboard profile:", leadData[0]);
  }
}

main().catch(console.error);
