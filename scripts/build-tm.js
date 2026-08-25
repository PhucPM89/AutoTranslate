"use strict";

// Build the Example-Based translation memory from the parallel corpus on R2 (the
// chapters the LLM tier finished, source + Gemini translation, paragraph
// aligned). Emits data/convert/tm.txt.gz — formulaic clauses with their fluent
// Vietnamese, merged into convert as high-priority phrases. See tm-extract.js.
//
//   node scripts/build-tm.js                 # all completed chapters
//   node scripts/build-tm.js --per-book 40   # cap chapters read per book
//   node scripts/build-tm.js --min-books 3   # stricter cross-book threshold

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}
loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.local"));

const { createStorage } = require("../server/storage");
const { originalKey, chapterKey } = require("../server/ingest/documents");
const { buildTM } = require("../server/convert/tm-extract");

function flagValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

async function readJson(storage, key) {
  const buffer = await storage.get(key);
  if (!buffer) return null;
  try { return JSON.parse(buffer.toString("utf8")); } catch { return null; }
}

async function pool(items, worker, concurrency = 16) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) || 1 }, async () => {
    while (i < items.length) await worker(items[i++]);
  }));
}

async function main() {
  const perBook = Number(flagValue("--per-book", 0)) || Infinity;
  const minBooks = Number(flagValue("--min-books", 2));
  const minCount = Number(flagValue("--min-count", 4));
  const out = flagValue("--out", path.join("data", "convert", "tm.txt.gz"));

  const storage = createStorage();
  const jobs = (await storage.list("jobs/")).filter((o) => o.key.endsWith("/translation.json"));
  const chapters = [];
  let chapCount = 0;

  for (const o of jobs) {
    const st = await readJson(storage, o.key);
    if (!st || !Array.isArray(st.chapters)) continue;
    const done = st.chapters.filter((c) => c.status === "completed").slice(0, perBook);
    if (!done.length) continue;
    const bookId = st.bookId;
    const rev = st.revision || 1;
    await pool(done, async (c) => {
      const zh = await readJson(storage, originalKey(bookId, rev, c.n));
      const vi = await readJson(storage, chapterKey(bookId, rev, c.n));
      if (!zh || !vi || vi.translationStatus !== "completed") return;
      const zp = String(zh.content || "").split(/\n/).filter((x) => x.trim());
      const vp = String(vi.content || "").split(/\n/).filter((x) => x.trim());
      const paras = [];
      const n = Math.min(zp.length, vp.length);
      for (let i = 0; i < n; i++) paras.push([zp[i], vp[i]]);
      chapters.push({ book: bookId, paras });
      chapCount++;
    });
    if (chapCount && chapCount % 500 === 0) console.log(`  ...đọc ${chapCount} chương`);
  }

  const tm = buildTM(chapters, { minCount, minBooks });
  const lines = Object.entries(tm).map(([zh, vi]) => `${zh}=${vi}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, zlib.gzipSync(Buffer.from(lines.join("\n"), "utf8"), { level: 9 }));
  console.log(`Đã đọc ${chapCount} chương completed → ${lines.length} mệnh đề công thức → ${out}`);
}

main().catch((err) => { console.error("Lỗi build-tm:", err.message); process.exit(1); });
