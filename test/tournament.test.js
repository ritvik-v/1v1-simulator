import test from 'node:test';
import assert from 'node:assert/strict';
import { runTournament, stripLogs, EXPECTED_SERIES } from '../src/tournament.js';
import { league } from './helpers.js';

test('AC-12 the tournament returns exactly 12 placements, 1..12, no gaps or duplicates', () => {
  for (const seed of ['alpha', 'bravo', 'charlie', 'delta']) {
    const t = runTournament(league(), seed);
    assert.equal(t.placements.length, 12);
    const places = t.placements.map(p => p.place).sort((a, b) => a - b);
    assert.deepEqual(places, [1,2,3,4,5,6,7,8,9,10,11,12]);
    const ids = new Set(t.placements.map(p => p.id));
    assert.equal(ids.size, 12, 'a build was placed twice or not at all');
    for (const p of t.placements) assert.equal(p.pick, p.place, 'pick number must equal placement');
  }
});

test('AC-13 every placement is earned on the floor, across exactly 38 series', () => {
  const t = runTournament(league(), 'earned');
  assert.equal(t.seriesCount, EXPECTED_SERIES);
  assert.equal(t.series.length, EXPECTED_SERIES);
  const groupSeries = t.groups.reduce((s, g) => s + g.series.length, 0);
  const bracketSeries = t.rounds.reduce((s, r) => s + r.series.length, 0);
  assert.equal(groupSeries, 18, 'three groups of four is 18 round-robin series');
  assert.equal(bracketSeries, 20, 'the placement bracket is 20 series');
  assert.equal(groupSeries + bracketSeries, EXPECTED_SERIES);

  for (const p of t.placements) {
    assert.ok(p.seriesPlayed >= 4, `${p.manager} placed ${p.place} having played only ${p.seriesPlayed} series`);
    assert.ok(p.decidedBy && /place|Final/i.test(p.decidedBy), `placement ${p.place} has no deciding game`);
    assert.ok(t.series.some(s => s.ids.includes(p.id)), 'placed build never appears in a series');
  }
  // Nobody is eliminated: every build plays at least one bracket series after
  // the group stage, so a single bad night cannot end your draft position.
  for (const p of t.placements) {
    const bracket = t.rounds.flatMap(r => r.series).filter(s => s.ids.includes(p.id));
    assert.ok(bracket.length >= 1, `${p.manager} never played a bracket series`);
  }
});

test('AC-14 the same builds and seed produce the same draft order', () => {
  const l = league();
  const a = runTournament(l, 'stable-seed');
  const b = runTournament(l, 'stable-seed');
  assert.deepEqual(a.placements.map(p => p.id), b.placements.map(p => p.id));
  assert.deepEqual(a.seeding, b.seeding);
  const c = runTournament(l, 'other-seed');
  assert.notDeepEqual(a.placements.map(p => p.id), c.placements.map(p => p.id),
    'a different seed should produce a different tournament');
});

test('AC-15 fewer than 12 builds is refused, and the message says how many are missing', () => {
  for (const n of [0, 1, 7, 11]) {
    assert.throws(() => runTournament(league().slice(0, n), 'short'), err => {
      assert.match(err.message, /exactly 12 locked builds/);
      assert.match(err.message, new RegExp(`${12 - n} still missing`));
      return true;
    }, `a league of ${n} should be refused`);
  }
  assert.throws(() => runTournament(null, 'null'), /exactly 12/);
  assert.throws(() => runTournament(league().concat(league()), 'too many'), /exactly 12/);
});

test('group stage seeds the bracket sensibly', () => {
  const t = runTournament(league(), 'seeding');
  assert.equal(t.seeding.length, 12);
  assert.equal(new Set(t.seeding).size, 12);
  for (const g of t.groups) {
    assert.equal(g.members.length, 4);
    assert.equal(g.series.length, 6, 'a four-team round robin is six series');
    assert.equal(g.table.length, 4);
    assert.equal(g.table.reduce((s, r) => s + r.w, 0), 6, 'six series produce six wins');
    for (let i = 1; i < 4; i++) assert.ok(g.table[i - 1].w >= g.table[i].w, 'table is not sorted by record');
  }
  const groupWinners = t.groups.map(g => g.table[0].id);
  for (const id of groupWinners) {
    assert.ok(t.seeding.indexOf(id) < 3, 'group winners should take the top three seeds');
  }
});

test('the stored tournament fits comfortably in one db document', () => {
  const t = runTournament(league(), 'size');
  const bytes = Buffer.byteLength(JSON.stringify(stripLogs(t)));
  assert.ok(bytes < 200_000, `stripped tournament is ${bytes} bytes, near the 256 KiB document limit`);
  assert.ok(!JSON.stringify(stripLogs(t)).includes('"log"'), 'play-by-play should not be stored');
  // ...but it must be regenerable, which is what the seeds are for.
  const s = t.series[0];
  assert.ok(s.seed && s.games.every(g => g.seed.startsWith(s.seed)));
});

test('upsets happen but favourites usually hold', () => {
  let topSeedTop4 = 0;
  const runs = 40;
  for (let i = 0; i < runs; i++) {
    const t = runTournament(league(), `upset#${i}`);
    const oneSeed = t.seeding[0];
    if (t.placements.find(p => p.id === oneSeed).place <= 4) topSeedTop4++;
  }
  const rate = topSeedTop4 / runs;
  assert.ok(rate > 0.25, `the one seed reached the top four only ${(rate*100).toFixed(0)}% of the time — too random`);
  assert.ok(rate < 0.98, 'the one seed always finishes top four — no upsets are possible');
});
