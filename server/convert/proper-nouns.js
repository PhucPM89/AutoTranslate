"use strict";

// Proper-noun matcher — competes with the phrase dictionary at each position.
//
// The phrase dictionary is meaning-oriented, which is exactly wrong for a name:
// it renders 苏落雪 as "Tô tuyết rơi" (Tô + "falling snow") and 青云城 as "mây
// xanh thành" ("blue cloud" + city). Readers need the phonetic reading, in Title
// Case, and they need it identical in every one of a thousand chapters.
//
// Two patterns, both deliberately conservative — the phrase dictionary wins
// every tie, so a name only fires where the dictionary has nothing longer:
//
//   person: SURNAME + 1–2 given characters      叶辰 -> "Diệp Thần"
//   place:  2 name characters + suffix          青云城 -> "Thanh Vân thành"
//
// The guards below are what keep 白衣胜雪 from becoming a person and 世界上 from
// becoming a place. See data/convert/samples/negatives.txt for the regression
// corpus that pins them down.

const { titleCase } = require("./lexicon");

const NUMERIC = /[0-9一二三四五六七八九十百千万亿零两半几]/;

// Structural particles and demonstratives. A name may never contain one: without
// this guard 林动的 reads as a three-character person ("Lâm Động Của") and 的那场
// as a place, because the matcher has no idea it crossed a word boundary.
const PARTICLES = new Set(["的", "地", "得", "了", "着", "过", "们", "之", "者", "所", "这", "那", "些", "每", "各"]);

function createProperNounMatcher({
  surnames = {},
  placeSuffixes = {},
  classifiers = {},
  functionWords = new Set(),
  verbs = new Set(),
  adjectives = new Set(),
  hanvietChars = {},
  phraseDict = {},
  dropTokens = new Set(),
  longestPhraseAt = () => null,
  isHan
} = {}) {
  // A character that can appear inside a name: it must be Han, have a phonetic
  // reading, and not be doing grammatical work elsewhere. Numbers are excluded
  // because "一路"/"三天" are far more common than a name containing a numeral.
  function isNameChar(ch) {
    if (!ch || !isHan(ch)) return false;
    if (!hanvietChars[ch]) return false;
    if (PARTICLES.has(ch)) return false;
    if (functionWords.has(ch) || dropTokens.has(ch)) return false;
    if (classifiers[ch]) return false;
    if (NUMERIC.test(ch)) return false;
    return true;
  }

  // A given name ends on a name character, never on a word doing other work.
  // 林动看着 is 林动 ("Lâm Động") followed by the verb 看, not "Lâm Động Nhìn";
  // interior characters are unconstrained so 苏落雪 keeps 落 ("Lạc").
  function isNameTail(ch) {
    return isNameChar(ch) && !verbs.has(ch) && !adjectives.has(ch);
  }

  function reading(ch) {
    const entry = hanvietChars[ch];
    return entry ? entry.hv : ch;
  }

  // Does a dictionary word start at `at` and run past it? If so, a name ending on
  // that character is slicing a real word in half.
  function cutsIntoWord(chars, at) {
    const phrase = longestPhraseAt(chars, at);
    return !!phrase && phrase.length > 1;
  }

  // SURNAME + given name. Longer surnames (复姓 like 欧阳) and longer given names
  // are tried first so 欧阳锋 beats 欧 + 阳锋.
  function matchPerson(chars, i) {
    for (const slen of [2, 1]) {
      const surname = chars.slice(i, i + slen).join("");
      if (surname.length !== slen) break;
      const surnameVi = surnames[surname];
      if (!surnameVi) continue;
      for (const glen of [2, 1]) {
        const given = chars.slice(i + slen, i + slen + glen);
        if (given.length !== glen) continue;
        if (!given.every(isNameChar)) continue;
        if (!isNameTail(given[glen - 1])) continue;
        // Guard: a two-character given name must not be built on a real word.
        // 白衣胜雪 -> 白衣 ("áo trắng") is a phrase, so 白衣胜 is not a person.
        if (glen === 2 && phraseDict[surname + given[0]]) continue;
        // Guard: nor may it cut into the word that follows. 叶辰缓缓 is 叶辰 next
        // to 缓缓 ("chậm rãi"); without this the name eats the first 缓 and the
        // sentence reads "Diệp Thần Hoãn hoãn".
        if (glen === 2 && cutsIntoWord(chars, i + slen + glen - 1)) continue;
        const vi = [surnameVi, ...given.map((c) => titleCase(reading(c)))].join(" ");
        return { vi, length: slen + glen, kind: "name" };
      }
    }
    return null;
  }

  // 2 name characters + a place/organisation suffix. The name goes Title Case,
  // the suffix stays a lowercase common noun: "Thanh Vân thành".
  function matchPlace(chars, i) {
    const a = chars[i];
    const b = chars[i + 1];
    const suffix = chars[i + 2];
    if (!a || !b || !suffix) return null;
    const suffixVi = placeSuffixes[suffix];
    if (!suffixVi) return null;
    if (!isNameChar(a) || !isNameChar(b)) return null;
    // Guard: if the second character is itself a suffix the run is a common
    // noun, not a name — 世界上, 家族, 庭院, 敲门声, 三大门派.
    if (placeSuffixes[b]) return null;
    // Guard: the dictionary already knows the whole thing (少林寺, 昆仑山).
    if (phraseDict[a + b + suffix]) return null;
    const vi = `${titleCase(reading(a))} ${titleCase(reading(b))} ${suffixVi}`;
    return { vi, length: 3, kind: "name" };
  }

  // Longest wins, place before person on a tie (青云城 is a city, not 青 + 云城).
  function match(chars, i) {
    const place = matchPlace(chars, i);
    const person = matchPerson(chars, i);
    if (place && person) return place.length >= person.length ? place : person;
    return place || person;
  }

  return { match, matchPerson, matchPlace, isNameChar };
}

module.exports = { createProperNounMatcher };
