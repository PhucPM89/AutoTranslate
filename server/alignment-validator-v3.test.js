"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateAlignment: check, alignChapterWithIslands: align } = require('./alignment-validator');
const fleeing = '怪物逃跑了。', sealing = '恶灵娃娃被封印了。', sealed = 'Búp bê ác linh đã bị phong ấn.';

test('N paired to N+1/N-1 is invalid with scored alternate-origin evidence', () => {
  for (const direction of ['next', 'previous']) {
    const r = check(fleeing, sealed, { [`source_${direction}`]: [sealing] });
    assert.equal(r.alignment.status, 'INVALID');
    assert.ok(r.issues.includes(`misaligned_${direction}`));
    assert.ok(r.alignment.evidence.comparisons.some(c => c.direction === direction && c.positive));
  }
});
test('A+B to A is valid alignment with partial coverage; A+B to A+B is full', () => {
  const partial = check('陈易打开门。陈易吃了药品。', 'Trần Dịch mở cửa.');
  assert.equal(partial.alignment.status, 'VALID'); assert.equal(partial.coverage.status, 'PARTIAL');
  const full = check('陈易打开门。陈易吃了药品。', 'Trần Dịch mở cửa. Trần Dịch ăn thuốc.');
  assert.equal(full.alignment.status, 'VALID'); assert.equal(full.coverage.status, 'FULL');
  assert.equal(full.coverage.recognized_clause_coverage, 1);
});
test('wrong current plus correct next draft stays invalid', () => {
  const r = check(fleeing, sealed, { source_next: [sealing], draft_next: ['Quái vật đã bỏ chạy.'] });
  assert.equal(r.alignment.status, 'INVALID');
  assert.ok(r.alignment.evidence.comparisons.some(c => c.kind === 'alternative_draft' && c.positive));
});
test('system mismatch invalid; bracket translation valid; dialogue newline valid', () => {
  assert.equal(check('【怪物被杀死。】', 'Con quái vật bị tiêu diệt.').alignment.status, 'INVALID');
  assert.equal(check('【怪物被杀死。】', '[Con quái vật bị tiêu diệt.]').alignment.status, 'VALID');
  assert.equal(check('“陈易打开门，走进木屋。”', '"Trần Dịch mở cửa."\n"Trần Dịch bước vào căn nhà."').alignment.status, 'VALID');
});
test('same entity/topic with explicit incompatible event is invalid', () => {
  assert.equal(check('陈易打开门。', 'Trần Dịch đóng cửa.').alignment.status, 'INVALID');
  assert.equal(check('陈易购买药品。', 'Trần Dịch bán thuốc.').alignment.status, 'INVALID');
});
test('unseen phase shift detected while unseen direct paraphrase abstains', () => {
  const shifted = check('陶森打开木屋的门。', 'Đào Sâm đóng cửa căn nhà.', { source_next: ['陶森关闭木屋的门。'] });
  assert.equal(shifted.alignment.status, 'INVALID'); assert.ok(shifted.issues.includes('phase_shift'));
  assert.equal(check('陶森校准仪器。', 'Đào Sâm hiệu chuẩn thiết bị.').alignment.status, 'UNCERTAIN');
});
test('zero evidence, equal structure, shared noun or ambiguous origin never implies valid', () => {
  assert.equal(check('星河璀璨。', 'Mưa rơi trên mái hiên.').alignment.status, 'UNCERTAIN');
  assert.equal(check('【星河璀璨。】', '[Mưa rơi trên mái hiên.]').alignment.status, 'UNCERTAIN');
  assert.equal(check('怪物非常强大。', 'Tôi cảm nhận được quái vật.').alignment.status, 'UNCERTAIN');
  assert.equal(check(sealing, sealed, { source_next: [sealing] }).alignment.status, 'UNCERTAIN');
});
test('neighbors are compared separately and compounds do not invent predicates', () => {
  const r = check('星河璀璨。', 'Búp bê đã mở cửa.', { source_next: ['门打开了。', '娃娃坐着。'] });
  assert.equal(r.alignment.evidence.comparisons.length, 2);
  assert.deepEqual(check('星河璀璨。', 'Ăn mòn, săn bắn, rơi vào giấc mộng.').alignment.evidence.draft_signature.events, []);
});
test('negation and numeric mismatch are retained as coverage evidence, not alignment veto', () => {
  const r = check('陈易没有打开10个门。', 'Trần Dịch đã mở 12 cửa.');
  assert.equal(r.alignment.status, 'VALID'); assert.equal(r.coverage.status, 'UNKNOWN');
  assert.deepEqual(r.alignment.evidence.source_signature.numbers, ['10']); assert.ok(r.alignment.evidence.source_signature.negation.length);
});
test('monotonic DP has no equal-count index shortcut and accounts for gaps', () => {
  const s = '陈易打开门。\n陈易吃了药品。', d = 'Trần Dịch ăn thuốc.\nMột câu không liên quan.';
  const pairs = align(s, d), eating = pairs.find(p => p.source.includes('吃了') && p.draft.includes('ăn thuốc'));
  assert.ok(eating); assert.equal(eating.draftRange[0], 0); assert.ok(pairs.some(p => !p.source || !p.draft));
  assert.equal(pairs.map(p => p.source).filter(Boolean).join('\n'), s);
  assert.equal(pairs.map(p => p.draft).filter(Boolean).join('\n'), d);
});
