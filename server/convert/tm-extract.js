"use strict";

// Example-Based MT: learn fluent clause translations from the parallel corpus we
// already have — the chapters the LLM tier finished, each holding the Chinese
// source and its Gemini translation, paragraph-aligned. Web-novel prose is
// heavily formulaic ("他冷哼一声", "心中暗道", "不知过了多久" recur across every
// book), so a clause that appears often, translated the same way most of the
// time, is a safe, fluent phrase to reuse. Convert fills the rest.
//
// The alignment is done at the CLAUSE level (split on punctuation), which is
// robust without word alignment: when a paragraph's Chinese and Vietnamese split
// into the same number of clauses, they pair up in order. Paragraphs where the
// counts disagree (the LLM merged or reordered) are skipped, not guessed.

const HAN = /\p{Script=Han}/u;
// Arabic and Chinese numerals. A clause with a count (三十年后, 第一次) varies too
// much to be a stable, reusable formula, so it is left to convert.
const DIGIT = /[0-9０-９一二三四五六七八九十百千万亿零两]/;
// Sentence/clause punctuation on each side. The Vietnamese has been through the
// LLM, so it uses Western marks; the Chinese source is full-width.
const ZH_SPLIT = /[，。！？；：、]/;
const VI_SPLIT = /[,.!?;:]/;

// Quote and bracket marks that cling to a clause edge but are not part of it.
const EDGE = /^[\s"'“”‘’「」『』（）()《》\-—…·]+|[\s"'“”‘’「」『』（）()《》\-—…·]+$/g;

function clauses(text, splitter) {
  return String(text || "")
    .split(splitter)
    .map((c) => c.replace(EDGE, "").trim())
    .filter(Boolean);
}

// Clause pairs from one paragraph, or [] when the split counts disagree.
function pairParagraph(zhPara, viPara) {
  const zc = clauses(zhPara, ZH_SPLIT);
  const vc = clauses(viPara, VI_SPLIT);
  if (zc.length === 0 || zc.length !== vc.length) return [];
  return zc.map((zh, i) => [zh, vc[i]]);
}

// Is this Chinese clause generic enough to reuse across books? Formulaic prose
// only: no digits (dates, counts, cultivation levels differ), no Latin, and a
// sane length — long clauses are plot-specific and short ones are noise.
function isGenericClause(zh) {
  const len = Array.from(zh).length;
  if (len < 3 || len > 22) return false;
  if (DIGIT.test(zh)) return false;
  if (/[A-Za-z]/.test(zh)) return false;
  // Mostly Han — a clause that is half punctuation/symbols is not prose.
  const han = Array.from(zh).filter((c) => HAN.test(c)).length;
  return han >= Math.max(3, len - 1);
}

// Accumulate clause pairs across chapters, then keep the ones frequent, agreed
// and — crucially — seen in MORE THAN ONE BOOK. Cross-book recurrence is what
// separates a formulaic clause (时间一分一秒的过去, everywhere) from a
// book-specific one that merely repeats inside its own novel (秦禹皱了皱眉头 —
// a character's name, useless and unsafe elsewhere). Returns { zh -> vi }.
//
//   chapters: [{ book, paras: [[zhParagraph, viParagraph], ...] }, ...]
function buildTM(chapters, { minCount = 3, minAgreement = 0.6, minBooks = 2 } = {}) {
  const votes = new Map(); // zh -> Map(vi -> count)
  const books = new Map(); // zh -> Set(bookId)
  for (const { book, paras } of chapters) {
    for (const [zhPara, viPara] of paras) {
      for (const [zh, vi] of pairParagraph(zhPara, viPara)) {
        if (!isGenericClause(zh)) continue;
        if (!vi || Array.from(vi).length > Array.from(zh).length * 4 + 10) continue;
        let m = votes.get(zh);
        if (!m) votes.set(zh, (m = new Map()));
        m.set(vi, (m.get(vi) || 0) + 1);
        let bs = books.get(zh);
        if (!bs) books.set(zh, (bs = new Set()));
        bs.add(book);
      }
    }
  }

  const tm = {};
  for (const [zh, m] of votes) {
    if ((books.get(zh) || new Set()).size < minBooks) continue;
    let total = 0, best = null, bestN = 0;
    for (const [vi, n] of m) {
      total += n;
      if (n > bestN) { bestN = n; best = vi; }
    }
    // Lower-case the first letter: Gemini capitalised these because they were
    // usually sentence-initial, but a clause lands mid-sentence too. The convert
    // engine re-capitalises real sentence starts, so a caseless value is correct
    // in both places (and keeps the proper-noun invariant honest).
    if (total >= minCount && bestN / total >= minAgreement) tm[zh] = lowerFirst(best);
  }
  return tm;
}

function lowerFirst(text) {
  const m = /\p{L}/u.exec(text);
  if (!m) return text;
  const i = m.index;
  return text.slice(0, i) + text[i].toLocaleLowerCase("vi") + text.slice(i + 1);
}

module.exports = { pairParagraph, isGenericClause, buildTM, clauses };
