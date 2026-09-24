"use strict";

const { signature } = require('./alignment-signatures');
const { BILINGUAL_LEXICON } = require('./alignment-lexicon');
const ROUND = n => Math.round(n * 1000) / 1000;
const extractNumbers = text => String(text || '').match(/\d+(?:\.\d+)?/g) || [];
const clauses = text => String(text || '').split(/[。！？!?;；\n]+|\.(?=\s|$)/u).map(s => s.trim()).filter(s => /[\p{L}\p{N}]/u.test(s));
const sig = (text, language) => signature(text, language, BILINGUAL_LEXICON);

function unmodeledSource(text, signature) {
  let rest = text;
  const surfaces = [...signature.entities, ...signature.arguments, ...signature.predicates].map(x => x.surface)
    .concat(signature.numbers, signature.quantities, signature.negation, signature.temporal, signature.causal)
    .sort((a, b) => b.length - a.length);
  for (const surface of surfaces) rest = rest.split(surface).join(' ');
  // Only grammatical particles are ignored. Remaining content prevents a FULL
  // coverage claim even when the clause has enough evidence for correspondence.
  return rest.replace(/[的了着把被是也又就都和与而在将向为用从到及地得他她它我你们]/gu, ' ').match(/\p{Script=Han}+/gu) || [];
}

function independentMatches(source, draft) {
  const candidates = [...source.entities, ...source.arguments].flatMap(s => {
    const d = [...draft.entities, ...draft.arguments].find(d => d.id === s.id);
    if (!d) return [];
    // A term that is itself the predicate is not a second independent anchor.
    if (source.predicates.some(p => p.surface.includes(s.surface) || s.surface.includes(p.surface))) return [];
    if (draft.predicates.some(p => p.surface.includes(d.surface) || d.surface.includes(p.surface))) return [];
    return [{ id: s.id, source: s.surface, draft: d.surface }];
  }).sort((a, b) => b.source.length - a.source.length);
  const result = [];
  for (const c of candidates) {
    if (!result.some(r => r.source.includes(c.source) || c.source.includes(r.source) || r.draft.includes(c.draft) || c.draft.includes(r.draft))) result.push(c);
  }
  return result;
}

function frameMatch(source, draft) {
  const events = source.predicates.flatMap(s => {
    const d = draft.predicates.find(d => d.id === s.id);
    return d ? [{ id: s.id, source: s.surface, draft: d.surface }] : [];
  });
  const arguments_ = independentMatches(source, draft);
  const numbers = [...new Set(source.numbers.filter(n => draft.numbers.includes(n)))];
  const positive = events.length >= 1 && arguments_.length >= 1;
  const draftEventCoverage = events.length / Math.max(1, draft.events.length);
  // Rule score, NOT a calibrated probability.
  const score = positive ? Math.min(0.98, 0.8 + 0.04 * (events.length + arguments_.length - 2) + 0.02 * numbers.length) * draftEventCoverage
    : Math.min(0.35, events.length * 0.15 + arguments_.length * 0.05 + numbers.length * 0.02);
  return { score: ROUND(score), positive: positive && draftEventCoverage >= 0.75, events, arguments: arguments_, numbers };
}

function pairEvidence(source, draft) {
  const s = sig(source, 'zh'), d = sig(draft, 'vi');
  const sourceClauses = clauses(source), draftClauses = clauses(draft);
  const ss = sourceClauses.map(c => sig(c, 'zh')), ds = draftClauses.map(c => sig(c, 'vi'));
  const matches = ss.map((sc, sourceIndex) => {
    const candidates = ds.map((dc, draftIndex) => ({ sourceIndex, draftIndex, ...frameMatch(sc, dc) }));
    return candidates.sort((a, b) => b.score - a.score)[0] || { sourceIndex, draftIndex: null, score: 0, positive: false, events: [], arguments: [], numbers: [] };
  });
  const supported = matches.filter(m => m.positive);
  const best = [...matches].sort((a, b) => b.score - a.score)[0];
  const allEvents = frameMatch(s, d);
  const draftSupported = ds.map(dc => ss.some(sc => frameMatch(sc, dc).positive));
  const order = supported.every((m, i) => !i || m.draftIndex >= supported[i - 1].draftIndex);
  return { score: ROUND(best?.score || 0), positive: supported.length > 0 && draftSupported.every(Boolean) && order,
    source_signature: s, draft_signature: d, source_clauses: sourceClauses, draft_clauses: draftClauses, clause_matches: matches,
    supported_source_clauses: supported.length, supported_draft_clauses: draftSupported.filter(Boolean).length,
    recognized_source_coverage: ROUND(supported.length / Math.max(1, ss.length)), clause_order_monotonic: order,
    matched_events: allEvents.events, matched_arguments: allEvents.arguments,
    unmatched_source_events: s.events.filter(e => !d.events.includes(e)), unmatched_draft_events: d.events.filter(e => !s.events.includes(e)),
    unmodeled_source_fragments: unmodeledSource(source, s) };
}

function neighbors(context, direction, language) {
  const items = context[`${language === 'zh' ? 'source' : 'draft'}_${direction}`] ?? (language === 'zh' ? context[direction] : []) ?? [];
  return (Array.isArray(items) ? items : [items]).flatMap((item, index) => {
    const text = typeof item === 'string' ? item : item?.text;
    if (!text || (language === 'zh' && !/\p{Script=Han}/u.test(text))) return [];
    return [{ text, index, paragraphIndex: item?.paragraphIndex ?? null }];
  });
}

function validateAlignment(source, draft, context = {}) {
  const s = String(source || ''), d = String(draft || '');
  const evidence = pairEvidence(s, d), issues = [], comparisons = [];
  let status = 'UNCERTAIN', confidence = evidence.score;
  for (const direction of ['previous', 'next']) {
    for (const language of ['zh', 'vi']) for (const n of neighbors(context, direction, language)) {
      const e = language === 'zh' ? pairEvidence(n.text, d) : pairEvidence(s, n.text);
      comparisons.push({ kind: language === 'zh' ? 'alternative_source' : 'alternative_draft', direction, ...n,
        score: e.score, positive: e.positive, matched_events: e.matched_events, matched_arguments: e.matched_arguments });
    }
  }
  const alternate = comparisons.filter(c => c.kind === 'alternative_source' && c.positive && c.score >= evidence.score + 0.25).sort((a, b) => b.score - a.score)[0];
  const gs = evidence.source_signature, gd = evidence.draft_signature;
  const competing = comparisons.some(c => c.kind === 'alternative_source' && c.positive && c.score >= evidence.score - 0.04);
  const dialogueDifference = gs.dialogue !== gd.dialogue;
  // Disjoint recognized vocabularies alone are NOT proof of different events.
  // These action pairs have explicit, incompatible event identities. Other
  // apparent mismatches remain uncertain unless a neighboring origin is found.
  const incompatible = [['kill', 'heal'], ['open', 'close'], ['build', 'destroy'], ['sleep', 'wake'], ['buy', 'sell']]
    .some(([a, b]) => gs.events.length === 1 && gd.events.length === 1 &&
      ((gs.events[0] === a && gd.events[0] === b) || (gs.events[0] === b && gd.events[0] === a)));
  if (!/\p{Script=Han}/u.test(s) || !/\p{Script=Latin}/u.test(d)) {
    status = 'INVALID'; issues.push('empty_or_wrong_language'); confidence = 1;
  } else if (gs.system !== gd.system) {
    status = 'INVALID'; issues.push('system_message_mismatch'); confidence = 0.95;
  } else if (alternate && !evidence.positive) {
    status = 'INVALID'; issues.push('phase_shift', `misaligned_${alternate.direction}`); confidence = alternate.score;
  } else if (incompatible && evidence.matched_arguments.length) {
    status = 'INVALID'; issues.push('semantic_event_mismatch'); confidence = 0.8;
  } else if (evidence.positive && !competing) {
    status = 'VALID';
  } else issues.push(competing ? 'competing_correspondence' : 'insufficient_positive_evidence');
  if (dialogueDifference && status !== 'VALID') issues.push('dialogue_mismatch');
  // A missing predicate or sentence is coverage evidence, never an alignment veto.
  const partial = status === 'VALID' && evidence.recognized_source_coverage < 1;
  const numericDifference = JSON.stringify([...gs.numbers].sort()) !== JSON.stringify([...gd.numbers].sort());
  const coverageStatus = status !== 'VALID' || (!partial && (evidence.unmatched_source_events.length > 0 || numericDifference || evidence.unmodeled_source_fragments.length > 0)) ? 'UNKNOWN' : partial ? 'PARTIAL' : 'FULL';
  const coverage = { status: coverageStatus,
    source_coverage: coverageStatus !== 'UNKNOWN' ? evidence.recognized_source_coverage : null,
    recognized_clause_coverage: evidence.recognized_source_coverage,
    basis: 'recognized_clause_evidence', is_estimate: true, missing_information_candidates: evidence.unmatched_source_events,
    note: 'Lexical clause support does not certify complete translation or semantic correctness.' };
  if (partial) issues.push('partial_translation');
  return { isValid: status === 'VALID', confidence, issues,
    alignment: { status, confidence, confidence_kind: 'heuristic_not_probability', method: 'positive_clause_correspondence_v3',
      sufficient_evidence: status === 'VALID', evidence: { ...evidence, current_score: evidence.score, comparisons } }, coverage };
}

function paragraphs(content, language) {
  const result = String(content || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  const heading = language === 'zh' ? /^第\s*[\d一二三四五六七八九十百千万]+\s*章/ : /^(?:#\s*)?(?:Chương|Tiết)\s*\d+/i;
  if (result.length && heading.test(result[0])) result.shift();
  return result;
}

// Compatibility name. All lengths use the same monotonic DP: no index shortcut,
// structural-only anchor, forced island merge, or silent loss of unpaired text.
function alignChapterWithIslands(sourceContent, draftContent) {
  const source = paragraphs(sourceContent, 'zh'), draft = paragraphs(draftContent, 'vi');
  const N = source.length, M = draft.length;
  const dp = Array.from({ length: N + 1 }, () => new Float64Array(M + 1).fill(-Infinity));
  const parent = Array.from({ length: N + 1 }, () => new Array(M + 1));
  dp[0][0] = 0;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) {
    if (!Number.isFinite(dp[i][j])) continue;
    for (const [a, b] of [[1, 1], [1, 2], [1, 3], [2, 1], [3, 1], [1, 0], [0, 1]]) {
      if (i + a > N || j + b > M) continue;
      let gain = -1;
      if (a && b) {
        const e = pairEvidence(source.slice(i, i + a).join('\n'), draft.slice(j, j + b).join('\n'));
        gain = (e.positive ? e.score * Math.min(a, b) * 4 : -1.5) - (a + b - 2) * 0.35;
        if (e.source_signature.system !== e.draft_signature.system || e.source_signature.dialogue !== e.draft_signature.dialogue) gain -= 2;
      }
      if (dp[i][j] + gain > dp[i + a][j + b]) {
        dp[i + a][j + b] = dp[i][j] + gain;
        parent[i + a][j + b] = { i, j, a, b };
      }
    }
  }
  const pairs = [];
  let i = N, j = M;
  while (i || j) {
    const p = parent[i][j];
    if (!p) throw new Error('Alignment path incomplete');
    const s = source.slice(p.i, i).join('\n'), d = draft.slice(p.j, j).join('\n');
    const context = { source_previous: source.slice(Math.max(0, p.i - 2), p.i), source_next: source.slice(i, i + 2),
      draft_previous: draft.slice(Math.max(0, p.j - 2), p.j), draft_next: draft.slice(j, j + 2) };
    pairs.push({ source: s, draft: d, paragraphIndex: p.i + 1, draftParagraphIndex: p.j + 1,
      sourceRange: [p.i, i], draftRange: [p.j, j], isAnchor: false, ...validateAlignment(s, d, context) });
    i = p.i; j = p.j;
  }
  return pairs.reverse();
}

module.exports = { validateAlignment, pairEvidence, alignChapterWithIslands, paragraphs,
  computeSemanticOverlap: (s, d) => pairEvidence(s, d).score, extractNumbers, BILINGUAL_LEXICON };
