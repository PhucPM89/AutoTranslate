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
  const key = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").split(",")[0].trim();
  const url = "https://api.groq.com/openai/v1/models";
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` }
  });
  const data = await res.json();
  console.log("AVAILABLE MODELS ON GROQ:");
  if (data.data) {
    for (const m of data.data) {
      console.log(`- ${m.id} (owned_by: ${m.owned_by}, active: ${m.active})`);
    }
  } else {
    console.log(data);
  }
}

main().catch(console.error);
