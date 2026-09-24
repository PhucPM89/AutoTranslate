"use strict";

const { pairEvidence, BILINGUAL_LEXICON } = require('./alignment-validator');
const { signature } = require('./alignment-signatures');
const numbers = text => String(text).match(/\d+(?:\.\d+)?/g) || [];
const system = text => /【[^】]*】|\[[^\]]*\]/s.test(text);
const dialogue = text => /(?:^|\n)\s*[“"「]/u.test(text);

function splitCohesiveBlocks(content, language) {
  const blocks = [];
  const re = /[^\r\n]+(?:\r?\n(?!\s*\r?\n)[^\r\n]+)*/g;
  for (const match of String(content || '').matchAll(re)) {
    const text = match[0].trim();
    if (text) blocks.push({ text, from: match.index, to: match.index + match[0].length });
  }
  const title = language === 'zh' ? /^第\s*[\d一二三四五六七八九十百千万]+\s*章/ : /^(?:#\s*)?(?:Chương|Tiết)\s*\d+/i;
  if (blocks.length && title.test(blocks[0].text)) blocks.shift();
  return blocks.map((block, index) => ({ ...block, order: index + 1 }));
}

function features(text, language) {
  const lower = String(text).toLocaleLowerCase('vi');
  const terms = [];
  for (let i = 0; i < BILINGUAL_LEXICON.length; i++) {
    const [source, targets] = BILINGUAL_LEXICON[i];
    if (language === 'zh' ? source.test(text) : targets.some(t => lower.includes(t))) terms.push(i);
  }
  return { numbers: numbers(text), terms, system: system(text), dialogue: dialogue(text),
    signature: signature(text, language, BILINGUAL_LEXICON) };
}

function anchorCandidate(sourceText, draftText, sf = features(sourceText, 'zh'), df = features(draftText, 'vi')) {
  if (sf.system !== df.system || sf.dialogue !== df.dialogue) return null;
  const matchedTerms = sf.terms.filter(t => df.terms.includes(t));
  const exactNumbers = sf.numbers.length > 0 && sf.numbers.length === df.numbers.length && sf.numbers.every(n => df.numbers.includes(n));
  const matchedEvents = sf.signature.events.filter(event => df.signature.events.includes(event));
  const sourceArguments = [...sf.signature.entities, ...sf.signature.arguments].map(x => x.id);
  const draftArguments = new Set([...df.signature.entities, ...df.signature.arguments].map(x => x.id));
  const matchedArguments = [...new Set(sourceArguments.filter(id => draftArguments.has(id)))];
  // Event+argument evidence is only an anchor; absence never confirms a pair,
  // and same entities with different events cannot pass it.
  const framePositive = matchedEvents.length > 0 && matchedArguments.length > 0;
  const strong = framePositive ||
    (sf.system && (exactNumbers || matchedTerms.length >= 2)) ||
    (exactNumbers && matchedTerms.length >= 1) || matchedTerms.length >= 3;
  if (!strong) return null;
  const score = matchedEvents.length * 0.3 + matchedArguments.length * 0.12 + matchedTerms.length * 0.12 + (exactNumbers ? 0.2 : 0) + (sf.system ? 0.12 : 0);
  const evidence = [];
  if (framePositive) evidence.push(`event_argument:${matchedEvents.join(',')}:${matchedArguments.join(',')}`);
  if (matchedTerms.length) evidence.push(`bilingual_terms:${matchedTerms.join(',')}`);
  if (exactNumbers) evidence.push(`exact_numbers:${sf.numbers.join(',')}`);
  if (sf.system) evidence.push('matching_system_message_structure');
  if (sf.dialogue) evidence.push('matching_dialogue_boundary');
  return { score, evidence };
}

function reciprocalAnchors(source, draft) {
  const sf = source.map(x => features(x, 'zh')), df = draft.map(x => features(x, 'vi'));
  const candidates = [];
  for (let i = 0; i < source.length; i++) for (let j = 0; j < draft.length; j++) {
    // Order window is candidate pruning, never positive evidence.
    const projected = source.length > 1 ? i * (draft.length - 1) / (source.length - 1) : 0;
    if (Math.abs(j - projected) > 18) continue;
    const match = anchorCandidate(source[i], draft[j], sf[i], df[j]);
    if (match) candidates.push({ source_order: i, draft_order: j, ...match });
  }
  const reciprocal = candidates.filter(candidate => {
    const bySource = candidates.filter(x => x.source_order === candidate.source_order).sort((a, b) => b.score - a.score);
    const byDraft = candidates.filter(x => x.draft_order === candidate.draft_order).sort((a, b) => b.score - a.score);
    return bySource[0] === candidate && byDraft[0] === candidate &&
      (bySource.length === 1 || candidate.score - bySource[1].score >= 0.08) &&
      (byDraft.length === 1 || candidate.score - byDraft[1].score >= 0.08);
  });
  // Maximum-cardinality monotonic trace, score breaks ties.
  const dp = reciprocal.map((x, i) => ({ count: 1, score: x.score, parent: -1 }));
  for (let i = 0; i < reciprocal.length; i++) for (let j = 0; j < i; j++) {
    if (reciprocal[j].source_order >= reciprocal[i].source_order || reciprocal[j].draft_order >= reciprocal[i].draft_order) continue;
    const next = { count: dp[j].count + 1, score: dp[j].score + reciprocal[i].score };
    if (next.count > dp[i].count || (next.count === dp[i].count && next.score > dp[i].score)) dp[i] = { ...next, parent: j };
  }
  if (!dp.length) return [];
  let cursor = dp.reduce((best, x, i) => x.count > dp[best].count || (x.count === dp[best].count && x.score > dp[best].score) ? i : best, 0);
  const trace = [];
  while (cursor >= 0) { trace.unshift(reciprocal[cursor]); cursor = dp[cursor].parent; }
  return trace;
}

function makeRegion(chapter, source, draft, sFrom, sTo, dFrom, dTo, method, evidence) {
  return {
    source_block_id: `ch${chapter}:source:${sFrom + 1}-${sTo}`,
    draft_block_id: `ch${chapter}:draft:${dFrom + 1}-${dTo}`,
    source_order: { from: sFrom + 1, to: sTo }, draft_order: { from: dFrom + 1, to: dTo },
    pairing_method: method, pairing_evidence: evidence, alignment_status: 'CONFIRMED',
    source_indices: Array.from({ length: sTo - sFrom }, (_, i) => sFrom + i),
    draft_indices: Array.from({ length: dTo - dFrom }, (_, i) => dFrom + i),
    source: source.slice(sFrom, sTo).join('\n\n'), draft: draft.slice(dFrom, dTo).join('\n\n')
  };
}

function buildPairingTrace(chapter, sourceContent, draftContent, options = {}) {
  const sourceBlocks = splitCohesiveBlocks(sourceContent, 'zh'), draftBlocks = splitCohesiveBlocks(draftContent, 'vi');
  const source = sourceBlocks.map(x => x.text), draft = draftBlocks.map(x => x.text);
  const anchors = reciprocalAnchors(source, draft);
  const confirmed = anchors.map(a => makeRegion(chapter, source, draft, a.source_order, a.source_order + 1, a.draft_order, a.draft_order + 1,
    'reciprocal_unique_anchor', a.evidence));
  const boundaries = [{ source_order: -1, draft_order: -1, label: 'CHAPTER_START' }, ...anchors,
    { source_order: source.length, draft_order: draft.length, label: 'CHAPTER_END' }];
  const uncertain = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const left = boundaries[i], right = boundaries[i + 1];
    const sFrom = left.source_order + 1, sTo = right.source_order;
    const dFrom = left.draft_order + 1, dTo = right.draft_order;
    if (sFrom === sTo && dFrom === dTo) continue;
    const sCount = sTo - sFrom, dCount = dTo - dFrom;
    const sourceText = source.slice(sFrom, sTo).join('\n\n'), draftText = draft.slice(dFrom, dTo).join('\n\n');
    const bounded = sCount > 0 && dCount > 0 && sCount <= (options.maxIslandBlocks || 3) && dCount <= (options.maxIslandBlocks || 3) &&
      sourceText.length <= (options.maxSourceChars || 450) && draftText.length <= (options.maxDraftChars || 900);
    const evidence = [`left_boundary:${left.label || `anchor:${left.source_order + 1}:${left.draft_order + 1}`}`,
      `right_boundary:${right.label || `anchor:${right.source_order + 1}:${right.draft_order + 1}`}`,
      `complete_intervening_sequence:${sCount}:${dCount}`];
    if (bounded) confirmed.push(makeRegion(chapter, source, draft, sFrom, sTo, dFrom, dTo, 'anchor_bounded_cohesive_island', evidence));
    else uncertain.push({ source_order: { from: sFrom + 1, to: sTo }, draft_order: { from: dFrom + 1, to: dTo },
      source_indices: Array.from({ length: Math.max(0, sCount) }, (_, n) => sFrom + n),
      draft_indices: Array.from({ length: Math.max(0, dCount) }, (_, n) => dFrom + n),
      source: sourceText, draft: draftText, alignment_status: 'UNCERTAIN', reason: bounded ? null : 'ISLAND_NOT_SAFELY_BOUNDED_FOR_REVIEW', pairing_evidence: evidence });
  }
  confirmed.sort((a, b) => a.source_order.from - b.source_order.from);
  return { chapter, source, draft, sourceBlocks, draftBlocks, anchors, confirmed, uncertain };
}

function coverageForConfirmed(region) {
  const evidence = pairEvidence(region.source, region.draft);
  return evidence.positive && evidence.recognized_source_coverage < 1 ?
    { status: 'PARTIAL', source_coverage: evidence.recognized_source_coverage, basis: 'recognized_source_clauses' } :
    { status: 'REVIEW_REQUIRED', source_coverage: null, basis: 'human_audit' };
}

function classifyExistingPair(trace, sourceText, draftText) {
  const sourceMatches = trace.source.flatMap((text, index) => text === sourceText ? [index] : []);
  const draftMatches = trace.draft.flatMap((text, index) => text === draftText ? [index] : []);
  if (sourceMatches.length !== 1 || draftMatches.length !== 1) return { alignment_status: 'UNCERTAIN', reason: 'BLOCK_NOT_UNIQUE_IN_TRACE' };
  const sourceIndex = sourceMatches[0], draftIndex = draftMatches[0];
  const bySource = trace.confirmed.find(r => r.source_indices.includes(sourceIndex));
  const byDraft = trace.confirmed.find(r => r.draft_indices.includes(draftIndex));
  if (bySource && bySource === byDraft) return { alignment_status: 'CONFIRMED', region: bySource, pairing_evidence: bySource.pairing_evidence };
  if (bySource || byDraft) return { alignment_status: 'INVALID', reason: 'BLOCK_ASSIGNED_TO_DIFFERENT_TRACE_REGION',
    expected_source_block_id: byDraft?.source_block_id || null, expected_draft_block_id: bySource?.draft_block_id || null,
    pairing_evidence: [...new Set([...(bySource?.pairing_evidence || []), ...(byDraft?.pairing_evidence || [])])] };
  return { alignment_status: 'UNCERTAIN', reason: 'NO_SAFELY_BOUNDED_TRACE_REGION' };
}

module.exports = { splitCohesiveBlocks, features, anchorCandidate, reciprocalAnchors, buildPairingTrace, coverageForConfirmed, classifyExistingPair };
