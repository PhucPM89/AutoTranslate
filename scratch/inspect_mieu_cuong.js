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
  const raw = await storage.get("jobs/mieu-cuong-co-su/translation.json");
  const job = raw ? JSON.parse(raw.toString()) : null;
  const chapters = job?.chapters || [];
  console.log("Total chapters in job:", chapters.length);

  const statusCount = {};
  for (const ch of chapters) {
    statusCount[ch.status] = (statusCount[ch.status] || 0) + 1;
  }
  console.log("Status distribution:", statusCount);

  // Find non-completed chapters
  const nonCompleted = chapters.filter(c => c.status !== "completed");
  console.log("Non-completed count:", nonCompleted.length);
  console.log("First 20 non-completed chapters:", nonCompleted.slice(0, 20));

  // Let's check ch 247 vs ch 484
  const ch247 = chapters.find(c => c.n === 247);
  const ch484 = chapters.find(c => c.n === 484);
  console.log("ch 247:", ch247);
  console.log("ch 484:", ch484);

  // Check what original files exist for ch 484, 485...
  for (const n of [246, 247, 484, 485, 486, 487]) {
    const orig = await storage.get(`books/mieu-cuong-co-su/r1/ch/${n}.original.json`);
    const trans = await storage.get(`books/mieu-cuong-co-su/r1/ch/${n}.json`);
    console.log(`ch ${n}: orig exists = ${Boolean(orig)} (${orig ? orig.length : 0} bytes), trans exists = ${Boolean(trans)} (${trans ? trans.length : 0} bytes)`);
  }
}

main().catch(console.error);
