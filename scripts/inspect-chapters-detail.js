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
const { calculateFluencyScore } = require("../server/reflection-engine");

async function inspectChaptersDetail() {
  const storage = createStorage(env);
  const bookId = "fanqie-7550205522633313304";
  
  const rawCh10 = await storage.get(`books/${bookId}/r1/ch/10.json`);
  const rawCh1300 = await storage.get(`books/${bookId}/r1/ch/1300.json`);

  if (rawCh10) {
    const ch = JSON.parse(rawCh10.toString("utf8"));
    console.log("=== CHƯƠNG 10 ===");
    console.log("Keys in doc:", Object.keys(ch));
    console.log("Title:", ch.title);
    console.log("Characters:", ch.characters || (ch.content ? ch.content.length : 0));
    console.log("Excerpt:", ch.content?.slice(0, 200));
    const flu = calculateFluencyScore(ch.content || "");
    console.log("Fluency score:", flu.score, "Issues:", flu.issues);
  }

  if (rawCh1300) {
    const ch = JSON.parse(rawCh1300.toString("utf8"));
    console.log("\n=== CHƯƠNG 1300 ===");
    console.log("Title:", ch.title);
    console.log("Characters:", ch.characters || (ch.content ? ch.content.length : 0));
    console.log("Excerpt:", ch.content?.slice(0, 200));
    const flu = calculateFluencyScore(ch.content || "");
    console.log("Fluency score:", flu.score, "Issues:", flu.issues);
  }
}

inspectChaptersDetail().catch(console.error);
