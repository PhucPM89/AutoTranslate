"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
for (const envName of [".env.local", ".env"]) {
  const envPath = path.join(ROOT, envName);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

const { createStorage } = require("../server/storage");
const storage = createStorage(process.env);

async function main() {
  const origKey = "books/qidian-1036575193/r1/ch/251.original.json";
  const raw = await storage.get(origKey);
  const data = JSON.parse(raw.toString("utf8"));
  console.log("Ch 251 title:", data.title);
  console.log("Ch 251 content len:", data.content.length);
  fs.writeFileSync("scratch/ranh-gioi-hoang-hon/raw_251.txt", data.title + "\n\n" + data.content, "utf8");
  console.log("Saved scratch/ranh-gioi-hoang-hon/raw_251.txt");
}

main().catch(console.error);
