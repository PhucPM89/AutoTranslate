#!/usr/bin/env node
"use strict";

// Download a canonical Qidian cover and persist it under its immutable Drive
// storage key. This repairs an absent/stale cover without relying on a runtime
// fallback or an ambiguous display filename.

const fs = require("node:fs");
const path = require("node:path");
const { createDriveStorage } = require("../server/storage/drive-storage-driver");

for (const envFile of [".env.local", ".env"]) {
  const file = path.resolve(__dirname, "..", envFile);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
}

const id = String(process.argv[2] || "");
if (!/^\d{6,20}$/.test(id)) {
  console.error("Usage: node scripts/refresh-qidian-cover.js <qidian-book-id>");
  process.exit(2);
}

async function main() {
  const source = `https://bookcover.yuewen.com/qdbimg/349573/${id}/600`;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Qidian cover HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length < 1024) throw new Error("Qidian cover quá nhỏ, từ chối ghi Drive.");
  const stored = await createDriveStorage(process.env).put(`covers/qidian-${id}.jpg`, body, {
    contentType: "image/jpeg",
    cacheControl: "public, max-age=604800"
  });
  console.log(JSON.stringify({ key: stored.key, driveId: stored.id, bytes: body.length, source }));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
