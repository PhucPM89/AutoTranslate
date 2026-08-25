"use strict";

// Grammar layer — rewrites the token stream so Vietnamese word order survives.
//
// Character-and-phrase lookup gets terminology right and word order wrong,
// because Chinese puts modifiers before the head and Vietnamese puts them after.
// That single difference is most of what makes raw convert hard to read:
//
//   天玄宗的弟子们  "Thiên huyền tông các đệ tử"  -> "các đệ tử của Thiên Huyền tông"
//   那本古老的书籍  "quyển kia cổ xưa sách vở"    -> "quyển sách vở cổ xưa kia"
//   紫云殿内        "Tử Vân điện nội"             -> "trong Tử Vân điện"
//
// Four rules, applied in this order because each feeds the next:
//   1. de()            — 的 becomes "của"/"mà", or vanishes, per what precedes it
//   2. adjective()     — ADJ + NOUN -> NOUN + ADJ
//   3. demonstrative() — 这/那 moves to the end of its noun phrase
//   4. locative()      — 上/中/内 moves in front of the proper noun it trails
//
// Every rule is a no-op unless it positively recognises its pattern, so an
// unknown word is left in convert order rather than scrambled. That asymmetry is
// deliberate: a missed rewrite costs a clumsy phrase, a wrong one costs the
// sentence.

// How far a rewrite may reach. Beyond this the sentence is complex enough that
// reordering is more likely to damage it than help.
const MAX_MODIFIER = 3;
const MAX_HEAD = 3;

const WORD = "w";

// Characters that make a dictionary entry a predicate rather than a noun phrase.
// VietPhrase ships entries that swallowed one (父亲是 -> "phụ thân là"), and a
// noun-phrase walk must stop at them or it drags a whole clause into the rewrite.
const PREDICATE = /[是有不没在了着过]/;

// Prepositions. `VP 的 N` may only be turned around when the verb phrase is not
// governed by one: "从怀里掏出的丹药" has to keep convert order, because 从 stays
// behind and the sentence comes apart without it.
const PREPOSITIONS = new Set([
  "从", "自", "往", "向", "朝", "到", "对", "为", "给", "用", "以", "于",
  "按", "照", "随", "把", "被", "让", "使", "叫", "将", "跟着", "经过",
  "通过", "关于", "至于", "除了", "除", "连", "和", "与", "跟", "及", "在"
]);

// Passive markers. 被他打伤的人 is one relative clause, "người bị hắn đả thương",
// so the marker joins the clause instead of blocking the rewrite the way the
// other prepositions do.
const PASSIVE = new Set(["被", "让", "叫", "给"]);

// Modal negations that belong to the relative clause rather than to the main
// verb: 不可挽回的地步 is "tình trạng mà không thể vãn hồi". Only absorbed when the
// clause has no subject of its own — in 可以伤害我在乎的人 the 可以 governs the main
// verb 伤害, and pulling it in would produce "người mà có thể ta quan tâm".
const MODALS = new Set([
  "不可", "不能", "不会", "不敢", "不肯", "不愿", "不曾", "无法", "难以",
  "可以", "能够", "应该", "必须", "愿意", "敢于", "善于", "懒得"
]);

// Quantity adverbs that scope over the numeral they precede. The quantity branch
// of the 的 rule steps over them so 至少三十年的苦修 reads "khổ tu ít nhất ba mươi
// năm", not "ít nhất khổ tu ba mươi năm".
const QUANTITY_ADVERBS = new Set([
  "至少", "最少", "最多", "起码", "大约", "大概", "差不多", "将近", "足足",
  "整整", "足有", "约", "近", "超过", "不到", "只有", "仅有"
]);

// Pronouns, the one thing that reliably sits in front of a possessor: 他父亲的剑
// is "kiếm của phụ thân hắn". Nothing else may join a possessor walk.
const PRONOUNS = new Set([
  "我", "你", "您", "他", "她", "它", "咱", "俺", "谁",
  "我们", "你们", "他们", "她们", "它们", "咱们", "自己", "大家", "别人", "人家"
]);

// Totality quantifiers stay in front of their noun in Vietnamese too, so the
// postposing rule skips them — they are classed as adjectives only so the 的 rule
// reads them as part of the head noun phrase.
// A possessor that is itself a place or time expression takes no "của": 传说中的
// 神鸟 is "thần điểu trong truyền thuyết", 田里的稻子 is "cây lúa bên trong ruộng".
// The locative is already doing the linking work, and "của" on top of it reads as
// a double preposition.
const LOCATIVE_TAIL = /[中上内里下外前后间旁]$/;

const QUANTIFIERS = new Set([
  "全部", "所有", "整个", "一切", "全体", "所有的", "大部分", "少部分", "部分"
]);

function isWord(tok) {
  return tok && tok.t === WORD;
}

// A token that can be part of a noun phrase being rewritten.
function isNominal(tok) {
  if (!isWord(tok)) return false;
  if (tok.k !== "noun" && tok.k !== "name" && tok.k !== "num" && tok.k !== "adj" && tok.k !== "cl") {
    return false;
  }
  return !PREDICATE.test(tok.zh || "");
}

// A verb token, or a nominal that can be the subject inside a relative clause
// ("我在乎" -> "ta quan tâm").
function isClausal(tok) {
  return isWord(tok) && (tok.k === "verb" || isNominal(tok));
}

// The possessor left of 的: one nominal, extended leftwards only over pronouns
// and proper nouns, so 他父亲的剑 keeps "phụ thân hắn" together.
//
// The tight bound is deliberate. An unlisted two-character verb classifies as a
// noun, and a greedy walk then swallows it: 辜负您的期望 would come out as "kỳ
// vọng của phụ lòng ngài". A possessor is almost always one token anyway — the
// dictionary has already merged 上古时期 and 天玄宗 into one.
function possessorStart(tokens, i) {
  if (!isNominal(tokens[i - 1])) return i;
  let start = i - 1;
  while (start > 0 && i - start < MAX_MODIFIER && isPossessor(tokens[start - 1])) start--;
  return start;
}

function isPossessor(tok) {
  if (!isNominal(tok)) return false;
  return tok.k === "name" || PRONOUNS.has(tok.zh || "");
}

// The relative clause left of 的: a verb run, then at most one nominal subject.
// Stopping at the subject is what keeps the walk from swallowing the main verb —
// in "伤害我在乎的人" the clause is 我在乎 ("ta quan tâm"), not 伤害我在乎.
// Returns `i` when there is no verb, i.e. no clause to turn around.
function clauseStart(tokens, i) {
  let start = i;
  while (start > 0 && i - start < MAX_MODIFIER && isWord(tokens[start - 1]) && tokens[start - 1].k === "verb") {
    start--;
  }
  if (start === i) return i; // no verb, so no clause to turn around
  const verbRunStart = start;
  while (start > 0 && i - start < MAX_MODIFIER && isNominal(tokens[start - 1])) start--;
  const before = tokens[start - 1];
  if (isWord(before) && PASSIVE.has(before.zh || "")) start--;
  else if (start === verbRunStart && isWord(before) && MODALS.has(before.zh || "")) start--;
  return start;
}

// The head: an optional adjective run followed by one nominal. 的唯一遗物 ->
// ["duy nhất", "di vật"], so the adjective rule can postpose it afterwards.
// Returns the last index of the head, or -1 when what follows 的 is not a noun
// phrase at all (a verb, 是, a demonstrative) and no rewrite is possible.
function headEnd(tokens, i) {
  let end = i;
  while (end < tokens.length && end - i < MAX_HEAD - 1 && isWord(tokens[end]) && tokens[end].k === "adj") end++;
  if (!isNominal(tokens[end])) return -1;
  return end;
}

function link(text, kind) {
  return { t: WORD, s: text, k: kind, zh: "的" };
}

// Is the clause in [start, end) governed by a preposition? If so it cannot be
// turned around: 从怀里掏出的丹药 has to keep convert order, because 从 would stay
// behind and the sentence comes apart. The preposition may be a token of its own
// or the first character of one the dictionary merged (从怀里 -> "từ trong lòng
// ngực"). Verb tokens are skipped — 在乎 ("quan tâm") opens on 在 without being
// governed by it.
function isGoverned(tokens, start, end) {
  const before = tokens[start - 1];
  if (isWord(before) && !PASSIVE.has(before.zh || "") && PREPOSITIONS.has(before.zh || "")) return true;
  for (let j = start; j < end; j++) {
    const tok = tokens[j];
    if (!isWord(tok) || tok.k === "verb") continue;
    const zh = tok.zh || "";
    if (PASSIVE.has(zh)) continue; // part of the clause, not governing it
    if (PREPOSITIONS.has(zh.charAt(0))) return true;
  }
  return false;
}

// 的 — four readings, told apart by what sits immediately to its left.
//
//   NOUN 的 NOUN   possessive       -> "head của modifier"  (天玄宗的弟子们)
//   NUM  的 NOUN   quantity         -> "head modifier"      (三十年的苦修)
//   VERB 的 NOUN   relative clause  -> "head mà modifier"   (我在乎的人)
//   ADJ  的 NOUN   attributive      -> drop 的; rule 2 postposes the adjective
//
// Dropping is the fallback whenever the shape is not one of these: a dropped 的
// costs a shade of meaning, a wrongly-reordered one costs the sentence.
function de(tokens) {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    if (!isWord(tok) || tok.k !== "de") continue;

    const prev = tokens[i - 1];
    const kind = isWord(prev) ? prev.k : null;
    const end = headEnd(tokens, i + 1);

    if (end >= 0 && (kind === "noun" || kind === "name" || kind === "num")) {
      let start = possessorStart(tokens, i);
      // A quantity carries its adverb with it: "khổ tu ít nhất ba mươi năm".
      if (kind === "num" && isWord(tokens[start - 1]) && QUANTITY_ADVERBS.has(tokens[start - 1].zh || "")) {
        start--;
      }
      if (start < i) {
        const linked = kind !== "num" && !LOCATIVE_TAIL.test(prev.zh || "");
        const glue = linked ? [link("của", "fn")] : [];
        tokens.splice(start, end - start + 1, ...tokens.slice(i + 1, end + 1), ...glue, ...tokens.slice(start, i));
        continue;
      }
    }

    // Relative clause. Vietnamese is head-initial here too ("người mà ta quan
    // tâm"), but only reorder when the clause is self-contained: no preposition
    // governing it, and short enough to stay readable in front of the head.
    if (end >= 0 && kind === "verb") {
      const start = clauseStart(tokens, i);
      if (start < i && !isGoverned(tokens, start, i)) {
        // "mà" only earns its place when the clause has a subject: "người mà ta
        // quan tâm", but plain "người chết đi" for a bare verb.
        const glue = i - start > 1 ? [link("mà", "fn")] : [];
        tokens.splice(start, end - start + 1, ...tokens.slice(i + 1, end + 1), ...glue, ...tokens.slice(start, i));
        continue;
      }
    }

    tokens.splice(i, 1); // attributive, governed clause, or a shape we do not know
  }
  return tokens;
}

// ADJ + NOUN -> NOUN + ADJ. Only fires on curated attributive adjectives
// (data/convert/pos/adjectives.txt), because postposing an adverb across a verb
// is how this rule would break prose.
function adjective(tokens) {
  for (let i = 0; i < tokens.length - 1; i++) {
    const adj = tokens[i];
    const head = tokens[i + 1];
    if (!isWord(adj) || adj.k !== "adj") continue;
    if (QUANTIFIERS.has(adj.zh || "")) continue; // "toàn bộ nội tình", never "nội tình toàn bộ"'
    if (!isWord(head) || (head.k !== "noun" && head.k !== "name")) continue;
    if (PREDICATE.test(head.zh || "")) continue;
    tokens[i] = head;
    tokens[i + 1] = adj;
    i++; // the adjective is now settled; do not re-swap it
  }
  return tokens;
}

// 这/那 + [CLASSIFIER] + NOUN -> "CLASSIFIER NOUN này/kia". Vietnamese postposes
// the demonstrative, so "那枚玉佩" is "cái ngọc bội kia", never "kia cái ngọc bội".
function demonstrative(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const dem = tokens[i];
    if (!isWord(dem) || dem.k !== "dem") continue;
    let end = i;
    while (end + 1 < tokens.length && end - i < MAX_HEAD && isNominal(tokens[end + 1])) end++;
    if (end === i) continue; // nothing to move past
    tokens.splice(i, 1);
    tokens.splice(end, 0, dem);
    i = end;
  }
  return tokens;
}

// A locative trailing a proper noun or a quantity moves in front of it: 紫云殿内
// -> "trong Tử Vân điện", 三个时辰后 -> "sau ba canh giờ". Restricted to those two
// because that is where the phrase dictionary has no entry to do the job — for
// common nouns 山上 and 之中 are already in it. Skipped after a rewritten
// possessive, where the locative belongs to the head noun ("sơn môn của Thiên
// Huyền tông"), not to the name.
function locative(tokens) {
  for (let i = 1; i < tokens.length; i++) {
    const loc = tokens[i];
    if (!isWord(loc) || loc.k !== "loc") continue;
    const prev = tokens[i - 1];
    if (!isWord(prev) || (prev.k !== "name" && prev.k !== "num")) continue;
    const before = tokens[i - 2];
    if (isWord(before) && before.zh === "的") continue;
    if (loc.alt) loc.s = loc.alt; // it is a preposition now, not a bare syllable
    tokens.splice(i, 1);
    tokens.splice(i - 1, 0, loc);
  }
  return tokens;
}

function applyGrammar(tokens) {
  return locative(demonstrative(adjective(de(tokens))));
}

module.exports = { applyGrammar, de, adjective, demonstrative, locative, isNominal, isClausal };
