#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
for (const file of [".env.local", ".env"]) {
  const target = path.join(process.cwd(), file);
  if (!fs.existsSync(target)) continue;
  for (const line of fs.readFileSync(target, "utf8").split("\n")) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
}
const { createStorage } = require("../server/storage");
const storage = createStorage();
async function readJson(key) { try { const raw = await storage.get(key); return raw ? JSON.parse(raw.toString("utf8")) : null; } catch { return null; } }
async function main() {
  const objects = await storage.list("jobs/");
  const keys = objects.map((item) => item.key).filter((key) => /semantic-review\.json$/.test(key));
  const totals = {};
  const books = [];
  for (const key of keys) {
    const queue = await readJson(key);
    for (const entry of queue?.entries || []) totals[entry.state] = (totals[entry.state] || 0) + 1;
    if (queue?.bookId && books.length < 20) {
      const [bible, context, tm] = await Promise.all([
        readJson(`story-bible/${queue.bookId}.json`), readJson(`story-context/${queue.bookId}.json`), readJson(`tm/books/${queue.bookId}.json`)
      ]);
      books.push({
        bookId: queue.bookId,
        queueEntries: queue.entries.length,
        storyCharacters: bible?.characters?.length || 0,
        storyTerms: bible?.worldTerms?.length || 0,
        recentContextChapters: context?.chapters?.length || 0,
        approvedTmEntries: tm?.entries?.length || 0
      });
    }
  }
  const batches = objects.filter((item) => /^jobs\/gemini-batches\/.*\.json$/.test(item.key));
  const batchStates = {};
  for (const item of batches) {
    const manifest = await readJson(item.key);
    const state = manifest?.state || "unknown";
    batchStates[state] = (batchStates[state] || 0) + 1;
  }
  const date = new Date().toISOString().slice(0, 10);
  const budget = await readJson(`jobs/qa-budget/${date}.json`);
  console.log(JSON.stringify({ queueCount: keys.length, chapters: totals, books, todayBudget: budget || {}, batchManifests: batches.length, batchStates, checkedAt: new Date().toISOString() }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
