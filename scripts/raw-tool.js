"use strict";

const fsSync = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
for (const envName of [".env", ".env.local"]) {
  const envFile = path.join(ROOT, envName);
  if (!fsSync.existsSync(envFile)) continue;
  for (const line of fsSync.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      let val = match[2].trim();
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      process.env[match[1]] = val;
    }
  }
}

const { createStorage } = require("../server/storage");
const storage = createStorage();

async function getChapter(n) {
  const rawKey = `books/qidian-1036575193/r1/ch/${n}.original.json`;
  const transKey = `books/qidian-1036575193/r1/ch/${n}.json`;
  const rawBuf = await storage.get(rawKey);
  const transBuf = await storage.get(transKey);
  const rawDoc = rawBuf ? JSON.parse(rawBuf.toString("utf8")) : null;
  const transDoc = transBuf ? JSON.parse(transBuf.toString("utf8")) : null;
  return { rawDoc, transDoc };
}

const chArg = parseInt(process.argv[2] || "125", 10);

async function run() {
  const { rawDoc, transDoc } = await getChapter(chArg);
  console.log(`=== CHAPTER ${chArg} ===`);
  if (rawDoc) {
    const rawContent = rawDoc.content || rawDoc.text || "";
    const rawParas = rawContent.split(/\n\s*\n/).filter(p => p.trim());
    console.log(`RAW: Title="${rawDoc.title}", TotalChars=${rawContent.length}, Paragraphs=${rawParas.length}`);
    console.log("Raw Paras 1..3:\n" + rawParas.slice(0, 3).join("\n---\n"));
    console.log("Raw Paras End:\n" + rawParas.slice(-3).join("\n---\n"));
  } else {
    console.log("No raw doc found!");
  }
  if (transDoc) {
    const transContent = transDoc.content || "";
    const doubleCount = transContent.split(/\n\s*\n/).filter(p => p.trim()).length;
    const singleCount = transContent.split(/\n+/).filter(p => p.trim()).length;
    console.log(`TRANS: Title="${transDoc.title}", TotalChars=${transContent.length}, DoubleNewlines=${doubleCount}, SingleNewlines=${singleCount}`);
    const transParas = (doubleCount > 1 ? transContent.split(/\n\s*\n/) : transContent.split(/\n+/)).filter(p => p.trim());
    console.log("Trans Paras 1..3:\n" + transParas.slice(0, 3).join("\n---\n"));
    console.log("Trans Paras End:\n" + transParas.slice(-3).join("\n---\n"));
  } else {
    console.log("No trans doc found!");
  }
}

run().catch(console.error);
