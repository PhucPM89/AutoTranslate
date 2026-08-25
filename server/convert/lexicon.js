"use strict";

// The linguistic tables the grammar and proper-noun layers run on.
//
// convert-engine.js knows *how* to rewrite a token stream; this module knows
// *which* words are adjectives, verbs, classifiers, surnames and place suffixes.
// Keeping the knowledge in data/convert/{pos,names}/ means a wrong reading is a
// one-line data fix, not a code change — the same trade the dictionaries make.

const fs = require("fs");
const path = require("path");
const { parseTxt, readText } = require("./load-dictionaries");

const POS_DIR = path.join("data", "convert", "pos");
const NAMES_DIR = path.join("data", "convert", "names");

// A `zh=vi` table -> plain object. Missing file is not an error: every rule
// degrades to "don't fire" when its table is absent, so a partial checkout
// still converts.
function readMap(file) {
  if (!fs.existsSync(file)) return {};
  return parseTxt(readText(file));
}

// A one-term-per-line list -> Set. Comments and blanks are ignored, matching the
// `key=value` files so both formats read the same way.
function readSet(file) {
  if (!fs.existsSync(file)) return new Set();
  const out = new Set();
  for (const raw of readText(file).split(/\r?\n/)) {
    const line = raw.replace(/^﻿/, "").trim();
    if (!line || line.startsWith("#")) continue;
    out.add(line);
  }
  return out;
}

function loadLexicon(dirs = {}) {
  const pos = dirs.pos || POS_DIR;
  const names = dirs.names || NAMES_DIR;
  return {
    adjectives: readSet(path.join(pos, "adjectives.txt")),
    verbs: readSet(path.join(pos, "verbs.txt")),
    functionWords: readSet(path.join(pos, "function-words.txt")),
    classifiers: readMap(path.join(pos, "classifiers.txt")),
    deWords: readSet(path.join(pos, "de-words.txt")),
    surnames: readMap(path.join(names, "surnames.txt")),
    placeSuffixes: readMap(path.join(names, "place-suffixes.txt"))
  };
}

// Sino-Vietnamese readings are lowercase in the dictionaries; a proper noun is
// Title Case per syllable ("diệp thần" -> "Diệp Thần").
function titleCase(text) {
  return String(text)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase("vi") + w.slice(1))
    .join(" ");
}

module.exports = { loadLexicon, titleCase, readMap, readSet, POS_DIR, NAMES_DIR };
