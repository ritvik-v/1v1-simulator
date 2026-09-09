// The possession engine.
//
// Half-court 1v1: first to 11, win by 2, hard cap 21, make-it-take-it, 1s and
// 2s. Every game is a pure function of its seed string, so any result in the
// tournament can be replayed and audited rather than taken on faith.

export const TARGET = 11;
export const HARD_CAP = 21;

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const norm = r => (r - 70) / 15;
const logistic = x => 1 / (1 + Math.exp(-x));

// Tuned constants. See test/balance.test.js — these are not arbitrary; each one
// is pinned by a criterion in factory/SPEC.md.
const K = {
  toBase: -1.95, toK: 0.37,
  choiceTemp: 1.15, driveBias: 0.26, jumpBias: 0.30, postBias: -0.48,
  driveBase: 0.20, driveK: 0.245,
  jumpBase: -0.60, jumpK: 0.263,
  postBase: 0.12, postK: 0.217,
  blockBase: -2.60, blockK: 0.42, blockEvade: 0.34,
  orebBase: -1.28, orebK: 0.24,
  sepBase: -1.40, sepK: 0.72, sepBonus: 0.62,
  cleanBase: -1.35, cleanK: 0.85,
  fatigueStart: 14, fatiguePer: 0.018, fatigueCap: 1.10,
};

function drag(poss, ath) {
  const raw = Math.max(0, poss - K.fatigueStart) * K.fatiguePer
            * Math.max(0.15, 1 - (ath - 45) / 60);
  return Math.min(K.fatigueCap, raw);
}

function view(fighter, poss) {
  const r = fighter.ratings;
  const d = drag(poss, r.ath);
  return {
    sc: norm(r.sc) - d,
    hnd: norm(r.hnd) - d,
    frm: norm(r.frm),              // size does not get tired
    def: norm(r.def) - d,
    ath: norm(r.ath) - d * 1.5,    // burst degrades fastest
  };
}

function pick3(rand, w) {
  const total = w[0] + w[1] + w[2];
  let x = rand() * total;
  if ((x -= w[0]) < 0) return 0;
  if ((x -= w[1]) < 0) return 1;
  return 2;
}

export function simulateGame(fighterA, fighterB, seedStr) {
  const rand = rng(hashSeed(seedStr));
  const F = [fighterA, fighterB];
  const score = [0, 0];
  const log = [];
  let off = rand() < 0.5 ? 0 : 1;
  let poss = 0;
  const opening = `${F[off].manager} wins the check and takes it out first.`;

  const push = (action, text, pts) => {
    log.push({
      n: poss, off, offName: F[off].manager, action, text,
      pts: pts || 0, score: [score[0], score[1]],
    });
  };

  while (true) {
    poss++;
    if (poss > 400) break; // structural guard; never reached in practice
    const def = 1 - off;
    const O = F[off], D = F[def];
    const o = view(O, poss), d = view(D, poss);
    const S = O.slots, T = D.slots;

    // 1. Ball pressure.
    const pressure = 0.65 * d.def + 0.35 * d.ath;
    const security = 0.70 * o.hnd + 0.30 * o.ath;
    if (rand() < logistic(K.toBase + K.toK * (pressure - security))) {
      push('turnover', `${S.hnd.last}-handle gets picked clean by the ${T.def.last}-hands. Turnover.`, 0);
      off = def;
      continue;
    }

    // 2. Shot selection.
    const driveSep = (0.55 * o.ath + 0.45 * o.hnd) - (0.60 * d.def + 0.40 * d.ath);
    const driveU = driveSep + K.driveBias;
    const jumpU  = o.sc - (0.50 * d.def + 0.30 * d.frm) + K.jumpBias;
    const postU  = (0.60 * o.frm + 0.40 * o.sc) - (0.70 * d.frm + 0.30 * d.def) + K.postBias;
    const w = [driveU, jumpU, postU].map(u => Math.exp(K.choiceTemp * u));
    const choice = pick3(rand, w);

    let made = false, pts = 0, action, text;

    if (choice === 0) {
      // DRIVE — worth 1. A big enough quickness edge produces a clean blow-by:
      // no help exists in 1v1, so beating your man IS the whole play. This is
      // what gives speed builds a lane against size.
      const separation = rand() < logistic(K.sepBase + K.sepK * driveSep);
      if (!separation) {
        const evade = 0.50 * o.ath + 0.30 * o.frm + 0.20 * o.hnd;
        const wall = 0.55 * d.frm + 0.45 * d.def;
        if (rand() < logistic(K.blockBase + K.blockK * wall - K.blockEvade * evade)) {
          push('block', `${S.ath.last}-first-step gets downhill — ${T.frm.last}-length meets him at the rim. BLOCKED.`, 0);
          off = def;
          continue;
        }
      }
      const att = 0.46 * o.ath + 0.30 * o.sc + 0.12 * o.frm + 0.12 * o.hnd;
      const dfn = 0.62 * d.def + 0.38 * d.frm;
      made = rand() < logistic(K.driveBase + K.driveK * (att - dfn) + (separation ? K.sepBonus : 0));
      pts = made ? 1 : 0;
      action = 'drive';
      text = separation
        ? (made
          ? `${S.hnd.last}-handle shakes ${T.def.last} clean off the dribble — uncontested at the rim. Good.`
          : `${S.hnd.last}-handle gets all the way by, but rushes it. In and out.`)
        : (made
          ? `${S.ath.last}-burst gets downhill and finishes over ${T.frm.last}-length. Good.`
          : `${S.ath.last}-burst attacks the rim, ${T.def.last}-contest is right there. Off the iron.`);
    } else if (choice === 1) {
      // JUMPER — worth 2. Whether it is contested at all is a race between the
      // shooter's release and the defender's closeout, which is why the check
      // below reads athleticism rather than length: a slow-footed giant cannot
      // contest a quick trigger no matter how long his arms are.
      const jumpSep = o.sc - (0.55 * d.def + 0.45 * d.ath);
      const clean = rand() < logistic(K.cleanBase + K.cleanK * jumpSep);
      const att = 0.82 * o.sc + 0.18 * o.hnd;
      const dfn = clean ? (0.30 * d.def + 0.12 * d.frm) : (0.74 * d.def + 0.26 * d.frm);
      made = rand() < logistic(K.jumpBase + K.jumpK * (att - dfn));
      pts = made ? 2 : 0;
      action = 'jumper';
      text = clean
        ? (made
          ? `${S.sc.last}-release is up before ${T.ath.last} can close out. Nothing but net. Two.`
          : `${S.sc.last}-jumper, wide open, ${T.ath.last} nowhere near the closeout. Rattles out.`)
        : (made
          ? `${S.hnd.last}-handle creates the sliver of space, ${S.sc.last}-jumper rises over ${T.frm.last}-length. Wet. Two.`
          : `${S.sc.last}-jumper goes up contested by the ${T.def.last}-hand. Front rim.`);
    } else {
      // POST — worth 1.
      const att = 0.55 * o.frm + 0.45 * o.sc;
      const dfn = 0.62 * d.frm + 0.38 * d.def;
      made = rand() < logistic(K.postBase + K.postK * (att - dfn));
      pts = made ? 1 : 0;
      action = 'post';
      text = made
        ? `${S.frm.last}-frame backs ${T.frm.last} down to the block and finishes through the bump. Good.`
        : `${S.frm.last}-frame works the block, ${T.frm.last}-strength holds ground. Fadeaway is short.`;
    }

    if (made) {
      score[off] = Math.min(HARD_CAP, score[off] + pts);
      push(action, text, pts);
      const lead = score[off] - score[def];
      if ((score[off] >= TARGET && lead >= 2) || score[off] >= HARD_CAP) break;
      continue; // make it, take it
    }

    // 3. Miss — live ball.
    const oreb = (0.55 * o.frm + 0.45 * o.ath) - (0.55 * d.frm + 0.45 * d.ath);
    if (rand() < logistic(K.orebBase + K.orebK * oreb)) {
      push(action, `${text} ${S.frm.last}-frame rips his own miss back down. Reset.`, 0);
    } else {
      push(action, `${text} ${T.frm.last}-frame boxes out and secures it.`, 0);
      off = def;
    }
  }

  const winner = score[0] > score[1] ? 0 : 1;
  return {
    seed: seedStr,
    fighters: [fighterA.id, fighterB.id],
    managers: [fighterA.manager, fighterB.manager],
    score: [score[0], score[1]],
    winner,
    winnerId: F[winner].id,
    loserId: F[1 - winner].id,
    possessions: poss,
    opening,
    log,
  };
}

// Best-of-three. The series seed derives every game seed, so a whole series is
// reproducible from one string.
export function simulateSeries(fighterA, fighterB, seedStr) {
  const games = [];
  const wins = [0, 0];
  for (let g = 1; g <= 3; g++) {
    const game = simulateGame(fighterA, fighterB, `${seedStr}|g${g}`);
    games.push(game);
    wins[game.winner]++;
    if (wins[game.winner] === 2) break;
  }
  const winner = wins[0] > wins[1] ? 0 : 1;
  return {
    seed: seedStr,
    managers: [fighterA.manager, fighterB.manager],
    ids: [fighterA.id, fighterB.id],
    games,
    wins,
    winner,
    winnerId: [fighterA, fighterB][winner].id,
    loserId: [fighterA, fighterB][1 - winner].id,
    pointDiff: games.reduce((s, g) => s + (g.score[0] - g.score[1]), 0),
  };
}
