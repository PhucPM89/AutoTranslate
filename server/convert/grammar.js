"use strict";

// Comprehensive 12-Rule Grammar Layer — rewrites the token stream into natural
// Vietnamese word order and structures.
//
// Solves the key structural differences between Chinese and Vietnamese:
//   1. de()                      — 的 relative clauses and possessive inversion
//   2. adjective()               — Attributive ADJ + NOUN -> NOUN + ADJ
//   3. demonstrative()           — 这/那 + [CL] + NOUN -> [CL] + NOUN + này/kia
//   4. locative()                — 上/中/内/下 -> preposition before noun phrase
//   5. pairedConjunctions()      — 不仅...而且..., 哪怕...也..., 与其...不如...
//   6. comparison()              — A 比 B + Adj (+ Multiplier) -> A [Adj] hơn B (+ Multiplier)
//   7. disposalBa()              — 把/将 + Object + Verb -> Verb + Object (SVO natural flow)
//   8. passiveBei()              — 被/让/叫 + Agent + Verb -> bị/được Agent + Verb
//   9. directionalComplements()  — Verb + 起来/下去/出来/过去/过来 -> Verb + lên/tiếp/ra/qua/lại
//  10. potentialComplements()    — Verb + 得/不 + Complement -> Verb được / không nổi
//  11. modalAdverbs()            — 偏偏/倒/难不成/究竟 -> lại cứ / ngược lại / chẳng lẽ / rốt cuộc
//  12. temporalAspect()          — 正在/刚/已经 + Verb + 了/着/过

const MAX_MODIFIER = 4;
const MAX_HEAD = 4;

const WORD = "w";

// Characters that make a dictionary entry a predicate rather than a noun phrase.
const PREDICATE = /[是有不没在了着过]/;

// Prepositions that block relative clause reordering when governing the VP.
const PREPOSITIONS = new Set([
  "从", "自", "往", "向", "朝", "到", "对", "为", "给", "用", "以", "于",
  "按", "照", "随", "把", "被", "让", "使", "叫", "将", "跟着", "经过",
  "通过", "关于", "至于", "除了", "除", "连", "和", "与", "跟", "及", "在"
]);

// Passive markers.
const PASSIVE = new Set(["被", "让", "叫", "给"]);

// Modal negations and helpers.
const MODALS = new Set([
  "不可", "不能", "不会", "不敢", "不肯", "不愿", "不曾", "无法", "难以",
  "可以", "能够", "应该", "必须", "愿意", "敢于", "善于", "懒得"
]);

// Quantity adverbs.
const QUANTITY_ADVERBS = new Set([
  "至少", "最少", "最多", "起码", "大约", "大概", "差不多", "将近", "足足",
  "整整", "足有", "约", "近", "超过", "不到", "只有", "仅有"
]);

// Pronouns.
const PRONOUNS = new Set([
  "我", "你", "您", "他", "她", "它", "咱", "俺", "谁",
  "我们", "你们", "他们", "她们", "它们", "咱们", "自己", "大家", "别人", "人家"
]);

const LOCATIVE_TAIL = /[中上内里下外前后间旁]$/;

const QUANTIFIERS = new Set([
  "全部", "所有", "整个", "一切", "全体", "所有的", "大部分", "少部分", "部分"
]);

function isWord(tok) {
  return tok && tok.t === WORD;
}

function isNominal(tok) {
  if (!isWord(tok)) return false;
  if (tok.k !== "noun" && tok.k !== "name" && tok.k !== "num" && tok.k !== "adj" && tok.k !== "cl") {
    return false;
  }
  return !PREDICATE.test(tok.zh || "");
}

function isClausal(tok) {
  return isWord(tok) && (tok.k === "verb" || isNominal(tok));
}

function isPossessor(tok) {
  if (!isNominal(tok)) return false;
  return tok.k === "name" || PRONOUNS.has(tok.zh || "");
}

function possessorStart(tokens, i) {
  if (!isNominal(tokens[i - 1])) return i;
  let start = i - 1;
  while (start > 0 && i - start < MAX_MODIFIER && isPossessor(tokens[start - 1])) start--;
  return start;
}

function clauseStart(tokens, i) {
  let start = i;
  while (start > 0 && i - start < MAX_MODIFIER && isWord(tokens[start - 1]) && tokens[start - 1].k === "verb") {
    start--;
  }
  if (start === i) return i;
  const verbRunStart = start;
  while (start > 0 && i - start < MAX_MODIFIER && isNominal(tokens[start - 1])) start--;
  const before = tokens[start - 1];
  if (isWord(before) && PASSIVE.has(before.zh || "")) start--;
  else if (start === verbRunStart && isWord(before) && MODALS.has(before.zh || "")) start--;
  return start;
}

function headEnd(tokens, i) {
  if (i >= tokens.length || !isWord(tokens[i])) return -1;
  // If immediate token is a nominal head or action verb, it is the head
  if (isNominal(tokens[i]) || tokens[i].k === "verb") {
    return i;
  }
  let end = i;
  while (end < tokens.length && end - i < MAX_HEAD - 1 && isWord(tokens[end]) && tokens[end].k === "adj") end++;
  if (end < tokens.length && (isNominal(tokens[end]) || tokens[end].k === "verb")) return end;
  return -1;
}

function link(text, kind = "fn") {
  return { t: WORD, s: text, k: kind, zh: "的" };
}

function isGoverned(tokens, start, end) {
  const before = tokens[start - 1];
  if (isWord(before) && !PASSIVE.has(before.zh || "") && PREPOSITIONS.has(before.zh || "")) return true;
  for (let j = start; j < end; j++) {
    const tok = tokens[j];
    if (!isWord(tok) || tok.k === "verb") continue;
    const zh = tok.zh || "";
    if (PASSIVE.has(zh)) continue;
    if (PREPOSITIONS.has(zh.charAt(0))) return true;
  }
  return false;
}

// 1. 的 — possessives, relative clauses, quantities, attributives.
function de(tokens) {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    if (!isWord(tok) || tok.k !== "de") continue;

    const prev = tokens[i - 1];
    const kind = isWord(prev) ? prev.k : null;
    const end = headEnd(tokens, i + 1);

    if (end >= 0 && (kind === "noun" || kind === "name" || kind === "num")) {
      // Check if this noun is actually the object of an initial verb (Relative Clause: VP + 的 + Head)
      let verbBeforeIdx = -1;
      for (let k = i - 2; k >= 0 && i - k <= MAX_MODIFIER; k--) {
        if (tokens[k] && tokens[k].k === "verb") {
          verbBeforeIdx = k;
          break;
        }
      }

      const hasPrecedingSubject = verbBeforeIdx > 0 && isNominal(tokens[verbBeforeIdx - 1]);
      const isRelativeVP = verbBeforeIdx >= 0 && !hasPrecedingSubject && !isPossessor(prev) && !isGoverned(tokens, verbBeforeIdx, i);

      if (isRelativeVP) {
        const headTokens = tokens.slice(i + 1, end + 1);
        const vpTokens = tokens.slice(verbBeforeIdx, i);
        // Relative Clause: [Head] + [VP] (e.g. "sách vở ghi lại bí mật")
        tokens.splice(verbBeforeIdx, end - verbBeforeIdx + 1, ...headTokens, ...vpTokens);
        continue;
      }

      let start = possessorStart(tokens, i);
      if (kind === "num" && isWord(tokens[start - 1]) && QUANTITY_ADVERBS.has(tokens[start - 1].zh || "")) {
        start--;
      }
      if (start < i) {
        const headTokens = tokens.slice(i + 1, end + 1);
        const isPurposeHead = headTokens.some(h => /(?:thời cơ|cơ hội|phương pháp|cách|lý do|nguyên nhân)/i.test(h.s || ""));
        const linked = kind !== "num" && !LOCATIVE_TAIL.test(prev.zh || "");
        const glue = isPurposeHead ? [link("để", "fn")] : (linked ? [link("của", "fn")] : []);
        tokens.splice(start, end - start + 1, ...headTokens, ...glue, ...tokens.slice(start, i));
        continue;
      }
    }

    if (end >= 0 && kind === "adj") {
      let start = i - 1;
      while (start > 0 && i - start < MAX_MODIFIER && isWord(tokens[start - 1]) && (tokens[start - 1].k === "adj" || tokens[start - 1].k === "adv")) {
        start--;
      }
      const adjTokens = tokens.slice(start, i);
      const headTokens = tokens.slice(i + 1, end + 1);
      for (const a of adjTokens) a._postposed = true;
      for (const h of headTokens) h._postposed = true;
      // Reorder [Adj, 的, Head] to [Head, Adj] without 'của'
      tokens.splice(start, end - start + 1, ...headTokens, ...adjTokens);
      continue;
    }

    if (end >= 0 && kind === "verb") {
      const start = clauseStart(tokens, i);
      if (start < i && !isGoverned(tokens, start, i)) {
        const headTokens = tokens.slice(i + 1, end + 1);
        const isPurposeHead = headTokens.some(h => /(?:thời cơ|cơ hội|phương pháp|cách)/i.test(h.s || ""));
        const glue = isPurposeHead ? [link("để", "fn")] : (i - start > 1 ? [link("mà", "fn")] : []);
        tokens.splice(start, end - start + 1, ...headTokens, ...glue, ...tokens.slice(start, i));
        continue;
      }
    }

    tokens.splice(i, 1);
  }
  return tokens;
}

// 2. ADJ + NOUN -> NOUN + ADJ.
function adjective(tokens) {
  for (let i = 0; i < tokens.length - 1; i++) {
    const adj = tokens[i];
    const head = tokens[i + 1];
    if (!isWord(adj) || adj.k !== "adj" || adj._postposed) continue;
    if (!isWord(head) || head._postposed) continue;
    if (QUANTIFIERS.has(adj.zh || "")) continue;
    if (head.k !== "noun" && head.k !== "name") continue;
    if (PREDICATE.test(head.zh || "")) continue;
    tokens[i] = head;
    tokens[i + 1] = adj;
    i++;
  }
  return tokens;
}

// 3. 这/那 + [CLASSIFIER] + NOUN -> [CLASSIFIER] + NOUN + này/kia.
function demonstrative(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const dem = tokens[i];
    if (!isWord(dem) || dem.k !== "dem") continue;
    let end = i;
    while (end + 1 < tokens.length && end - i < MAX_HEAD && isNominal(tokens[end + 1])) end++;
    if (end === i) continue;
    tokens.splice(i, 1);
    tokens.splice(end, 0, dem);
    i = end;
  }
  return tokens;
}

// 4. Locative preposition fronting: 紫云殿内 -> "trong Tử Vân điện".
function locative(tokens) {
  for (let i = 1; i < tokens.length; i++) {
    const loc = tokens[i];
    if (!isWord(loc) || loc.k !== "loc") continue;
    const prev = tokens[i - 1];
    if (!isWord(prev) || (prev.k !== "name" && prev.k !== "num")) continue;
    const before = tokens[i - 2];
    if (isWord(before) && before.zh === "的") continue;
    if (loc.alt) loc.s = loc.alt;
    tokens.splice(i, 1);
    tokens.splice(i - 1, 0, loc);
  }
  return tokens;
}

// 5. Paired Conjunctions normalization:
//    不仅...而且..., 哪怕...也..., 与其...不如..., 宁可...也不...
function pairedConjunctions(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!isWord(tok)) continue;
    const zh = tok.zh || "";
    if (zh === "不仅" || zh === "不但") {
      tok.s = "không những";
    } else if (zh === "而且") {
      tok.s = "mà còn";
    } else if (zh === "哪怕" || zh === "就算") {
      tok.s = "cho dù";
    } else if (zh === "与其") {
      tok.s = "thay vì";
    } else if (zh === "不如") {
      tok.s = "không bằng";
    } else if (zh === "宁可") {
      tok.s = "thà rằng";
    }
  }
  return tokens;
}

// 6. Comparison Structure: A 比 B + [Adj] (+ Multiplier) -> A [Adj] hơn B (+ Multiplier)
function comparison(tokens) {
  for (let i = 0; i < tokens.length - 2; i++) {
    const tok = tokens[i];
    if (!isWord(tok) || tok.zh !== "比") continue;
    // Look for target B (nouns, names, pronouns, but not adjectives)
    let targetEnd = i + 1;
    while (targetEnd < tokens.length && targetEnd - i < MAX_HEAD && isWord(tokens[targetEnd]) && (tokens[targetEnd].k === "noun" || tokens[targetEnd].k === "name" || tokens[targetEnd].k === "num" || tokens[targetEnd].k === "cl")) {
      targetEnd++;
    }
    if (targetEnd === i + 1) continue;
    // Check if followed by an adjective / adverb
    const predIdx = targetEnd;
    if (predIdx < tokens.length && isWord(tokens[predIdx]) && (tokens[predIdx].k === "adj" || tokens[predIdx].k === "verb")) {
      const pred = tokens[predIdx];
      pred.s = `${pred.s} hơn`;
      const targetTokens = tokens.slice(i + 1, targetEnd);
      // Replace [比, ...targetTokens, pred] with [pred, ...targetTokens]
      tokens.splice(i, targetEnd - i + 1, pred, ...targetTokens);
    }
  }
  return tokens;
}

// 7. Disposal 把/将 Structure: 把/将 + [Noun] + [Verb Phrase] -> [Verb Phrase] + [Noun]
function disposalBa(tokens) {
  for (let i = 0; i < tokens.length - 2; i++) {
    const tok = tokens[i];
    if (!isWord(tok) || (tok.zh !== "把" && tok.zh !== "将")) continue;

    // Scan for the main transitive verb following 把/将 within MAX_HEAD tokens
    let verbIdx = -1;
    for (let j = i + 1; j < tokens.length && j - i <= MAX_HEAD; j++) {
      if (!isWord(tokens[j]) || tokens[j].k === "punct") break;
      if (tokens[j].k === "verb" && j > i + 1) {
        verbIdx = j;
        break;
      }
    }

    if (verbIdx > i + 1) {
      const verb = tokens[verbIdx];
      const objTokens = tokens.slice(i + 1, verbIdx);
      if (tok.zh === "将") {
        tok.s = "đem";
        tok.k = "fn";
      } else {
        // Replace "把 + Obj + Verb" with "Verb + Obj"
        tokens.splice(i, verbIdx - i + 1, verb, ...objTokens);
      }
    }
  }
  return tokens;
}

// 8. Passive 被 Structure: 被 + [Agent] + [Verb] -> bị/được + [Agent] + [Verb]
function passiveBei(tokens) {
  for (let i = 0; i < tokens.length - 1; i++) {
    const tok = tokens[i];
    if (!isWord(tok) || tok.zh !== "被") continue;
    tok.s = "bị";
  }
  return tokens;
}

// 9. Directional Complements: V + 起来/下去/出来/过去/过来
function directionalComplements(tokens) {
  for (let i = 0; i < tokens.length - 1; i++) {
    const v = tokens[i];
    const comp = tokens[i + 1];
    if (!isWord(v) || v.k !== "verb" || !isWord(comp)) continue;
    if (comp.zh === "起来") {
      comp.s = "lên";
    } else if (comp.zh === "下去") {
      comp.s = "tiếp";
    } else if (comp.zh === "出来") {
      comp.s = "ra";
    } else if (comp.zh === "过去") {
      comp.s = "qua";
    } else if (comp.zh === "过来") {
      comp.s = "lại";
    }
  }
  return tokens;
}

// 10. Potential & Degree Complements: V + 得/不 + C
function potentialComplements(tokens) {
  for (let i = 0; i < tokens.length - 2; i++) {
    const v = tokens[i];
    const pt = tokens[i + 1];
    const c = tokens[i + 2];
    if (!isWord(v) || (v.k !== "verb" && v.k !== "adj") || !isWord(pt) || !isWord(c)) continue;
    if (pt.zh === "得") {
      if (c.zh === "见" || c.zh === "懂" || c.zh === "到" || c.zh === "下" || c.zh === "清") {
        pt.s = "được";
      } else {
        pt.s = "đến mức";
      }
    } else if (pt.zh === "不" && (c.k === "adj" || c.k === "verb")) {
      pt.s = "không";
    }
  }
  return tokens;
}

// 11. Modal & Emphatic Adverbs
function modalAdverbs(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!isWord(tok)) continue;
    const zh = tok.zh || "";
    if (zh === "偏偏") {
      tok.s = "lại cứ";
    } else if (zh === "究竟" || zh === "到底") {
      tok.s = "rốt cuộc";
    } else if (zh === "难不成") {
      tok.s = "chẳng lẽ";
    }
  }
  return tokens;
}

// 12. Temporal Aspect alignment
function temporalAspect(tokens) {
  for (let i = 0; i < tokens.length - 1; i++) {
    const adv = tokens[i];
    const v = tokens[i + 1];
    if (!isWord(adv) || !isWord(v)) continue;
    if ((adv.zh === "正在" || adv.zh === "正") && v.k === "verb") {
      adv.s = "đang";
    } else if ((adv.zh === "刚才" || adv.zh === "刚") && v.k === "verb") {
      adv.s = "vừa";
    }
  }
  return tokens;
}

// Full 12-Rule Pipeline execution in optimal linguistic order:
function applyGrammar(tokens) {
  tokens = pairedConjunctions(tokens);
  tokens = modalAdverbs(tokens);
  tokens = temporalAspect(tokens);
  tokens = directionalComplements(tokens);
  tokens = potentialComplements(tokens);
  tokens = passiveBei(tokens);
  tokens = disposalBa(tokens);
  tokens = comparison(tokens);
  tokens = de(tokens);
  tokens = adjective(tokens);
  tokens = demonstrative(tokens);
  tokens = locative(tokens);
  return tokens;
}

module.exports = {
  applyGrammar,
  de,
  adjective,
  demonstrative,
  locative,
  pairedConjunctions,
  comparison,
  disposalBa,
  passiveBei,
  directionalComplements,
  potentialComplements,
  modalAdverbs,
  temporalAspect,
  isNominal,
  isClausal
};
