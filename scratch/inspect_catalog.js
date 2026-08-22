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
  const raw = await storage.get("catalog/latest.json");
  const catalog = raw ? JSON.parse(raw.toString()) : null;
  const books = catalog?.books || [];
  console.log("Total books in catalog:", books.length);
  console.log("Sample book 0:", books[0]);
  console.log("Sample book last:", books[books.length - 1]);
  
  // Show first 10 books in array order:
  console.log("\nBooks array head:");
  books.slice(0, 10).forEach((b, i) => console.log(`${i+1}. [${b.id}] ${b.title} (updatedAt: ${b.updatedAt}, createdAt: ${b.createdAt || b.created_at})`));

  console.log("\nBooks array tail (newest additions):");
  books.slice(-10).forEach((b, i) => console.log(`${books.length - 10 + i + 1}. [${b.id}] ${b.title} (updatedAt: ${b.updatedAt}, createdAt: ${b.createdAt || b.created_at})`));
}

main().catch(console.error);
