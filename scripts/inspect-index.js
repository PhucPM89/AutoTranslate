"use strict";

const fs = require("fs");
const path = require("path");

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

const ROOT = path.join(__dirname, "..");
const env = {
  ...parseEnvFile(path.join(ROOT, ".env")),
  ...parseEnvFile(path.join(ROOT, ".env.local")),
  ...process.env
};

const { createStorage } = require("../server/storage/index");

async function checkIndexFormat() {
  const storage = createStorage(env);
  const raw = await storage.get("books/fanqie-7523058757635427390/index.json");
  if (raw) {
    const idx = JSON.parse(raw.toString("utf8"));
    console.log("Index keys:", Object.keys(idx));
    console.log("First 3 chapters structure:", idx.chapters.slice(0, 3));
    console.log("Chapters 150-155 structure:", idx.chapters.slice(150, 155));
  }
}

checkIndexFormat().catch(console.error);
