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

const { translateMetadata } = require("../server/gemini");

async function main() {
  const meta = {
    title: "长生万年，多亿点熟人怎么了？",
    author: "以非当年少",
    description: "【长生苟道+宗门日常+轻松幽默+无女主】\n陈长生穿越修仙界，觉醒长生道果，寿元无尽。"
  };

  console.log("Testing translateMetadata...");
  const keys = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "").split(",");
  const res = await translateMetadata(meta, keys);
  console.log("Result:", res);
}

main().catch(console.error);
