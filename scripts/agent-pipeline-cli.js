"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
for (const name of [".env", ".env.local"]) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

const { AgentTranslationPipeline } = require("../server/agent-pipeline/pipeline");
const { StoryStateManager } = require("../server/agent-pipeline/story-state");
const { CheckpointManager } = require("../server/agent-pipeline/checkpoint-manager");
const { CacheManager } = require("../server/agent-pipeline/cache-manager");
const { R2IOManager } = require("../server/agent-pipeline/r2-io");

async function main() {
  const args = process.argv.slice(2);
  let bookId = "fanqie-7027679289931729920";
  let chapterNumber = null;
  let statusOnly = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--book" && args[i + 1]) {
      bookId = args[i + 1];
      i++;
    } else if (args[i] === "--chapter" && args[i + 1]) {
      chapterNumber = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--status") {
      statusOnly = true;
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    }
  }

  const checkpointMgr = new CheckpointManager();
  const cacheMgr = new CacheManager();
  const storyStateMgr = new StoryStateManager();
  const r2IO = new R2IOManager();

  if (statusOnly) {
    console.log(`=== PIPELINE STATUS FOR BOOK: ${bookId} ===`);
    const state = storyStateMgr.loadState(bookId);
    console.log(`Story State Version: ${state.version}`);
    console.log(`Characters: ${(state.characters || []).length}`);
    console.log(`Terminology: ${(state.terminology || []).length}`);
    console.log(`Cache Stats:`, cacheMgr.getStats());
    console.log(`R2 I/O:`, r2IO.getMetrics());
    return;
  }

  console.log(`Agent Translation Pipeline initialized.`);
  console.log(`Book: ${bookId}, Chapter: ${chapterNumber || "queue mode"}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error("CLI error:", err);
    process.exit(1);
  });
}

module.exports = { main };

