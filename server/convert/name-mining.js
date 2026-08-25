"use strict";

// Statistical name mining — the Consistency Engine's first half.
//
// The per-chapter proper-noun matcher is precise but blind in two ways: a name
// only three characters long is rejected when the dictionary holds a spurious
// two-character prefix (郑海 = "trịnh hải" shadows 郑海冰), and a name whose
// surname the table lacks never registers at all. Both are fixed the same way a
// human editor fixes them — by reading the whole book first. A character name
// recurs; a chance collocation does not. So this scans every chapter, counts the
// surname-initial sequences, and keeps the ones frequent enough to be a person.
//
// Output is a { zh -> "Tên Hán Việt" } glossary. Fed back into convert as
// top-priority phrases, it makes every mention of a character read identically,
// across the whole novel, regardless of what the dictionary would have done.

const HAN = /\p{Script=Han}/u;

// Surname characters that are overwhelmingly ordinary words, so mining from them
// yields noise (能 "có thể", 常 "thường", 高 "cao", 祖 "tổ", 家 "gia"…). A real
// person with one of these surnames is rare enough to lose for the sake of not
// promoting 高考 or 习惯 to a name.
const AMBIGUOUS_SURNAMES = new Set([
  "能", "常", "习", "去", "会", "同", "成", "长", "对", "祖", "家", "关", "向", "古", "师"
]);

// Kinship and honorific characters that trail a surname as an address, not a
// given name: 张家 "nhà họ Trương", 张叔 "chú Trương", 李哥 "anh Lý".
const RELATIONAL_TAIL = new Set([
  "家", "叔", "哥", "姐", "妹", "弟", "爷", "婆", "妈", "爸", "氏", "老", "小",
  "总", "帝", "王", "君", "公", "母", "父", "儿", "女", "嫂", "伯", "姨", "舅"
]);

// Build a name glossary from a book's chapter texts.
//   texts     array of Chinese chapter strings (a sample is enough — the cast
//             shows up early and often)
//   matcher   the proper-noun matcher (for high-confidence detections)
//   surnames  { zh -> reading } incl. compound (复姓) keys
//   hanviet   { zh -> { hv } } single-char phonetic table
//   isName    (ch) -> may this character sit inside a given name
//   titleCase (s) -> Title Case a reading
//   minCount  how many times a sequence must recur to count as a name
function mineNames(texts, {
  matcher, surnames = {}, hanviet = {}, isName, titleCase, minCount = 4,
  phraseDict = {}, rejectGiven = new Set()
} = {}) {
  const counts = new Map(); // zh sequence -> frequency
  const rightNeighbors = new Map(); // zh -> Set of characters seen right after it
  const surnameLens = [...new Set(Object.keys(surnames).map((s) => s.length))].sort((a, b) => b - a);

  const bump = (zh, after) => {
    counts.set(zh, (counts.get(zh) || 0) + 1);
    // Branching diversity: a person is followed by many different words (说, 的,
    // 走…), a fixed compound like 高铁 almost always by the same few (站, 线). The
    // count of distinct right-neighbours separates the two without a model.
    if (after) {
      let set = rightNeighbors.get(zh);
      if (!set) rightNeighbors.set(zh, (set = new Set()));
      set.add(after);
    }
  };

  // A given character that is really a pronoun, particle, function word or verb
  // (顺他, 看见), or a relational/common tail (张家, 张叔), is grammar the scan ran
  // into, not part of a name.
  const goodGiven = (c) => isName(c) && hanviet[c] && !rejectGiven.has(c) && !RELATIONAL_TAIL.has(c);

  const isWord = (seq) => Object.prototype.hasOwnProperty.call(phraseDict, seq);

  // Split a candidate into surname + given and decide whether it is a plausible
  // person name. Used by BOTH the matcher and the surname scan so a name the
  // matcher likes but the given half is a word (张惨白 = 张 + 惨白 "trắng bệch")
  // is rejected the same way. Returns the { surname, given } split or null.
  function personSplit(zh) {
    const chars = Array.from(zh);
    if (chars.length < 2 || chars.length > 3) return null;
    if (isWord(zh)) return null; // the whole span is a dictionary word (东西)
    for (const slen of surnameLens) {
      if (slen >= chars.length) continue;
      const surname = chars.slice(0, slen).join("");
      if (!surnames[surname]) continue;
      if (slen === 1 && AMBIGUOUS_SURNAMES.has(surname)) return null;
      const given = chars.slice(slen);
      if (!given.every(goodGiven)) return null;
      // Note: the given half is NOT rejected for being a dictionary word — that
      // truncated real names whose given half is a common bigram (灵峰). Fixed
      // compounds are filtered later by branching diversity instead.
      return { surname, given };
    }
    return null;
  }

  for (const text of texts) {
    const chars = Array.from(text || "");
    for (let i = 0; i < chars.length; i++) {
      if (!HAN.test(chars[i])) continue;

      // High-confidence: whatever the matcher recognises here, subject to the
      // same person test so a word it would read as a name is not mined.
      const m = matcher && matcher.match(chars, i);
      if (m && m.kind === "name") {
        const span = chars.slice(i, i + m.length).join("");
        if (personSplit(span)) bump(span, chars[i + m.length]);
        continue; // don't also count a shorter surname-scan of the same span
      }

      // Surname scan: take the LONGEST valid name at this position, never its
      // prefix, or a 3-char name (张灵峰) leaks its 2-char head (张灵) into a
      // separate, truncated entry.
      for (const slen of surnameLens) {
        const surname = chars.slice(i, i + slen).join("");
        if (surname.length !== slen || !surnames[surname]) continue;
        if (slen === 1 && AMBIGUOUS_SURNAMES.has(surname)) break;
        let best = null;
        for (const glen of [2, 1]) {
          const seq = chars.slice(i, i + slen + glen).join("");
          if (Array.from(seq).length === slen + glen && personSplit(seq)) { best = { seq, end: i + slen + glen }; break; }
        }
        if (best) bump(best.seq, chars[best.end]);
        break; // one surname length per position
      }
    }
  }

  // Resolve overlaps and threshold. A three-character name and its two-character
  // prefix both get counted; keep the longer when it clears the bar, since that
  // is the whole point (郑海冰 over 郑海).
  const kept = new Map();
  const ordered = [...counts.entries()].sort((a, b) => b[0].length - a[0].length);
  const covered = new Set();
  for (const [zh, n] of ordered) {
    if (n < minCount) continue;
    // A person is followed by a variety of words. A fixed compound (高铁 -> 站/线)
    // is not, so require the distinct right-neighbours to be at least a quarter
    // of the occurrences and no fewer than three.
    const variety = (rightNeighbors.get(zh) || new Set()).size;
    if (variety < Math.max(3, n / 4)) continue;
    // Skip a prefix already claimed by a longer, frequent-enough name.
    if ([...covered].some((longer) => longer.startsWith(zh) && counts.get(longer) >= minCount)) continue;
    kept.set(zh, n);
    covered.add(zh);
  }

  // Render each kept sequence to its Hán-Việt name.
  const glossary = {};
  for (const zh of kept.keys()) {
    const chars = Array.from(zh);
    let slen = surnameLens.find((L) => surnames[chars.slice(0, L).join("")]);
    const surname = chars.slice(0, slen).join("");
    const given = chars.slice(slen);
    const vi = [surnames[surname], ...given.map((c) => titleCase((hanviet[c] && hanviet[c].hv) || c))].join(" ");
    glossary[zh] = vi;
  }
  return glossary;
}

module.exports = { mineNames };
