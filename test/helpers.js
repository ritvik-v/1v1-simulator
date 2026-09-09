import { readFileSync } from 'node:fs';
import { SLOT_KEYS, costOf, BUDGET } from '../src/ratings.js';

export const POOL = JSON.parse(readFileSync(new URL('../data/players.json', import.meta.url))).players;
export const BY_ID = new Map(POOL.map(p => [p.id, p]));

export function fighter(id, r) {
  const s = v => ({ id: 'x', name: 'Test Player', last: 'Test', rating: v });
  return { id, manager: id, ratings: { ...r },
           slots: Object.fromEntries(SLOT_KEYS.map(k => [k, s(r[k])])) };
}
export const flat = (id, v) => fighter(id, Object.fromEntries(SLOT_KEYS.map(k => [k, v])));
export const cost = r => SLOT_KEYS.reduce((s, k) => s + costOf(r[k]), 0);

export function fitToBudget(shape, budget = BUDGET) {
  const apply = off => Object.fromEntries(SLOT_KEYS.map(k =>
    [k, Math.max(20, Math.min(99, Math.round(shape[k] + off)))]));
  let lo = -60, hi = 60;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (cost(apply(m)) > budget) hi = m; else lo = m; }
  let best = apply(lo);
  for (let g = 0; g < 40; g++) {
    const opts = SLOT_KEYS.filter(k => best[k] < 99)
      .map(k => ({ k, d: costOf(best[k] + 1) - costOf(best[k]) })).sort((a, b) => a.d - b.d);
    if (!opts.length || cost(best) + opts[0].d > budget) break;
    best = { ...best, [opts[0].k]: best[opts[0].k] + 1 };
  }
  return best;
}

// Twelve distinct, cap-legal builds drawn from the real pool — the closest
// thing to a real league the tests can construct.
export function league(seedOffset = 0) {
  const shapes = [
    { sc: 99, hnd: 97, frm: 62, def: 62, ath: 74 }, { sc: 74, hnd: 54, frm: 99, def: 92, ath: 76 },
    { sc: 80, hnd: 96, frm: 58, def: 66, ath: 96 }, { sc: 74, hnd: 72, frm: 84, def: 96, ath: 88 },
    { sc: 90, hnd: 64, frm: 95, def: 72, ath: 78 }, { sc: 85, hnd: 85, frm: 85, def: 85, ath: 85 },
    { sc: 92, hnd: 88, frm: 70, def: 70, ath: 80 }, { sc: 70, hnd: 60, frm: 92, def: 88, ath: 86 },
    { sc: 88, hnd: 80, frm: 80, def: 76, ath: 76 }, { sc: 66, hnd: 90, frm: 72, def: 90, ath: 84 },
    { sc: 94, hnd: 74, frm: 88, def: 60, ath: 68 }, { sc: 78, hnd: 78, frm: 78, def: 92, ath: 92 },
  ];
  return shapes.map((sh, i) => fighter(`mgr${i + 1 + seedOffset}`, fitToBudget(sh)));
}
