#!/usr/bin/env node
"use strict";

// Sequential, resumable recovery of every Fanqie book that the latest Drive
// inventory says lacks raw Chinese chapters. Each child performs its own
// duplicate/folder checks; this wrapper only persists a checkpoint and never
// runs two Tomato jobs concurrently.

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const inventoryPath = path.join(root, "scratch", "drive-originals-status.json");
const checkpointPath = path.join(root, "scratch", "recover-fanqie-batch-progress.json");
const limitIndex = process.argv.indexOf("--limit");
const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : Infinity;
const retryDelayMs = Math.max(60_000, Number(process.env.RECOVERY_RETRY_DELAY_MS || 10 * 60 * 1000));

function readInventory() {
  const data = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  return [...new Set((data.missingOrig || [])
    .map((item) => String(item.bookId || ""))
    .filter((id) => /^fanqie-\d{10,25}$/.test(id)))];
}

function loadCheckpoint() {
  try { return JSON.parse(fs.readFileSync(checkpointPath, "utf8")); }
  catch { return { startedAt: new Date().toISOString(), completed: [], failed: [] }; }
}

function saveCheckpoint(checkpoint) {
  checkpoint.updatedAt = new Date().toISOString();
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2) + "\n");
}

function runBook(bookId) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, "recover-fanqie-originals.js"), "--book", bookId], {
      cwd: root,
      stdio: "inherit"
    });
    child.on("error", (error) => resolve({ ok: false, message: error.message }));
    child.on("exit", (code) => resolve(code === 0 ? { ok: true } : { ok: false, message: `exit ${code}` }));
  });
}

async function main() {
  const candidates = readInventory();
  if (!candidates.length) throw new Error("Không có Fanqie book thiếu originals trong inventory.");
  const checkpoint = loadCheckpoint();
  const completed = new Set(checkpoint.completed || []);
  const selected = candidates.filter((id) => !completed.has(id)).slice(0, Number.isFinite(limit) ? Math.max(0, limit) : undefined);
  console.log(`Recovery queue: ${selected.length}/${candidates.length} Fanqie books.`);
  for (let index = 0; index < selected.length; index++) {
    const bookId = selected[index];
    console.log(`\n[${index + 1}/${selected.length}] ${bookId}`);
    const result = await runBook(bookId);
    if (result.ok) {
      checkpoint.completed = [...new Set([...(checkpoint.completed || []), bookId])];
      checkpoint.failed = (checkpoint.failed || []).filter((item) => item.bookId !== bookId);
    } else {
      checkpoint.failed = [...(checkpoint.failed || []).filter((item) => item.bookId !== bookId), { bookId, message: result.message, at: new Date().toISOString() }];
    }
    saveCheckpoint(checkpoint);
    // Do not churn through sources on a rate limit. Wait and retry this exact
    // book. Every child inventories Drive first, so a restart is create-only.
    if (!result.ok) {
      console.error(`Retrying ${bookId} after ${Math.round(retryDelayMs / 60000)} minutes: ${result.message}`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      index -= 1;
    }
  }
  console.log(`\nBatch finished. completed=${checkpoint.completed.length}, failed=${checkpoint.failed.length}`);
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
