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

async function testModelTranslate(apiKey, model, text) {
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "Bạn là dịch giả tiểu thuyết Trung Quốc sang tiếng Việt chuyên nghiệp. Hãy dịch toàn bộ sang tiếng Việt tự nhiên, chuẩn văn phong tiên hiệp/huyền huyễn. Chỉ trả về bản dịch."
          },
          {
            role: "user",
            content: `Dịch chương sau sang tiếng Việt:\n\n${text}`
          }
        ],
        max_completion_tokens: 4096,
        temperature: 0.3
      })
    });
    const data = await res.json();
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    if (res.ok) {
      const out = data.choices?.[0]?.message?.content || "";
      const tpm = res.headers.get("x-ratelimit-remaining-tokens");
      const tpmLimit = res.headers.get("x-ratelimit-limit-tokens");
      console.log(`[OK] Model: ${model} (${elapsed}s) - Tokens: ${data.usage?.total_tokens}, TPM Limit: ${tpmLimit}, Remaining: ${tpm}`);
      console.log(`Preview: ${out.slice(0, 150)}...\n`);
      return true;
    } else {
      console.log(`[FAIL] Model: ${model} (${elapsed}s, HTTP ${res.status}): ${data.error?.message}\n`);
      return false;
    }
  } catch (e) {
    console.log(`[ERR] Model: ${model}: ${e.message}\n`);
    return false;
  }
}

async function main() {
  const key = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").split(",")[0].trim();
  const sampleText = `第82章 徒弟的作用
我们姜家的老祖宗姜子牙是天阶一品的神相，所以他才能行逆天之事，辅佐武王伐纣，为大周王朝打下了八百年的江山。
诸葛亮虽有经天纬地之才，惊天地泣鬼神之能，但他却只能辅佐先主刘备三分天下，并不能让后主阿斗入主中原。
看来诸葛亮虽然也是神相，但神相和神相之间还是有着非常大的差别的。`;

  console.log("Testing candidate models on Groq:\n");
  for (const m of ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b", "groq/compound", "groq/compound-mini"]) {
    await testModelTranslate(key, m, sampleText);
  }
}

main().catch(console.error);
