"use strict";

const fs = require("node:fs");
for (const envName of [".env.local", ".env"]) {
  if (fs.existsSync(envName)) {
    for (const line of fs.readFileSync(envName, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        let v = m[2].trim();
        if (/^['"].*['"]$/.test(v)) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  }
}

const { createStorage } = require("../server/storage");
const { publishCatalogSnapshot } = require("../server/ingest/catalog-snapshot");
const storage = createStorage(process.env);

async function run() {
  await publishCatalogSnapshot({ storage });
  console.log("Snapshot published successfully.");
}

run().catch(console.error);
