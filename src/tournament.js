// Three groups of four, round robin, then a full placement bracket.
//
// The design constraint that shapes all of this: we need positions 1 through 12,
// not a champion. So every placement is decided by a series someone actually
// played. Nobody's night ends after one loss, and no draft slot is settled by a
// tiebreak formula.

import { rng, hashSeed, simulateSeries } from './sim.js';

export const GROUP_NAMES = ['A', 'B', 'C'];
export const EXPECTED_SERIES = 38; // 18 group + 20 bracket

function shuffled(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Point differential is always counted from the perspective of `id`.
function diffFor(series, id) {
  const idx = series.ids.indexOf(id);
  return series.games.reduce((s, g) => s + (g.score[idx] - g.score[1 - idx]), 0);
}

function standings(memberIds, seriesList) {
  const rows = memberIds.map(id => ({ id, w: 0, l: 0, diff: 0, beat: new Set() }));
  const by = new Map(rows.map(r => [r.id, r]));
  for (const s of seriesList) {
    const win = by.get(s.winnerId), lose = by.get(s.loserId);
    win.w++; lose.l++;
    win.beat.add(s.loserId);
    win.diff += diffFor(s, s.winnerId);
    lose.diff += diffFor(s, s.loserId);
  }
  rows.sort((a, b) => {
    if (b.w !== a.w) return b.w - a.w;
    if (a.beat.has(b.id) !== b.beat.has(a.id)) return a.beat.has(b.id) ? -1 : 1; // head-to-head
    if (b.diff !== a.diff) return b.diff - a.diff;
    return a.id < b.id ? -1 : 1; // deterministic final fallback
  });
  return rows.map(({ beat, ...r }) => r);
}

export function runTournament(fighters, seedStr = 'draft-2026', opts = {}) {
  if (!Array.isArray(fighters) || fighters.length !== 12) {
    const n = Array.isArray(fighters) ? fighters.length : 0;
    throw new Error(`the tournament needs exactly 12 locked builds — ${n} present, ${12 - n} still missing`);
  }
  const rand = rng(hashSeed(seedStr));
  const byId = new Map(fighters.map(f => [f.id, f]));
  const F = id => byId.get(id);
  const all = [];
  let n = 0;
  const play = (aId, bId, label, round) => {
    const s = simulateSeries(F(aId), F(bId), `${seedStr}|${label}|${n++}`);
    s.key = label; s.round = round;
    all.push(s);
    return s;
  };

  // --- Group stage -------------------------------------------------------
  const order = shuffled(fighters.map(f => f.id), rand);
  const groups = GROUP_NAMES.map((name, gi) => {
    const members = [order[gi], order[gi + 3], order[gi + 6], order[gi + 9]];
    const series = [];
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++)
        series.push(play(members[i], members[j], `group${name}-${i}${j}`, `Group ${name}`));
    return { name, members, series, table: standings(members, series) };
  });

  // --- Global seeding ----------------------------------------------------
  // Group winners take seeds 1-3, runners-up 4-6, and so on, each tier sorted
  // by record then point differential.
  const seeding = [];
  for (let pos = 0; pos < 4; pos++) {
    const tier = groups.map(g => ({ ...g.table[pos], group: g.name }));
    tier.sort((a, b) => (b.w - a.w) || (b.diff - a.diff) || (a.id < b.id ? -1 : 1));
    seeding.push(...tier.map(t => t.id));
  }
  const seedOf = id => seeding.indexOf(id) + 1;
  const S = k => seeding[k - 1]; // 1-indexed seed lookup

  // --- Bracket -----------------------------------------------------------
  const rounds = [];
  const addRound = (id, name, series) => { rounds.push({ id, name, series }); return series; };

  const r1 = addRound('r1', 'Play-In', [
    play(S(5), S(12), 'r1-a', 'Play-In'),
    play(S(6), S(11), 'r1-b', 'Play-In'),
    play(S(7), S(10), 'r1-c', 'Play-In'),
    play(S(8), S(9),  'r1-d', 'Play-In'),
  ]);

  const qf = addRound('qf', 'Quarterfinals', [
    play(S(1), r1[3].winnerId, 'qf-a', 'Quarterfinals'),
    play(S(2), r1[2].winnerId, 'qf-b', 'Quarterfinals'),
    play(S(3), r1[1].winnerId, 'qf-c', 'Quarterfinals'),
    play(S(4), r1[0].winnerId, 'qf-d', 'Quarterfinals'),
  ]);

  const sf = addRound('sf', 'Semifinals', [
    play(qf[0].winnerId, qf[3].winnerId, 'sf-a', 'Semifinals'),
    play(qf[1].winnerId, qf[2].winnerId, 'sf-b', 'Semifinals'),
  ]);

  const final = addRound('final', 'Final', [play(sf[0].winnerId, sf[1].winnerId, 'final', 'Final')])[0];
  const third = addRound('third', 'Third-Place Game',
    [play(sf[0].loserId, sf[1].loserId, 'third', 'Third-Place Game')])[0];

  // Consolation brackets: quarterfinal losers settle 5-8, play-in losers 9-12.
  const consol = (losers, tag, name, hiName, loName) => {
    const semis = addRound(tag + '-sf', name, [
      play(losers[0], losers[3], tag + '-sf-a', name),
      play(losers[1], losers[2], tag + '-sf-b', name),
    ]);
    const hi = addRound(tag + '-hi', hiName,
      [play(semis[0].winnerId, semis[1].winnerId, tag + '-hi', hiName)])[0];
    const lo = addRound(tag + '-lo', loName,
      [play(semis[0].loserId, semis[1].loserId, tag + '-lo', loName)])[0];
    return [hi.winnerId, hi.loserId, lo.winnerId, lo.loserId];
  };

  const p5to8   = consol(qf.map(s => s.loserId), 'c58', 'Fifth-Place Bracket',
                         'Fifth-Place Game', 'Seventh-Place Game');
  const p9to12  = consol(r1.map(s => s.loserId), 'c912', 'Ninth-Place Bracket',
                         'Ninth-Place Game', 'Eleventh-Place Game');

  const orderIds = [
    final.winnerId, final.loserId, third.winnerId, third.loserId,
    ...p5to8, ...p9to12,
  ];

  const decidedBy = {
    1: 'Won the Final', 2: 'Lost the Final',
    3: 'Won the third-place game', 4: 'Lost the third-place game',
    5: 'Won the fifth-place game', 6: 'Lost the fifth-place game',
    7: 'Won the seventh-place game', 8: 'Lost the seventh-place game',
    9: 'Won the ninth-place game', 10: 'Lost the ninth-place game',
    11: 'Won the eleventh-place game', 12: 'Lost the eleventh-place game',
  };

  const placements = orderIds.map((id, i) => {
    const played = all.filter(s => s.ids.includes(id));
    const w = played.filter(s => s.winnerId === id).length;
    return {
      place: i + 1, pick: i + 1, id, manager: F(id).manager,
      seed: seedOf(id),
      group: groups.find(g => g.members.includes(id)).name,
      record: `${w}-${played.length - w}`,
      seriesPlayed: played.length,
      decidedBy: decidedBy[i + 1],
    };
  });

  return { seed: seedStr, groups, seeding, rounds, placements, series: all,
           seriesCount: all.length };
}

// Play-by-play is regenerated from seeds on demand, so the stored tournament
// stays small enough for one db document.
export function stripLogs(t) {
  const lean = s => ({
    key: s.key, round: s.round, ids: s.ids, managers: s.managers,
    wins: s.wins, winnerId: s.winnerId, loserId: s.loserId, seed: s.seed,
    scores: s.games.map(g => g.score),
  });
  return {
    seed: t.seed, seeding: t.seeding, placements: t.placements,
    seriesCount: t.seriesCount,
    groups: t.groups.map(g => ({ name: g.name, members: g.members, table: g.table,
                                 series: g.series.map(lean) })),
    rounds: t.rounds.map(r => ({ id: r.id, name: r.name, series: r.series.map(lean) })),
  };
}
