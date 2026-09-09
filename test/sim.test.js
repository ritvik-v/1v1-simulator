import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateGame, simulateSeries, TARGET, HARD_CAP } from '../src/sim.js';
import { flat, fighter, fitToBudget, cost, league } from './helpers.js';
import { BUDGET } from '../src/ratings.js';

test('AC-6 same builds and same seed produce a byte-identical game', () => {
  const a = flat('a', 84), b = flat('b', 79);
  const g1 = simulateGame(a, b, 'repeat-me');
  const g2 = simulateGame(a, b, 'repeat-me');
  assert.deepEqual(g1.score, g2.score);
  assert.equal(JSON.stringify(g1.log), JSON.stringify(g2.log));
  assert.notEqual(JSON.stringify(g1.log), JSON.stringify(simulateGame(a, b, 'different').log));
});

test('AC-8 every game ends on a legal scoreline', () => {
  const a = flat('a', 88), b = flat('b', 62);
  for (let i = 0; i < 400; i++) {
    for (const [x, y] of [[a, b], [b, a]]) {
      const g = simulateGame(x, y, `legal#${i}`);
      const w = g.score[g.winner], l = g.score[1 - g.winner];
      assert.ok(w > l, `winner ${w} did not outscore loser ${l}`);
      assert.ok(w >= TARGET, `winner finished on ${w}, below the ${TARGET} target`);
      assert.ok(w - l >= 2 || w === HARD_CAP,
        `won ${w}-${l}: neither a two-point margin nor the ${HARD_CAP} hard cap`);
      assert.ok(w <= HARD_CAP && l <= HARD_CAP, `score exceeded the hard cap: ${w}-${l}`);
    }
  }
});

test('AC-11 play-by-play names the build, the action and the outcome, and replays to the final score', () => {
  const a = fighter('a', { sc: 92, hnd: 84, frm: 70, def: 66, ath: 80 });
  const b = fighter('b', { sc: 70, hnd: 66, frm: 94, def: 88, ath: 72 });
  for (let i = 0; i < 60; i++) {
    const g = simulateGame(a, b, `pbp#${i}`);
    const replay = [0, 0];
    for (const line of g.log) {
      assert.ok(['turnover', 'block', 'drive', 'jumper', 'post'].includes(line.action),
        `unknown action "${line.action}"`);
      assert.ok([0, 1].includes(line.off), 'line does not identify the acting build');
      assert.equal(line.offName, [a, b][line.off].manager);
      assert.ok(line.text.length > 20, `line ${line.n} has no readable outcome: "${line.text}"`);
      replay[line.off] += line.pts;
      assert.deepEqual(line.score, [replay[0], replay[1]],
        `running score drifted at possession ${line.n}`);
    }
    assert.deepEqual(g.score, replay, 'replayed log does not reproduce the final score');
    assert.equal(g.log.length, g.possessions);
  }
});

test('AC-7 identical builds win half the time — the engine has no side bias', () => {
  for (const v of [65, 85, 95]) {
    let w = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) if (simulateGame(flat('a', v), flat('b', v), `mirror${v}#${i}`).winner === 0) w++;
    const rate = w / n;
    assert.ok(rate >= 0.45 && rate <= 0.55,
      `flat-${v} mirror: side A won ${(rate * 100).toFixed(1)}%, want 45-55%`);
  }
});

test('AC-9 a +10 build wins most series but not all of them', () => {
  for (const v of [95, 85, 75]) {
    let w = 0;
    const n = 1200;
    for (let i = 0; i < n; i++)
      if (simulateSeries(flat('a', v), flat('b', v - 10), `grad${v}#${i}`).winner === 0) w++;
    const rate = w / n;
    assert.ok(rate >= 0.70 && rate <= 0.92,
      `${v} vs ${v - 10}: stronger build won ${(rate * 100).toFixed(1)}% of series, want 70-92%`);
  }
});

test('AC-10 no build shape is degenerate once cost is held equal', () => {
  const shapes = {
    balanced:  { sc: 85, hnd: 85, frm: 85, def: 85, ath: 85 },
    sniper:    { sc: 99, hnd: 97, frm: 62, def: 62, ath: 74 },
    giant:     { sc: 74, hnd: 54, frm: 99, def: 92, ath: 76 },
    speedster: { sc: 80, hnd: 96, frm: 58, def: 66, ath: 96 },
    lockdown:  { sc: 74, hnd: 72, frm: 84, def: 96, ath: 88 },
    bully:     { sc: 90, hnd: 64, frm: 95, def: 72, ath: 78 },
  };
  const fitted = Object.fromEntries(Object.entries(shapes).map(([k, v]) => [k, fitToBudget(v)]));
  for (const [k, v] of Object.entries(fitted)) {
    assert.ok(cost(v) <= BUDGET, `${k} is over the cap at ${cost(v)}`);
    assert.ok(cost(v) >= BUDGET - 12, `${k} only spends ${cost(v)} — not a fair comparison`);
  }
  const names = Object.keys(fitted);
  for (const a of names) for (const b of names) {
    if (a === b) continue;
    let w = 0; const n = 1000;
    for (let i = 0; i < n; i++)
      if (simulateGame(fighter(a, fitted[a]), fighter(b, fitted[b]), `${a}v${b}#${i}`).winner === 0) w++;
    const rate = w / n;
    assert.ok(rate <= 0.65, `${a} beats ${b} ${(rate * 100).toFixed(1)}% of the time — degenerate`);
  }
});

test('a best-of-three ends 2-0 or 2-1 and never plays a dead game', () => {
  const l = league();
  for (let i = 0; i < 200; i++) {
    const s = simulateSeries(l[i % 12], l[(i + 5) % 12], `bo3#${i}`);
    assert.equal(Math.max(...s.wins), 2);
    assert.ok(s.games.length === 2 || s.games.length === 3);
    assert.equal(s.games.length, s.wins[0] + s.wins[1]);
  }
});

test('conditioning matters: a low-athleticism build fades in long games', () => {
  // Same total profile, athleticism traded against shot creation.
  const fresh = fighter('fresh', { sc: 80, hnd: 80, frm: 80, def: 80, ath: 92 });
  const gassed = fighter('gassed', { sc: 88, hnd: 80, frm: 80, def: 80, ath: 60 });
  let earlyLead = 0, lateLead = 0;
  for (let i = 0; i < 600; i++) {
    const g = simulateGame(fresh, gassed, `gas#${i}`);
    const at = n => { const l = g.log.filter(x => x.n <= n).at(-1); return l ? l.score[0] - l.score[1] : 0; };
    earlyLead += at(10); lateLead += g.score[0] - g.score[1];
  }
  assert.ok(lateLead / 600 > earlyLead / 600,
    'the better-conditioned build should extend its margin as the game goes on');
});
