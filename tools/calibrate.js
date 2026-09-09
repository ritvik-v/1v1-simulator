// Measurement harness for the sim constants. Not a test — a microscope.
import { readFileSync } from 'node:fs';
import { simulateGame, simulateSeries } from '../src/sim.js';
import { costOf, BUDGET, SLOT_KEYS } from '../src/ratings.js';

const pool = JSON.parse(readFileSync(new URL('../data/players.json', import.meta.url))).players;
const byId = new Map(pool.map(p => [p.id, p]));

export function flat(id, v) {
  const s = k => ({ id: 'x', name: 'Flat ' + v, last: String(v), rating: v });
  return { id, manager: id, ratings: { sc: v, hnd: v, frm: v, def: v, ath: v },
           slots: { sc: s(), hnd: s(), frm: s(), def: s(), ath: s() } };
}
export function make(id, r) {
  const s = v => ({ id: 'x', name: 'X', last: 'X', rating: v });
  return { id, manager: id, ratings: r,
           slots: { sc: s(r.sc), hnd: s(r.hnd), frm: s(r.frm), def: s(r.def), ath: s(r.ath) } };
}
export function fromIds(id, ids) {
  const s = (pid, k) => { const p = byId.get(pid); return { id: pid, name: p.name, last: p.name.split(' ').slice(1).join(' '), rating: p[k] }; };
  const r = {}; const slots = {};
  for (const k of ['sc','hnd','frm','def','ath']) { const p = byId.get(ids[k]); r[k] = p[k]; slots[k] = s(ids[k], k); }
  return { id, manager: id, ratings: r, slots };
}

export const cost = r => SLOT_KEYS.reduce((s, k) => s + costOf(r[k]), 0);

// Nudge every rating by a common offset until the build sits just under the
// cap. Without this, comparing build SHAPES really compares build BUDGETS.
export function fitToBudget(shape, budget = BUDGET) {
  const apply = off => Object.fromEntries(SLOT_KEYS.map(k =>
    [k, Math.max(20, Math.min(99, Math.round(shape[k] + off)))]));
  let lo = -60, hi = 60;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (cost(apply(mid)) > budget) hi = mid; else lo = mid;
  }
  let best = apply(lo);
  // Spend the remainder on whichever slot is cheapest to improve.
  for (let guard = 0; guard < 40; guard++) {
    const opts = SLOT_KEYS.filter(k => best[k] < 99)
      .map(k => ({ k, d: costOf(best[k] + 1) - costOf(best[k]) }))
      .sort((a, b) => a.d - b.d);
    if (!opts.length || cost(best) + opts[0].d > budget) break;
    best = { ...best, [opts[0].k]: best[opts[0].k] + 1 };
  }
  return best;
}

function winRate(a, b, n, tag) {
  let w = 0, pts = [0,0], poss = 0;
  for (let i = 0; i < n; i++) {
    const g = simulateGame(a, b, `${tag}#${i}`);
    if (g.winner === 0) w++;
    pts[0] += g.score[0]; pts[1] += g.score[1]; poss += g.possessions;
  }
  return { rate: w / n, avg: [pts[0]/n, pts[1]/n], poss: poss/n };
}
function seriesRate(a, b, n, tag) {
  let w = 0;
  for (let i = 0; i < n; i++) if (simulateSeries(a, b, `${tag}#${i}`).winner === 0) w++;
  return w / n;
}
const pct = x => (x * 100).toFixed(1) + '%';

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('=== MIRROR MATCH (want ~50%, no side bias) ===');
  for (const v of [60, 70, 85, 95]) {
    const r = winRate(flat('a', v), flat('b', v), 3000, 'mirror' + v);
    console.log(` flat ${v}: A wins ${pct(r.rate)} | avg score ${r.avg[0].toFixed(1)}-${r.avg[1].toFixed(1)} | ${r.poss.toFixed(0)} poss`);
  }

  console.log('\n=== SKILL GRADIENT (flat X vs flat X-10) ===');
  for (const v of [95, 85, 75, 65]) {
    const g = winRate(flat('a', v), flat('b', v - 10), 2000, 'grad' + v);
    const s = seriesRate(flat('a', v), flat('b', v - 10), 3000, 'sgrad' + v);
    console.log(` ${v} vs ${v-10}: game ${pct(g.rate)} | series ${pct(s)} | score ${g.avg[0].toFixed(1)}-${g.avg[1].toFixed(1)}`);
  }
  console.log('\n=== SMALL EDGE (flat X vs X-5) ===');
  for (const v of [88, 80]) {
    const g = winRate(flat('a', v), flat('b', v - 5), 2000, 'sm' + v);
    console.log(` ${v} vs ${v-5}: game ${pct(g.rate)} | series ${pct(seriesRate(flat('a',v), flat('b',v-5), 800, 'sms'+v))}`);
  }

  console.log('\n=== BUILD SHAPES (all legal at 750, want none > 65%) ===');
  const shapes = Object.fromEntries(Object.entries({
    balanced:   { sc: 85, hnd: 85, frm: 85, def: 85, ath: 85 },
    sniper:     { sc: 98, hnd: 90, frm: 62, def: 62, ath: 74 },
    giant:      { sc: 74, hnd: 54, frm: 99, def: 92, ath: 76 },
    speedster:  { sc: 80, hnd: 96, frm: 58, def: 66, ath: 96 },
    lockdown:   { sc: 74, hnd: 72, frm: 84, def: 96, ath: 88 },
    bully:      { sc: 90, hnd: 64, frm: 95, def: 72, ath: 78 },
  }).map(([k, v]) => [k, fitToBudget(v)]));
  for (const [k, v] of Object.entries(shapes)) {
    console.log(' ', k.padEnd(10), SLOT_KEYS.map(s => `${s}${v[s]}`).join(' ').padEnd(32), 'cost', cost(v));
  }
  const names = Object.keys(shapes);
  const table = {};
  for (const a of names) {
    table[a] = {};
    for (const b of names) {
      if (a === b) { table[a][b] = '  -  '; continue; }
      table[a][b] = pct(winRate(make(a, shapes[a]), make(b, shapes[b]), 1200, `${a}v${b}`).rate).padStart(5);
    }
  }
  const pad = s => String(s).padEnd(10);
  console.log(' ' + pad('') + names.map(n => n.slice(0,6).padStart(6)).join(''));
  for (const a of names) console.log(' ' + pad(a) + names.map(b => table[a][b].padStart(6)).join(''));

  console.log('\n=== ACTION MIX (flat 85 mirror) ===');
  const g = simulateGame(flat('a',85), flat('b',85), 'mix');
  const mix = {};
  for (const l of g.log) mix[l.action] = (mix[l.action] || 0) + 1;
  console.log(' ', mix, `| final ${g.score.join('-')} in ${g.possessions} poss`);
}
