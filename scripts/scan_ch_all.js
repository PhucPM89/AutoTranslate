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

const { createStorage } = require("../server/storage");

async function main() {
  const storage = createStorage();
  const bookId = "fanqie-6883748331202284558";

  console.log("=== CHECK ALL CH 1540 TO 1555 IN R2 ===");
  for (let i = 1545; i <= 1555; i++) {
    const raw = await storage.get(`books/${bookId}/r1/ch/${i}.json`);
    if (raw) {
      const doc = JSON.parse(raw.toString("utf8"));
      const firstLine = doc.content.split("\n")[0];
      const secondLine = doc.content.split("\n").filter(l => l.trim())[1];
      console.log(`[ch/${i}.json] Title: "${doc.title}" | Lines: "${firstLine}" / "${secondLine}" | Chars: ${doc.characters}`);
      if (doc.content.includes("Hoàng hoàng") || doc.content.includes("hoàng hoàng")) {
        console.log(`  --> ⚠️ CONTAINS 'Hoàng hoàng' in ch/${i}.json!`);
      }
    } else {
      console.log(`[ch/${i}.json] NOT FOUND`);
    }
  }
}

main().catch(console.error);
