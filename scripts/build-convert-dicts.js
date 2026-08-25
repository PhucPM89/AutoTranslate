"use strict";

// Normalise raw community dictionary files into the committed convert data set.
//
//   node scripts/build-convert-dicts.js --src <dir>
//
// Expects in <dir> (any encoding — UTF-16LE/UTF-8/BOM handled):
//   VietPhrase.txt            key=value, values may list options with "/"
//   ChinesePhienAmWords.txt   single-char Sino-Vietnamese phonetic table
//
// Emits:
//   data/convert/hanviet-chars.txt        single-char phonetic fallback (UTF-8)
//   data/convert/phrases/vietphrase.txt.gz multi-char phrases, first option (gzip)
//
// Multi-char VietPhrase entries are meaning-oriented and drive readable prose;
// single VietPhrase chars are dropped so the phonetic table (which reads names
// correctly, 叶 -> "diệp" not "lá") is the single-char authority.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function flag(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function decode(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString("utf16le").replace(/^﻿/, "");
  if (buf[0] === 0xfe && buf[1] === 0xff) return buf.swap16().toString("utf16le").replace(/^﻿/, "");
  return buf.toString("utf8").replace(/^﻿/, "");
}

function readEntries(file) {
  const text = decode(fs.readFileSync(file));
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i);
    const value = line.slice(i + 1).split("/")[0].trim(); // first option is the default
    if (key && value) entries.push([key, value]);
  }
  return entries;
}

function main() {
  const src = flag("--src", ".");
  const vpFile = path.join(src, "VietPhrase.txt");
  const cpawFile = path.join(src, "ChinesePhienAmWords.txt");
  if (!fs.existsSync(vpFile) || !fs.existsSync(cpawFile)) {
    console.error(`Cần ${vpFile} và ${cpawFile}. Truyền --src <thư mục chứa 2 file>.`);
    process.exit(1);
  }

  // Single-char phonetic table.
  const hv = [];
  for (const [k, v] of readEntries(cpawFile)) {
    if (Array.from(k).length === 1) hv.push(`${k}=${v}`);
  }
  const hvOut = path.join("data", "convert", "hanviet-chars.txt");
  fs.mkdirSync(path.dirname(hvOut), { recursive: true });
  fs.writeFileSync(hvOut, hv.join("\n") + "\n", "utf8");

  // Multi-char phrase table, gzipped.
  const phrases = [];
  for (const [k, v] of readEntries(vpFile)) {
    if (Array.from(k).length >= 2) phrases.push(`${k}=${v}`);
  }
  const phrasesDir = path.join("data", "convert", "phrases");
  fs.mkdirSync(phrasesDir, { recursive: true });
  const gz = zlib.gzipSync(Buffer.from(phrases.join("\n"), "utf8"), { level: 9 });
  const phrasesOut = path.join(phrasesDir, "vietphrase.txt.gz");
  fs.writeFileSync(phrasesOut, gz);

  console.log(`Đã ghi ${hvOut}          (${hv.length} ký tự phiên âm)`);
  console.log(`Đã ghi ${phrasesOut}  (${phrases.length} cụm, ${(gz.length / 1e6).toFixed(1)} MB gzip)`);
}

main();
