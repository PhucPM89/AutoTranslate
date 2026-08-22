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
  const rawStatus = await storage.get("crawler/status.json");
  if (rawStatus) {
    const st = JSON.parse(rawStatus.toString());
    console.log("Crawler status downloaded items sample:", st.completed?.slice(0, 10) || st.queue?.slice(0, 10));
  }
  const rawQueue = await storage.get("crawler/queue.json");
  if (rawQueue) {
    const q = JSON.parse(rawQueue.toString());
    console.log("Crawler queue sample:", q.slice(0, 10));
  }
}

main().catch(console.error);
