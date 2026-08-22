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

const { createStorage } = require("../server/storage");

async function check() {
  const storage = createStorage();
  const bookIndex = await storage.get("books/fanqie-7077516958534470656/index.json");
  if (bookIndex) {
    console.log("Book Index found:\n", bookIndex.toString("utf8").slice(0, 500));
  } else {
    console.log("Book index not created yet, still uploading chapters...");
  }
}

check().catch(console.error);
