"use strict";

const path = require("path");
const fs = require("fs");

function loadEnvFile(file) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match) {
        let val = match[2].trim();
        if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
        process.env[match[1]] = val;
      }
    }
  }
}

loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { translateMetadata } = require("../server/gemini");
const { createStorage } = require("../server/storage");

async function test() {
  const storage = createStorage();
  const rawKeys = await storage.get("config/api-keys.json");
  const keys = JSON.parse(rawKeys.toString("utf8"));
  console.log("Found keys:", keys.length);

  const sample = {
    title: "诡舍",
    author: "夜半读书",
    description: "这是一本悬疑灵异小说。"
  };

  console.log("Testing translateMetadata...");
  try {
    const res = await translateMetadata(sample, keys.join(","));
    console.log("Success:", res);
  } catch (err) {
    console.error("translateMetadata failed:", err);
  }
}

test().catch(console.error);
