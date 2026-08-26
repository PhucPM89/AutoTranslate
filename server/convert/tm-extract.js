"use strict";

// Example-Based MT: learn fluent sentence and clause translations from the
// parallel corpus on R2 (chapters the LLM tier finished, source + Gemini translation).
//
// Extracts formulaic sentences and clauses that recur across novels and translates
// them identically to Gemini.

const HAN = /\p{Script=Han}/u;

// Arabic numbers.
const ARABIC_DIGITS = /[0-9０-９]/;

// Sentence-level and clause-level splitters.
const ZH_SENTENCE_SPLIT = /[。！？\n]+/;
const VI_SENTENCE_SPLIT = /[.!?\n]+/;

const ZH_CLAUSE_SPLIT = /[，。！？；：、]/;
const VI_CLAUSE_SPLIT = /[,.!?;:]/;

// Quote and bracket marks that cling to a clause edge.
const EDGE = /^[\s"'“”‘’「」『』（）()《》\-—…·]+|[\s"'“”‘’「」『』（）()《》\-—…·]+$/g;

function clean(text) {
  return String(text || "").replace(EDGE, "").trim();
}

function clauses(text, splitter) {
  return String(text || "")
    .split(splitter)
    .map(clean)
    .filter(Boolean);
}

// Pair paragraphs flexibly at both sentence level and clause level.
function pairParagraph(zhPara, viPara) {
  const pairs = [];
  
  // 1. Direct clause pairing if clause counts match
  const zc = clauses(zhPara, ZH_CLAUSE_SPLIT);
  const vc = clauses(viPara, VI_CLAUSE_SPLIT);
  if (zc.length > 0 && zc.length === vc.length) {
    for (let i = 0; i < zc.length; i++) {
      pairs.push([zc[i], vc[i]]);
    }
    return pairs;
  }

  // 2. Sentence-level pairing: for each matching sentence, check if sub-clauses match
  const zs = clauses(zhPara, ZH_SENTENCE_SPLIT);
  const vs = clauses(viPara, VI_SENTENCE_SPLIT);
  if (zs.length > 0 && zs.length === vs.length) {
    for (let i = 0; i < zs.length; i++) {
      const zSubC = clauses(zs[i], ZH_CLAUSE_SPLIT);
      const vSubC = clauses(vs[i], VI_CLAUSE_SPLIT);
      if (zSubC.length > 0 && zSubC.length === vSubC.length) {
        for (let j = 0; j < zSubC.length; j++) {
          pairs.push([zSubC[j], vSubC[j]]);
        }
      } else if (zSubC.length <= 1 && vSubC.length <= 1) {
        pairs.push([zs[i], vs[i]]);
      }
    }
    return pairs;
  }

  return [];
}

// 4-character numeric idioms that are safe to learn
const NUMERIC_IDIOMS = new Set([
  "一言不发", "一动不动", "一跃而起", "一击必杀", "一剑封喉", "一败涂地", "一步登天",
  "一落千丈", "一意孤行", "一触即发", "一表人才", "一箭双雕", "一臂之力", "一丝不苟",
  "一日千里", "一清二楚", "一往无前", "万无一失", "万籁俱寂", "万死不辞", "万念俱灰",
  "万众瞩目", "三番五次", "三足鼎立", "三思而行", "千钧一发", "千变万化", "千真万确",
  "千方百计", "千言万语", "千军万马", "千载难逢", "千篇一律", "九死一生", "百发百中",
  "百炼成钢", "百思不解", "百战百胜", "十全十美", "十拿九稳", "四分五裂", "五湖四海",
  "七上八下", "七零八落", "八方支援", "九牛一毛"
]);

// Is this Chinese clause generic enough to reuse across books?
function isGenericClause(zh) {
  const len = Array.from(zh).length;
  if (len < 3 || len > 28) return false;
  if (ARABIC_DIGITS.test(zh)) return false;
  if (/[A-Za-z]/.test(zh)) return false;

  // If it contains Chinese numeral, only allow verified 4-character idioms
  if (/[0-9０-９一二三四五六七八九十百千万亿零两]/.test(zh)) {
    if (len !== 4 || !NUMERIC_IDIOMS.has(zh)) return false;
  }

  // Mostly Han
  const han = Array.from(zh).filter((c) => HAN.test(c)).length;
  return han >= Math.max(3, len - 1);
}

// Accumulate clause pairs across chapters, then keep the ones frequent, agreed
// and seen in MORE THAN ONE BOOK.
function buildTM(chapters, { minCount = 3, minAgreement = 0.55, minBooks = 2 } = {}) {
  const votes = new Map(); // zh -> Map(vi -> count)
  const books = new Map(); // zh -> Set(bookId)

  for (const { book, paras } of chapters) {
    for (const [zhPara, viPara] of paras) {
      for (const [zh, vi] of pairParagraph(zhPara, viPara)) {
        if (!isGenericClause(zh)) continue;
        if (!vi || Array.from(vi).length > Array.from(zh).length * 4 + 15) continue;
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
    if (total >= minCount && bestN / total >= minAgreement) {
      tm[zh] = lowerFirst(best);
    }
  }
  return tm;
}

function lowerFirst(text) {
  const m = /\p{L}/u.exec(text);
  if (!m) return text;
  const i = m.index;
  return text.slice(0, i) + text.charAt(i).toLowerCase() + text.slice(i + 1);
}

module.exports = {
  pairParagraph,
  isGenericClause,
  buildTM,
  lowerFirst,
  clauses
};
