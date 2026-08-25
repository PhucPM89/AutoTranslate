"use strict";

// Side-by-side convert evaluation over a sample corpus.
//
//   node scripts/convert-eval.js                      # default corpus
//   node scripts/convert-eval.js --in my-samples.txt
//   node scripts/convert-eval.js --diff baseline.txt  # show only changed lines
//
// The corpus is one Chinese sentence per line (blank lines and # comments
// ignored). Output is `zh` then `vi` so a human can judge fluency at a glance —
// convert quality is not something an assertion can score, so the workflow is:
// snapshot the output, change the engine, diff the two.

const fs = require("fs");
const path = require("path");
const { buildConvertEngineFromDisk } = require("../server/convert");

const DEFAULT_CORPUS = path.join("data", "convert", "samples", "samples.txt");

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function readLines(file) {
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

function main() {
  const corpus = flag("--in", DEFAULT_CORPUS);
  const baseline = flag("--diff", null);
  const plain = process.argv.includes("--plain");

  const engine = buildConvertEngineFromDisk();
  if (!engine) {
    console.error("Không có bảng Hán-Việt. Chạy scripts/build-convert-dicts.js.");
    process.exit(1);
  }

  const lines = readLines(corpus);
  const out = lines.map((zh) => engine.convert(zh));

  if (plain) {
    process.stdout.write(out.join("\n") + "\n");
    return;
  }

  const before = baseline ? fs.readFileSync(baseline, "utf8").split(/\r?\n/) : null;
  let changed = 0;
  lines.forEach((zh, i) => {
    if (before && before[i] === out[i]) return;
    changed++;
    console.log(`${String(i + 1).padStart(3)}. ${zh}`);
    if (before) console.log(`   -  ${before[i] || ""}`);
    console.log(`   ${before ? "+ " : "→ "} ${out[i]}`);
    console.log("");
  });
  console.error(before ? `${changed}/${lines.length} dòng thay đổi` : `${lines.length} dòng`);
}

main();
