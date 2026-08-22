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

async function testWithMaxTokens(maxTokens) {
  const key = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").split(",")[0].trim();
  const bookId = "fanqie-6497813954591460365";
  const chNum = 85;

  const { createStorage } = require("../server/storage");
  const storage = createStorage();
  const origRaw = await storage.get(`books/${bookId}/r1/ch/${chNum}.original.json`);
  const doc = JSON.parse(origRaw.toString());

  const url = "https://api.groq.com/openai/v1/chat/completions";
  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [
        {
          role: "system",
          content: "Bạn là dịch giả tiểu thuyết Trung Quốc sang tiếng Việt chuyên nghiệp. Hãy dịch toàn bộ sang tiếng Việt tự nhiên. Chỉ trả về bản dịch."
        },
        {
          role: "user",
          content: `Dịch chương sau sang tiếng Việt:\n\n${doc.content}`
        }
      ],
      max_completion_tokens: maxTokens,
      temperature: 0.3
    })
  });

  const data = await res.json();
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  if (res.ok) {
    const out = data.choices?.[0]?.message?.content || "";
    console.log(`[SUCCESS] with max_completion_tokens=${maxTokens} in ${elapsed}s! Output length: ${out.length}`);
    console.log("Preview:", out.slice(0, 200));
  } else {
    console.log(`[FAIL] with max_completion_tokens=${maxTokens}:`, data.error?.message);
  }
}

async function main() {
  await testWithMaxTokens(3500);
}

main().catch(console.error);
