#!/usr/bin/env node
"use strict";

// A transparent, durable queue manifest derived only from the latest Drive
// inventory. Fanqie entries are executable by recover-fanqie-batch; other
// sources remain visible instead of being silently omitted.

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const inventory = JSON.parse(fs.readFileSync(path.join(root, "scratch", "drive-originals-status.json"), "utf8"));
const checkpointPath = path.join(root, "scratch", "recover-fanqie-batch-progress.json");
let checkpoint = { completed: [] };
try { checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8")); } catch {}
const completed = new Set(checkpoint.completed || []);
const entries = (inventory.missingOrig || []).map((item) => {
  const id = String(item.bookId || "");
  const source = id.startsWith("fanqie-") ? "fanqie" : id.startsWith("qidian-") ? "qidian" : id.startsWith("bianhua-") ? "bianhua" : "other";
  return {
    bookId: id,
    title: item.folderName || id,
    source,
    state: completed.has(id) ? "completed" : source === "fanqie" ? "queued" : "needs-source-adapter"
  };
});
const output = {
  generatedAt: new Date().toISOString(),
  summary: {
    totalMissing: entries.length,
    completed: entries.filter((entry) => entry.state === "completed").length,
    queuedFanqie: entries.filter((entry) => entry.state === "queued").length,
    needsSourceAdapter: entries.filter((entry) => entry.state === "needs-source-adapter").length
  },
  entries
};
fs.writeFileSync(path.join(root, "scratch", "recovery-queue.json"), JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output.summary));
