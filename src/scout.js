// Scouting: run a build against opponents many times and report what happened.
//
// A single game tells you almost nothing — the engine is stochastic by design.
// Several hundred games tell you whether a build is actually good, and reading
// the play-by-play back tells you WHY, which is the part you can act on.

import { simulateGame, simulateSeries } from './sim.js';
import { SLOT_KEYS, SLOTS, costOf, priceBuild } from './ratings.js';

export const DEFAULT_RUNS = 400;

// One head-to-head, aggregated.
export function headToHead(a, b, runs = DEFAULT_RUNS, seedStr = 'scout') {
  const stat = () => ({ pts: 0, jumper: 0, drive: 0, post: 0, made: 0, shots: 0,
                        turnovers: 0, blocked: 0, oreb: 0, clean: 0, blowby: 0 });
  const s = [stat(), stat()];
  let wins = 0, poss = 0, seriesWins = 0;
  const scores = [0, 0];

  for (let i = 0; i < runs; i++) {
    const g = simulateGame(a, b, `${seedStr}#${i}`);
    if (g.winner === 0) wins++;
    scores[0] += g.score[0]; scores[1] += g.score[1];
    poss += g.possessions;
    for (const l of g.log) {
      const t = s[l.off];
      t.pts += l.pts;
      if (l.action === 'turnover') { t.turnovers++; continue; }
      if (l.action === 'block') { t.blocked++; continue; }
      t.shots++; t[l.action]++;
      if (l.pts) t.made++;
      if (l.reb === 'off') t.oreb++;
      if (l.flag === 'clean') t.clean++;
      if (l.flag === 'blowby') t.blowby++;
    }
  }
  for (let i = 0; i < Math.ceil(runs / 4); i++) {
    if (simulateSeries(a, b, `${seedStr}-bo3#${i}`).winner === 0) seriesWins++;
  }

  const per = t => ({
    ppg: t.pts / runs,
    fg: t.shots ? t.made / t.shots : 0,
    mix: { jumper: t.shots ? t.jumper / t.shots : 0, drive: t.shots ? t.drive / t.shots : 0,
           post: t.shots ? t.post / t.shots : 0 },
    turnovers: t.turnovers / runs, blocked: t.blocked / runs, oreb: t.oreb / runs,
    cleanRate: t.jumper ? t.clean / t.jumper : 0,
    blowbyRate: t.drive ? t.blowby / t.drive : 0,
  });

  return {
    runs, winRate: wins / runs, seriesRate: seriesWins / Math.ceil(runs / 4),
    avgScore: [scores[0] / runs, scores[1] / runs],
    possessions: poss / runs,
    you: per(s[0]), them: per(s[1]),
  };
}

// The headline number: how the build holds up across a spread of archetypes.
export function gauntlet(fighter, opponents, runs = 200, seedStr = 'gauntlet') {
  const rows = opponents.map(o => {
    const h = headToHead(fighter, o, runs, `${seedStr}|${o.id}`);
    return { id: o.id, name: o.manager, winRate: h.winRate,
             avgScore: h.avgScore, possessions: h.possessions };
  });
  const overall = rows.reduce((s, r) => s + r.winRate, 0) / rows.length;
  const sorted = [...rows].sort((x, y) => y.winRate - x.winRate);
  return { rows, overall, best: sorted[0], worst: sorted[sorted.length - 1] };
}

// Which of the five picks is actually carrying the build? Replace one slot with
// a replacement-level player and see how far the win rate falls. A slot worth
// almost nothing is a slot you are overpaying for.
export const REPLACEMENT = 68;

export function leverage(build, pool, opponents, toFighter, runs = 120, seedStr = 'lev') {
  const byId = pool instanceof Map ? pool : new Map(pool.map(p => [p.id, p]));
  const base = gauntlet(toFighter(build, pool), opponents, runs, seedStr + '|base').overall;
  const used = new Set(Object.values(build.picks));

  return SLOTS.map(slot => {
    // Cheapest player near replacement level who is not already in the build.
    const filler = [...byId.values()]
      .filter(p => !used.has(p.id) || p.id === build.picks[slot.key])
      .reduce((best, p) => Math.abs(p[slot.key] - REPLACEMENT) <
                           Math.abs(best[slot.key] - REPLACEMENT) ? p : best);
    const swapped = { ...build, picks: { ...build.picks, [slot.key]: filler.id } };
    const after = gauntlet(toFighter(swapped, pool), opponents, runs, seedStr + '|' + slot.key).overall;
    const current = byId.get(build.picks[slot.key]);
    return {
      slot: slot.key, label: slot.label,
      player: current.name, rating: current[slot.key], cost: costOf(current[slot.key]),
      swapTo: filler.name, swapRating: filler[slot.key],
      drop: base - after,
      perPoint: (base - after) / Math.max(1, costOf(current[slot.key]) - costOf(filler[slot.key])),
    };
  }).sort((a, b) => b.drop - a.drop);
}

export function grade(overall) {
  const o = overall * 100;
  return o >= 65 ? 'Strong' : o >= 52 ? 'Solid' : o >= 45 ? 'Middling' : 'Struggling';
}

// Plain-language read on a set of gauntlet results.
export function readout(g, h) {
  const pct = x => Math.round(x * 100);
  const lines = [];
  const o = pct(g.overall);
  lines.push(`${grade(g.overall)} — wins ${o}% across the field.`);
  lines.push(`Best matchup: ${g.best.name} (${pct(g.best.winRate)}%). Worst: ${g.worst.name} (${pct(g.worst.winRate)}%).`);
  if (h) {
    const m = h.you.mix;
    const top = m.jumper >= m.drive && m.jumper >= m.post ? 'jumpers'
              : m.drive >= m.post ? 'drives' : 'post-ups';
    lines.push(`Your offense runs through ${top} (${pct(Math.max(m.jumper, m.drive, m.post))}% of shots), shooting ${pct(h.you.fg)}%.`);
    if (h.you.turnovers > h.them.turnovers * 1.4) {
      lines.push(`Ball security is a problem — you cough it up ${h.you.turnovers.toFixed(1)} times a game to their ${h.them.turnovers.toFixed(1)}.`);
    }
    if (h.them.cleanRate > 0.45) {
      lines.push(`You are giving up clean looks on ${pct(h.them.cleanRate)}% of their jumpers — that is a closeout problem.`);
    }
    if (h.you.oreb > h.them.oreb * 1.4) {
      lines.push(`Your frame is winning the glass: ${h.you.oreb.toFixed(1)} second chances a game.`);
    }
  }
  return lines;
}

/* ── Who did you just build? ───────────────────────────────────────────────
   Root-mean-square difference across the five ratings. The scale is anchored
   on measurement, not taste: two randomly drawn players in this pool sit at
   RMS 18.2, so that distance is defined as a 50% match — "no more alike than
   two players picked at random". */
export const MATCH_SCALE = 36;

export function profileDistance(a, b) {
  return Math.sqrt(SLOT_KEYS.reduce((s, k) => s + Math.pow(a[k] - b[k], 2), 0) / SLOT_KEYS.length);
}

export function matchPct(distance) {
  return Math.max(0, Math.min(1, 1 - distance / MATCH_SCALE));
}

function ratingsOf(picks, byId) {
  const r = {};
  for (const k of SLOT_KEYS) r[k] = byId.get(picks[k])[k];
  return r;
}

export function buildRatings(picks, pool) {
  return ratingsOf(picks, pool instanceof Map ? pool : new Map(pool.map(p => [p.id, p])));
}

// Closest real players by raw profile. The build's own five sources are
// excluded from being their own comp only where they would be trivially close
// on one axis — they are still eligible, because "you basically built Kawhi"
// is a true and useful thing to say.
export function comps(ratings, pool, n = 4) {
  return pool
    .map(p => { const d = profileDistance(ratings, p); return { player: p, distance: d, match: matchPct(d) }; })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n);
}

// Which archetype is this, and how cleanly? `archetypes` is [{name, ratings}].
export function archetypeOf(ratings, archetypes) {
  const scored = archetypes
    .map(a => { const d = profileDistance(ratings, a.ratings); return { name: a.name, tag: a.tag, distance: d, match: matchPct(d) }; })
    .sort((a, b) => a.distance - b.distance);
  return { best: scored[0], runnerUp: scored[1], all: scored };
}

// How lopsided is the build? Useful copy: a flat build and a spiky one that
// cost the same play very differently.
export function shape(ratings) {
  const vals = SLOT_KEYS.map(k => ratings[k]);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length);
  const top = SLOT_KEYS.reduce((a, k) => ratings[k] > ratings[a] ? k : a, SLOT_KEYS[0]);
  const bottom = SLOT_KEYS.reduce((a, k) => ratings[k] < ratings[a] ? k : a, SLOT_KEYS[0]);
  return { mean, sd, top, bottom, spread: Math.max(...vals) - Math.min(...vals) };
}
