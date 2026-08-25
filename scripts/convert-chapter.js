"use strict";

// Convert Chinese text to a Vietnamese convert, offline, zero-cost.
//
//   echo "修仙之路" | node scripts/convert-chapter.js
//   node scripts/convert-chapter.js --in chapter.txt --out chapter.vi.txt
//
// Dictionaries resolve exactly as they do at ingest (see server/convert):
//   CONVERT_HANVIET   comma-separated single-char phonetic files
//                     (default: data/convert/hanviet-chars.txt)
//   CONVERT_PHRASES   comma-separated phrase files
//                     (default: everything in data/convert/phrases/)

const fs = require("fs");
const { buildConvertEngineFromDisk } = require("../server/convert");

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

async function readInput(inPath) {
  if (inPath) return fs.readFileSync(inPath, "utf8");
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (buf += d));
    process.stdin.on("end", () => resolve(buf));
  });
}

async function main() {
  const inPath = flag("--in", null);
  const outPath = flag("--out", null);

  const engine = buildConvertEngineFromDisk();
  if (!engine) {
    console.error("Không có bảng Hán-Việt. Chạy scripts/build-convert-dicts.js hoặc set CONVERT_HANVIET.");
    process.exit(1);
  }

  const input = await readInput(inPath);
  const output = engine.convert(input);

  if (outPath) {
    fs.writeFileSync(outPath, output);
    console.error(`Đã ghi ${outPath}`);
  } else {
    process.stdout.write(output + "\n");
  }
}

main();
