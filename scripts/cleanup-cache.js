"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const rawDir = path.join(ROOT, ".cache/raw-chinese-acmong");
const directDir = path.join(ROOT, ".cache/direct-chapters-acmong");
const batchDir = path.join(ROOT, ".cache/batch-pending");
const corpseDir = path.join(ROOT, ".cache/prompt-eval-corpse");
const qaDir = path.join(ROOT, ".cache/qa-results");

let rawDeleted = 0;
if (fs.existsSync(rawDir)) {
  for (const file of fs.readdirSync(rawDir)) {
    fs.unlinkSync(path.join(rawDir, file));
    rawDeleted++;
  }
}

let directDeleted = 0;
if (fs.existsSync(directDir)) {
  for (const file of fs.readdirSync(directDir)) {
    fs.unlinkSync(path.join(directDir, file));
    directDeleted++;
  }
}

let batchDeleted = 0;
if (fs.existsSync(batchDir)) {
  for (const file of fs.readdirSync(batchDir)) {
    fs.unlinkSync(path.join(batchDir, file));
    batchDeleted++;
  }
}

let corpseDeleted = 0;
if (fs.existsSync(corpseDir)) {
  for (const file of fs.readdirSync(corpseDir)) {
    fs.unlinkSync(path.join(corpseDir, file));
    corpseDeleted++;
  }
}

let qaDeleted = 0;
if (fs.existsSync(qaDir)) {
  for (const file of fs.readdirSync(qaDir)) {
    fs.rmSync(path.join(qaDir, file), { recursive: true, force: true });
    qaDeleted++;
  }
}

console.log(`Cache cleaned:
- Deleted ${rawDeleted} raw Chinese JSON files
- Deleted ${directDeleted} translated text files
- Cleared ${batchDeleted} files from batch-pending
- Cleared ${corpseDeleted} files from prompt-eval-corpse
- Cleared ${qaDeleted} files from qa-results`);
