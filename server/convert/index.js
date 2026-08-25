"use strict";

const fs = require("fs");
const path = require("path");
const { createConvertEngine } = require("./convert-engine");
const { loadPhraseDict, loadHanvietChars } = require("./load-dictionaries");
const { loadLexicon, readSet } = require("./lexicon");

// Bump when the convert engine or its data changes enough that already-converted
// chapters should be re-rendered. The backfill re-converts any "convert" chapter
// stamped with an older version, so a full re-pass resumes across runs instead of
// restarting from the top. 1 = pre-grammar; 2 = normalization + grammar layers.
const CONVERT_VERSION = 2;

const DEFAULT_HANVIET = path.join("data", "convert", "hanviet-chars.txt");
const DEFAULT_PHRASE_DIR = path.join("data", "convert", "phrases");
// Normalization overrides load LAST so they win over the base dictionaries:
// pronouns/particles that otherwise leak as dead phonetics, and connectors
// VietPhrase renders awkwardly. See data/convert/overrides-*.txt.
const OVERRIDE_CHARS = path.join("data", "convert", "overrides-chars.txt");
const OVERRIDE_PHRASES = path.join("data", "convert", "overrides-phrases.txt");
// Entries removed from the phrase dict entirely — fragments that swallow a clause
// boundary and cannot be fixed by overriding their value.
const PHRASE_BLOCKLIST = path.join("data", "convert", "phrase-blocklist.txt");

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
  // Base tables first, normalization overrides last (later files win).
  const hanvietFiles = [...splitList(env.CONVERT_HANVIET || DEFAULT_HANVIET), OVERRIDE_CHARS];
  const hanvietChars = loadHanvietChars(hanvietFiles);
  if (!Object.keys(hanvietChars).length) return null;
  const phraseFiles = env.CONVERT_PHRASES ? splitList(env.CONVERT_PHRASES) : defaultPhraseFiles();
  const phraseDict = loadPhraseDict([...phraseFiles, OVERRIDE_PHRASES]);
  for (const zh of readSet(PHRASE_BLOCKLIST)) delete phraseDict[zh];
  // Word-class tables for the grammar and proper-noun layers. Absent tables mean
  // the rules that need them go quiet — no proper nouns, no postposed adjectives
  // or demonstratives — leaving the 的 rewrite, which needs no word list.
  const lexicon = loadLexicon();
  return createConvertEngine({ phraseDict, hanvietChars, lexicon });
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

module.exports = { buildConvertEngineFromDisk, getConvertFunction, defaultPhraseFiles, CONVERT_VERSION };
