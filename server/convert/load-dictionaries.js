"use strict";

// Load convert dictionaries from disk into the shapes convert-engine expects.
//
// Two file formats are accepted so you can drop in community data packs
// (QuickTranslator / VietPhrase) without reformatting:
//
//   *.txt   — one entry per line, `key=value` (the community convention).
//             Lines starting with # and blank lines are ignored. A key with an
//             empty value is skipped. Later lines override earlier ones.
//   *.json  — either { "key": "value", ... }
//             or the bootstrap char table { "chars": { "中": { "hv": "trung" } } }
//
// Precedence for the single-char Hán-Việt table: a curated file always overrides
// the Unihan bootstrap, so you can ship the bootstrap as a floor and correct it.

const fs = require("fs");
const zlib = require("zlib");

// Read a dictionary file as UTF-8 text, transparently gunzipping `.gz` and
// decoding a UTF-16LE BOM (community data packs ship UTF-16). Large phrase
// tables are committed gzipped, so this is the one place that knows the wire
// format.
function readText(file) {
  let buf = fs.readFileSync(file);
  if (file.endsWith(".gz")) buf = zlib.gunzipSync(buf);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString("utf16le").replace(/^﻿/, "");
  return buf.toString("utf8").replace(/^﻿/, "");
}

function parseTxt(text) {
  const map = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^﻿/, ""); // strip BOM on first line
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!key || !value) continue;
    map[key] = value;
  }
  return map;
}

// Read a phrase dictionary ({ zh: vi }). Accepts .txt (key=value) or flat .json.
function loadPhraseDict(paths = []) {
  const dict = {};
  for (const p of [].concat(paths).filter(Boolean)) {
    if (!fs.existsSync(p)) continue;
    const text = readText(p);
    const parsed = p.endsWith(".json") ? JSON.parse(text) : parseTxt(text);
    Object.assign(dict, parsed);
  }
  return dict;
}

// Read the single-char Hán-Việt table into { char: { hv, source } }.
// Accepts the bootstrap JSON ({ chars: {...} }), a flat JSON ({ char: "hv" }),
// or a .txt (char=hv). Curated files listed later override earlier ones.
function loadHanvietChars(paths = []) {
  const chars = {};
  for (const p of [].concat(paths).filter(Boolean)) {
    if (!fs.existsSync(p)) continue;
    const text = readText(p);
    if (p.endsWith(".json")) {
      const parsed = JSON.parse(text);
      const table = parsed.chars || parsed;
      for (const [ch, val] of Object.entries(table)) {
        chars[ch] = typeof val === "string" ? { hv: val, source: "curated" } : val;
      }
    } else {
      for (const [ch, hv] of Object.entries(parseTxt(text))) {
        chars[ch] = { hv, source: "curated" };
      }
    }
  }
  return chars;
}

module.exports = { loadPhraseDict, loadHanvietChars, parseTxt, readText };
