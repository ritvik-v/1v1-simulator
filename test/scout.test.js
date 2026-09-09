import test from 'node:test';
import assert from 'node:assert/strict';
import { headToHead, gauntlet, leverage, readout, grade } from '../src/scout.js';
import { toFighter, SLOT_KEYS, BUDGET, validateBuild } from '../src/ratings.js';
import { POOL, fighter, flat } from './helpers.js';

const build = id => ({ id, manager: id,
  picks: { sc: 'klay16', hnd: 'reggie95', frm: 'tyson12', def: 'bowen05', ath: 'marion06' } });
const opponents = [
  fighter('a', { sc: 92, hnd: 88, frm: 66, def: 60, ath: 82 }),
  fighter('b', { sc: 70, hnd: 58, frm: 97, def: 94, ath: 78 }),
  fighter('c', { sc: 85, hnd: 85, frm: 85, def: 85, ath: 85 }),
];
opponents.forEach((o, i) => { o.manager = ['Sniper', 'Wall', 'Prototype'][i]; });

test('head-to-head aggregates are internally consistent', () => {
  const h = headToHead(flat('you', 85), flat('them', 85), 200, 'consistent');
  assert.equal(h.runs, 200);
  assert.ok(h.winRate >= 0.4 && h.winRate <= 0.6, `mirror win rate ${h.winRate}`);
  for (const side of [h.you, h.them]) {
    assert.ok(side.fg > 0 && side.fg < 1, 'field goal rate out of range');
    const mix = side.mix.jumper + side.mix.drive + side.mix.post;
    assert.ok(Math.abs(mix - 1) < 1e-9, `shot mix sums to ${mix}, not 1`);
    assert.ok(side.ppg > 0, 'a side scored nothing across 200 games');
    assert.ok(side.cleanRate >= 0 && side.cleanRate <= 1);
    assert.ok(side.blowbyRate >= 0 && side.blowbyRate <= 1);
  }
  // Average scores must straddle the target the way real games do.
  assert.ok(h.avgScore[0] > 5 && h.avgScore[0] < 12, `avg score ${h.avgScore[0]}`);
});

test('scouting is reproducible from its seed', () => {
  const a = headToHead(flat('x', 82), flat('y', 74), 120, 'same');
  const b = headToHead(flat('x', 82), flat('y', 74), 120, 'same');
  assert.deepEqual(a, b);
  const c = headToHead(flat('x', 82), flat('y', 74), 120, 'other');
  assert.notEqual(a.winRate, c.winRate);
});

test('a better build posts a better gauntlet score', () => {
  const strong = gauntlet(flat('s', 90), opponents, 150, 'g').overall;
  const weak = gauntlet(flat('w', 70), opponents, 150, 'g').overall;
  assert.ok(strong > weak + 0.2, `strong ${strong} vs weak ${weak} — gauntlet does not discriminate`);
  assert.ok(strong <= 1 && weak >= 0);
});

test('gauntlet names the best and worst matchup out of the rows it reports', () => {
  const g = gauntlet(fighter('me', { sc: 88, hnd: 84, frm: 70, def: 64, ath: 80 }),
                     opponents, 150, 'bw');
  assert.equal(g.rows.length, opponents.length);
  assert.equal(g.best.winRate, Math.max(...g.rows.map(r => r.winRate)));
  assert.equal(g.worst.winRate, Math.min(...g.rows.map(r => r.winRate)));
  assert.ok(g.rows.every(r => r.name && r.winRate >= 0 && r.winRate <= 1));
  const mean = g.rows.reduce((s, r) => s + r.winRate, 0) / g.rows.length;
  assert.ok(Math.abs(g.overall - mean) < 1e-9, 'overall is not the mean of the rows');
});

test('leverage ranks the five slots and keeps every swap legal', () => {
  const b = build('me');
  const rows = leverage(b, POOL, opponents, toFighter, 80, 'lev');
  assert.equal(rows.length, 5);
  assert.deepEqual([...rows.map(r => r.slot)].sort(), [...SLOT_KEYS].sort());
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].drop >= rows[i].drop, 'rows are not sorted by impact');
  }
  for (const r of rows) {
    assert.ok(r.player && r.swapTo, 'a row is missing its player names');
    // The swap must never collide with another slot in the build.
    const swapped = { ...b.picks, [r.slot]: POOL.find(p => p.name === r.swapTo).id };
    assert.equal(new Set(Object.values(swapped)).size, 5,
      `swapping ${r.slot} to ${r.swapTo} duplicates a player already in the build`);
  }
});

test('grade brackets the whole 0-100 range without a gap', () => {
  const seen = new Set();
  for (let i = 0; i <= 100; i++) seen.add(grade(i / 100));
  assert.deepEqual([...seen].sort(), ['Middling', 'Solid', 'Strong', 'Struggling']);
  assert.equal(grade(0.9), 'Strong');
  assert.equal(grade(0.2), 'Struggling');
});

test('the readout says something true about the build it read', () => {
  const f = fighter('shooter', { sc: 96, hnd: 88, frm: 60, def: 52, ath: 74 });
  const g = gauntlet(f, opponents, 150, 'ro');
  const h = headToHead(f, opponents[2], 200, 'ro-h');
  const lines = readout(g, h);
  assert.ok(lines.length >= 3);
  assert.match(lines[0], new RegExp('^' + grade(g.overall) + ' — '));
  assert.match(lines[0], new RegExp(String(Math.round(g.overall * 100))));
  assert.match(lines[1], new RegExp(g.best.name));
  assert.match(lines[1], new RegExp(g.worst.name));
  assert.match(lines[2], /jumpers|drives|post-ups/);
});
