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

async function main() {
  const storage = createStorage();
  const objects = await storage.list("jobs/");
  
  for (const obj of objects) {
    if (!obj.key.endsWith("/translation.json")) continue;
    const raw = await storage.get(obj.key);
    if (!raw) continue;
    const state = JSON.parse(raw.toString("utf8"));
    const pending = state.chapters.filter(c => c.status !== "completed");
    const failed = state.chapters.filter(c => c.status === "failed" || c.lastError);
    const completed = state.chapters.filter(c => c.status === "completed");
    
    if (failed.length > 0 || pending.length > 0) {
      console.log(`=== Book [${state.bookId}] ===`);
      console.log(`Total: ${state.chapters.length}, Completed: ${completed.length}, Pending: ${pending.length}, Failed/Error: ${failed.length}`);
      if (failed[0]) {
        console.log("Sample Error chapter:", {
          n: failed[0].n,
          status: failed[0].status,
          attempts: failed[0].attempts,
          lastError: failed[0].lastError,
          nextAttemptAt: failed[0].nextAttemptAt ? new Date(failed[0].nextAttemptAt).toISOString() : 0
        });
      }
      break;
    }
  }
}

main().catch(console.error);
