"use strict";

const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      let val = match[2].trim();
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
      process.env[match[1]] = val;
    }
  }
}

loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { createStorage } = require("../server/storage");
const { chapterKey, originalKey } = require("../server/ingest/documents");
const { jobStateKey } = require("../server/ingest/translation-queue");
const { createTranslationEngine } = require("../server/translation-engine");

const args = process.argv.slice(2);
const flag = (name, fallback = "") => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const BOOK_ID = flag("--book", process.env.REPAIR_BOOK_ID || "");
const COMMIT = args.includes("--commit");
const CONCURRENCY = Math.max(1, Number(flag("--concurrency", process.env.REPAIR_CONCURRENCY || 24)));

const RARE_NAME_FIXES = [
  {
    zh: "蔡邧",
    vi: "Thái Nguyên",
    brokenVi: "Thái",
    context: /(?:liên lạc với|phía|tin tức từ phía|cuối cùng|cảm ơn|bên kia|lời này của|cúp điện thoại của|nói với|hỏi|đáp|gọi điện|điện thoại|hắn ta|anh ta|cậu|bạn này của cậu)\s+Thái(?!\s+Nguyên)|(?<!họ\s)Thái(?=\s*(?:"|'|,|:|;|\.|\?|!))/giu
  }
];

function usage() {
  console.log("Usage: node scripts/repair-rare-name-loss.js --book <bookId> [--commit]");
}

async function readJson(storage, key) {
  const raw = await storage.get(key).catch(() => null);
  if (!raw) return null;
  return JSON.parse(raw.toString("utf8"));
}

function patchContent(content, fix) {
  let replacements = 0;
  const patched = String(content || "").replace(fix.context, (match) => {
    replacements += 1;
    return match.replace(new RegExp(`${fix.brokenVi}(?!\\s+Nguyên)`, "u"), fix.vi);
  });
  return { patched, replacements };
}

async function repairGlossary(storage, engine, bookId) {
  const glossary = await engine.loadGlossary(bookId);
  let changed = false;
  for (const fix of RARE_NAME_FIXES) {
    if (glossary[fix.zh] !== fix.vi) {
      glossary[fix.zh] = fix.vi;
      changed = true;
    }
  }
  if (changed && COMMIT) await engine.saveGlossary(bookId, glossary);
  return changed;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  if (!BOOK_ID) {
    usage();
    process.exitCode = 1;
    return;
  }

  const storage = createStorage();
  const engine = createTranslationEngine({ storage });
  const state = await readJson(storage, jobStateKey(BOOK_ID));
  if (!state || !Array.isArray(state.chapters)) throw new Error(`Không tìm thấy queue cho ${BOOK_ID}.`);

  const glossaryChanged = await repairGlossary(storage, engine, BOOK_ID);
  const repairs = await mapWithConcurrency(state.chapters, CONCURRENCY, async (entry) => {
    const source = await readJson(storage, originalKey(BOOK_ID, state.revision, entry.n));
    if (!source || !RARE_NAME_FIXES.some((fix) => String(source.content || "").includes(fix.zh))) return null;

    const published = await readJson(storage, chapterKey(BOOK_ID, state.revision, entry.n));
    if (!published || published.translationStatus !== "completed" || !published.content) return null;

    let nextContent = published.content;
    let replacements = 0;
    for (const fix of RARE_NAME_FIXES) {
      if (!String(source.content || "").includes(fix.zh)) continue;
      const result = patchContent(nextContent, fix);
      nextContent = result.patched;
      replacements += result.replacements;
    }

    if (replacements > 0 && nextContent !== published.content) {
      if (COMMIT) {
        published.content = nextContent;
        published.characters = nextContent.length;
        published.updatedAt = new Date().toISOString();
        published.qualityPatch = {
          type: "rare-name-loss",
          appliedAt: published.updatedAt,
          replacements
        };
        await storage.put(chapterKey(BOOK_ID, state.revision, entry.n), JSON.stringify(published));
      }
      return { chapter: entry.n, replacements };
    }
    return null;
  });
  const touched = repairs.filter(Boolean).sort((a, b) => a.chapter - b.chapter);

  console.log(JSON.stringify({
    mode: COMMIT ? "commit" : "dry-run",
    bookId: BOOK_ID,
    concurrency: CONCURRENCY,
    glossaryChanged,
    touched,
    touchedChapters: touched.length,
    replacements: touched.reduce((sum, item) => sum + item.replacements, 0)
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
