"use strict";

const fs = require("fs");
const path = require("path");
const { createConvertEngine, buildTrie, matchPhrase, isHan } = require("./convert-engine");
const { createProperNounMatcher } = require("./proper-nouns");
const { loadPhraseDict, loadHanvietChars } = require("./load-dictionaries");
const { loadLexicon, readSet, titleCase } = require("./lexicon");
const { mineNames } = require("./name-mining");

// Bump when the convert engine or its data changes enough that already-converted
// chapters should be re-rendered. The backfill re-converts any "convert" chapter
// stamped with an older version, so a full re-pass resumes across runs instead of
// restarting from the top. 1 = pre-grammar; 2 = normalization + grammar layers;
// 3 = name mining; 4 = name-locked segmentation; 5 = natural verb readings + reduplicated/complement constructions.
const CONVERT_VERSION = 5;

const DEFAULT_HANVIET = path.join("data", "convert", "hanviet-chars.txt");
const DEFAULT_PHRASE_DIR = path.join("data", "convert", "phrases");
// Normalization overrides load LAST so they win over the base dictionaries.
const OVERRIDE_CHARS = path.join("data", "convert", "overrides-chars.txt");
const OVERRIDE_PHRASES = path.join("data", "convert", "overrides-phrases.txt");
const PHRASE_BLOCKLIST = path.join("data", "convert", "phrase-blocklist.txt");

// Pronouns never sit inside a mined given name (顺他), so they seed the reject set
// together with the function-word and verb tables.
const PRONOUNS = ["他", "她", "它", "我", "你", "您", "咱", "俺", "们", "谁", "这", "那"];

function splitList(value) {
  return String(value || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function defaultPhraseFiles() {
  if (!fs.existsSync(DEFAULT_PHRASE_DIR)) return [];
  return fs.readdirSync(DEFAULT_PHRASE_DIR)
    .filter((f) => f.endsWith(".txt") || f.endsWith(".txt.gz") || f.endsWith(".json"))
    .map((f) => path.join(DEFAULT_PHRASE_DIR, f));
}

// Load the base tables once. Reused by every engine build and by name mining, so
// the 667k-entry phrase dictionary is parsed a single time per process.
let base;
function loadBase(env = process.env) {
  if (base) return base;
  const hanvietFiles = [...splitList(env.CONVERT_HANVIET || DEFAULT_HANVIET), OVERRIDE_CHARS];
  const hanvietChars = loadHanvietChars(hanvietFiles);
  if (!Object.keys(hanvietChars).length) return (base = null);
  const phraseFiles = env.CONVERT_PHRASES ? splitList(env.CONVERT_PHRASES) : defaultPhraseFiles();
  const phraseDict = loadPhraseDict([...phraseFiles, OVERRIDE_PHRASES]);
  for (const zh of readSet(PHRASE_BLOCKLIST)) delete phraseDict[zh];
  const lexicon = loadLexicon();
  base = { hanvietChars, phraseDict, lexicon };
  return base;
}

// Build a convert engine. `nameGlossary` (from mineBookNames) is merged in front
// of the phrase dictionary so a book's characters read identically everywhere,
// overriding the junk bigrams that shadow them (郑海 vs 郑海冰). Returns null when
// no single-char table is available, so callers can fall back to raw source.
function buildConvertEngineFromDisk(env = process.env, { nameGlossary = null } = {}) {
  const b = loadBase(env);
  if (!b) return null;
  // The engine merges the glossary into its phrase dictionary AND locks
  // segmentation around the names, so pass it through rather than pre-merging.
  return createConvertEngine({
    phraseDict: b.phraseDict, hanvietChars: b.hanvietChars, lexicon: b.lexicon, nameGlossary
  });
}

// Mine a per-book name glossary { zh -> "Tên Hán Việt" } from a sample of the
// book's chapter texts. Statistical, model-free: a character recurs in varied
// contexts, a chance collocation does not. See name-mining.js.
function mineBookNames(texts, env = process.env, { minCount = 6 } = {}) {
  const b = loadBase(env);
  if (!b) return {};
  const trie = buildTrie(b.phraseDict);
  const { surnames, placeSuffixes, classifiers, functionWords, verbs, adjectives } = b.lexicon;
  const matcher = createProperNounMatcher({
    surnames, placeSuffixes, classifiers, functionWords, verbs, adjectives,
    hanvietChars: b.hanvietChars, phraseDict: b.phraseDict, dropTokens: new Set(),
    longestPhraseAt: (chars, at) => matchPhrase(trie, chars, at), isHan
  });
  const rejectGiven = new Set([...PRONOUNS, ...functionWords, ...verbs]);
  return mineNames(texts, {
    matcher, surnames, hanviet: b.hanvietChars, isName: matcher.isNameChar,
    titleCase, minCount, phraseDict: b.phraseDict, rejectGiven
  });
}

// A memoised convert(text) -> string, or null when convert is unavailable or
// disabled. This is the plain, name-agnostic path (ingest of a single new
// chapter); the backfill builds its own per-book engine via mineBookNames.
let cached;
function getConvertFunction(env = process.env) {
  if (cached !== undefined) return cached;
  if (env.CONVERT_ENABLED === "false") return (cached = null);
  try {
    const engine = buildConvertEngineFromDisk(env);
    cached = engine ? (text) => engine.convert(text) : null;
  } catch {
    cached = null;
  }
  return cached;
}

module.exports = {
  buildConvertEngineFromDisk, getConvertFunction, mineBookNames,
  defaultPhraseFiles, CONVERT_VERSION
};
