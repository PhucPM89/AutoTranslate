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

async function testModel(apiKey, model) {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Dịch sang tiếng Việt: Hello world" }],
        max_completion_tokens: 50
      })
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`[OK] Model: ${model} -> ${data.choices?.[0]?.message?.content?.trim()}`);
      return true;
    } else {
      console.log(`[FAIL] Model: ${model} (HTTP ${res.status}): ${data.error?.message}`);
      return false;
    }
  } catch (e) {
    console.log(`[ERR] Model: ${model}: ${e.message}`);
    return false;
  }
}

async function main() {
  const key = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").split(",")[0].trim();
  console.log("Using key:", key.slice(0, 10) + "..." + key.slice(-4));
  
  const models = [
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "llama-3.1-70b-versatile",
    "gemma2-9b-it",
    "llama3-70b-8192",
    "llama3-8b-8192"
  ];

  for (const m of models) {
    await testModel(key, m);
  }
}

main().catch(console.error);
