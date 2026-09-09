import test from 'node:test';
import assert from 'node:assert/strict';
import { costOf, priceBuild, validateBuild, BUDGET, SLOTS, SLOT_KEYS } from '../src/ratings.js';
import { POOL, BY_ID } from './helpers.js';

test('AC-1 pool schema: unique ids, required fields, ratings in range, >=110 players', () => {
  assert.ok(POOL.length >= 110, `pool has ${POOL.length}, want >= 110`);
  const ids = new Set();
  for (const p of POOL) {
    assert.ok(p.id && !ids.has(p.id), `duplicate or missing id: ${p.id}`);
    ids.add(p.id);
    for (const f of ['name', 'season', 'era', 'team']) {
      assert.equal(typeof p[f], 'string', `${p.id} missing ${f}`);
      assert.ok(p[f].length > 0, `${p.id} has empty ${f}`);
    }
    assert.ok(['current', '2000s', 'legend'].includes(p.era), `${p.id} bad era "${p.era}"`);
    for (const k of SLOT_KEYS) {
      assert.equal(typeof p[k], 'number', `${p.id} missing rating ${k}`);
      assert.ok(Number.isInteger(p[k]), `${p.id}.${k} not an integer`);
      assert.ok(p[k] >= 1 && p[k] <= 99, `${p.id}.${k} = ${p[k]} out of 1..99`);
    }
  }
});

test('AC-2 cost curve is positive and strictly monotonic across 1..99', () => {
  let prev = 0;
  for (let r = 1; r <= 99; r++) {
    const c = costOf(r);
    assert.ok(Number.isInteger(c) && c > 0, `costOf(${r}) = ${c} not a positive integer`);
    assert.ok(c > prev, `costOf(${r}) = ${c} is not greater than costOf(${r - 1}) = ${prev}`);
    prev = c;
  }
  assert.throws(() => costOf(0), RangeError);
  assert.throws(() => costOf(100), RangeError);
});

test('AC-3 the cap actually binds: a flat-85 build lands within 10 of it', () => {
  const total = SLOT_KEYS.length * costOf(85);
  assert.ok(Math.abs(total - BUDGET) <= 10,
    `flat-85 costs ${total}, want within 10 of the ${BUDGET} cap`);
});

test('AC-2b elite ratings are disproportionately expensive', () => {
  // A 95 should cost roughly twice an 85, not marginally more.
  assert.ok(costOf(95) / costOf(85) > 1.3, 'curve is too flat at the top');
  assert.ok(costOf(99) > 3 * costOf(70), 'a 99 should dwarf a 70');
});

const anyWith = (slot, target) =>
  POOL.reduce((best, p) => Math.abs(p[slot] - target) < Math.abs(best[slot] - target) ? p : best).id;

test('AC-4 a build over the cap fails validation and names the overage', () => {
  const picks = { sc: 'jordan90', hnd: 'kyrie17', frm: 'wemby25', def: 'russell65', ath: 'giannis21' };
  const v = validateBuild(picks, POOL);
  assert.equal(v.ok, false);
  assert.ok(v.total > BUDGET, 'the all-star build should exceed the cap');
  assert.match(v.errors.join(' '), /over the cap by \d+/);
  assert.match(v.errors.join(' '), new RegExp(String(v.total - BUDGET)));
});

test('AC-5 a build with empty slots fails validation and names them', () => {
  const v = validateBuild({ sc: 'klay16', frm: 'gobert21' }, POOL);
  assert.equal(v.ok, false);
  const joined = v.errors.join(' ');
  assert.match(joined, /3 slots still empty/);
  for (const label of ['Handles', 'Defense', 'Athleticism']) assert.match(joined, new RegExp(label));
  assert.doesNotMatch(joined, /Shot Creation/);
});

test('a legal build passes and reports what is left over', () => {
  const picks = { sc: 'klay16', hnd: 'reggie95', frm: 'tyson12', def: 'bowen05', ath: 'marion06' };
  const v = validateBuild(picks, POOL);
  assert.equal(v.ok, true, v.errors.join('; '));
  assert.equal(v.remaining, BUDGET - v.total);
  assert.ok(v.total <= BUDGET);
});

test('AC-20 no source player is a strictly dominant buy', () => {
  // A player is "dominant" if they are top-10 in a slot AND the cheapest
  // top-10 option there, in more than one slot at once.
  const dominatesIn = new Map();
  for (const k of SLOT_KEYS) {
    const top = [...POOL].sort((a, b) => b[k] - a[k]).slice(0, 10);
    const cheapest = top.reduce((a, b) => costOf(a[k]) <= costOf(b[k]) ? a : b);
    dominatesIn.set(cheapest.id, (dominatesIn.get(cheapest.id) || 0) + 1);
  }
  for (const [id, n] of dominatesIn) {
    assert.ok(n <= 1, `${BY_ID.get(id).name} is the cheapest top-10 option in ${n} slots at once`);
  }
});

test('unknown player ids are rejected rather than silently priced at zero', () => {
  assert.throws(() => priceBuild({ sc: 'nobody' }, POOL), /unknown player id/);
});
