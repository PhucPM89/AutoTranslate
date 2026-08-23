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

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_AI_TOKEN;
  console.log("Checking Cloudflare Zone Cache Purge...");

  // Also check if we can purge via Cloudflare API
  // Let's test fetching with cache-busting query
  const testUrl = `https://cdn.tram-chu.online/books/fanqie-6883748331202284558/r1/ch/1550.json?t=${Date.now()}`;
  const res = await fetch(testUrl);
  if (res.ok) {
    const data = await res.json();
    console.log("Direct CDN response (bypassing browser cache):");
    console.log("- Title:", data.title);
    console.log("- Characters:", data.characters);
    console.log("- Content preview:\n", data.content.slice(0, 300));
  } else {
    console.log("CDN fetch error:", res.status);
  }
}

main().catch(console.error);
