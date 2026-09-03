"use strict";

const fs = require("fs");
const path = require("path");

function loadEnv(file) {
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        let val = match[2].trim();
        if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
        process.env[match[1]] = val;
      }
    }
  }
}
loadEnv(path.join(__dirname, "..", ".env"));
loadEnv(path.join(__dirname, "..", ".env.local"));

const { createStorage, createArchiveStorage } = require("../server/storage");

async function main() {
  const s = createStorage();
  const a = createArchiveStorage();

  const publicKeys = await s.list("books/");
  console.log("Public books count:", publicKeys.length);
  
  if (a) {
    const archiveKeys = await a.list("books/");
    console.log("Archive books count:", archiveKeys.length);
    const rawArchiveKeys = await a.list("");
    console.log("Archive root keys:", rawArchiveKeys);
  }
}

main().catch(console.error);
