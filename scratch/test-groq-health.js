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
  const keysStr = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
  const keys = keysStr.split(/[,\n]/).map(k => k.trim()).filter(Boolean);

  console.log(`Tìm thấy ${keys.length} Groq Keys trong môi trường.`);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const masked = key.slice(0, 7) + "..." + key.slice(-4);
    const start = Date.now();
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`
        },
        body: JSON.stringify({
          model: "qwen/qwen3.6-27b",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5
        })
      });
      const latency = Date.now() - start;
      const headers = {};
      for (const [k, v] of res.headers.entries()) {
        if (k.startsWith("x-ratelimit")) headers[k] = v;
      }
      if (res.ok) {
        console.log(`[Key ${i + 1}] ${masked}: ✅ HOẠT ĐỘNG (${latency}ms) - Limit Headers:`, headers);
      } else {
        const errText = await res.text().catch(() => "");
        console.log(`[Key ${i + 1}] ${masked}: ❌ LỖI HTTP ${res.status} (${latency}ms) -`, errText, "- Headers:", headers);
      }
    } catch (err) {
      console.log(`[Key ${i + 1}] ${masked}: ❌ LỖI KẾT NỐI - ${err.message}`);
    }
  }
}

main().catch(console.error);
