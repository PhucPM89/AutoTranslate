"use strict";

const fs = require("fs");
const path = require("path");
const { createConvertEngine } = require("./convert-engine");
const { loadPhraseDict, loadHanvietChars } = require("./load-dictionaries");

const DEFAULT_HANVIET = path.join("data", "convert", "hanviet-chars.txt");
const DEFAULT_PHRASE_DIR = path.join("data", "convert", "phrases");

function splitList(value) {
  return String(value || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function defaultPhraseFiles() {
  if (!fs.existsSync(DEFAULT_PHRASE_DIR)) return [];
  return fs.readdirSync(DEFAULT_PHRASE_DIR)
    .filter((f) => f.endsWith(".txt") || f.endsWith(".txt.gz") || f.endsWith(".json"))
    .map((f) => path.join(DEFAULT_PHRASE_DIR, f));
}

// Build a convert engine from the on-disk dictionaries, honouring env overrides:
//   CONVERT_HANVIET   comma-separated single-char phonetic files
//   CONVERT_PHRASES   comma-separated phrase files (else everything in phrases/)
// Returns null when no single-char table is available, so callers can cleanly
// fall back to publishing raw source instead of empty convert.
function buildConvertEngineFromDisk(env = process.env) {
  const hanvietFiles = splitList(env.CONVERT_HANVIET || DEFAULT_HANVIET);
  const phraseFiles = splitList(env.CONVERT_PHRASES);
  const hanvietChars = loadHanvietChars(hanvietFiles);
  if (!Object.keys(hanvietChars).length) return null;
  const phraseDict = loadPhraseDict(phraseFiles.length ? phraseFiles : defaultPhraseFiles());
  return createConvertEngine({ phraseDict, hanvietChars });
}

// A memoised convert(text) -> string, or null when convert is unavailable or
// disabled (CONVERT_ENABLED=false). Building the trie is done once per process.
let cached;
function getConvertFunction(env = process.env) {
  if (cached !== undefined) return cached;
  if (env.CONVERT_ENABLED === "false") {
    cached = null;
    return cached;
  }
  try {
    const engine = buildConvertEngineFromDisk(env);
    cached = engine ? (text) => engine.convert(text) : null;
  } catch {
    cached = null;
  }
  return cached;
}

module.exports = { buildConvertEngineFromDisk, getConvertFunction, defaultPhraseFiles };
