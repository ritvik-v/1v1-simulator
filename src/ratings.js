// Pricing and build validation.
//
// The cost curve is convex on purpose: buying a 95 should hurt roughly twice as
// much as buying an 85, not 12% more. Below ~66 the curve would produce costs
// so small they collide, so the floor is the rating itself — which keeps cost
// strictly monotonic across the whole 1..99 range (a rating that is one point
// better always costs strictly more).

export const BUDGET = 750;

export const SLOTS = [
  { key: 'sc',  label: 'Shot Creation', short: 'SC',
    blurb: 'Getting a shot off against a set defender — and making it.' },
  { key: 'hnd', label: 'Handles', short: 'HND',
    blurb: 'Ball security under pressure, change of direction, beating a hand-check.' },
  { key: 'frm', label: 'Frame', short: 'FRM',
    blurb: 'Height, length and strength. Post leverage, contest radius, rebounding.' },
  { key: 'def', label: 'Defense', short: 'DEF',
    blurb: 'On-ball containment, active hands, contesting and blocking drives.' },
  { key: 'ath', label: 'Athleticism', short: 'ATH',
    blurb: 'First step, burst, vertical, lateral quickness, conditioning.' },
];

export const SLOT_KEYS = SLOTS.map(s => s.key);

export function costOf(rating) {
  const r = Math.round(rating);
  if (!Number.isFinite(r) || r < 1 || r > 99) {
    throw new RangeError(`rating out of range: ${rating}`);
  }
  return Math.max(r, Math.round(250 * Math.pow(r / 100, 3.2)));
}

// picks: { sc: playerId, hnd: playerId, ... }
export function priceBuild(picks, pool) {
  const byId = pool instanceof Map ? pool : new Map(pool.map(p => [p.id, p]));
  let total = 0;
  const lines = [];
  for (const slot of SLOTS) {
    const id = picks?.[slot.key];
    if (!id) { lines.push({ slot: slot.key, empty: true, cost: 0 }); continue; }
    const player = byId.get(id);
    if (!player) throw new Error(`unknown player id "${id}" in slot ${slot.key}`);
    const rating = player[slot.key];
    const cost = costOf(rating);
    total += cost;
    lines.push({ slot: slot.key, playerId: id, player, rating, cost, empty: false });
  }
  return { total, lines, remaining: BUDGET - total };
}

export function validateBuild(picks, pool, budget = BUDGET) {
  const errors = [];
  const priced = priceBuild(picks, pool);
  const empty = priced.lines.filter(l => l.empty).map(l => l.slot);
  if (empty.length) {
    const names = empty.map(k => SLOTS.find(s => s.key === k).label);
    errors.push(`${empty.length} slot${empty.length > 1 ? 's' : ''} still empty: ${names.join(', ')}`);
  }
  if (priced.total > budget) {
    errors.push(`over the cap by ${priced.total - budget} (spent ${priced.total} of ${budget})`);
  }
  // Five attributes, five different players — taking a player's frame AND his
  // athleticism is just picking that player, which is not the game.
  const seen = new Map();
  for (const l of priced.lines) {
    if (l.empty) continue;
    seen.set(l.playerId, (seen.get(l.playerId) || 0) + 1);
  }
  for (const [id, n] of seen) {
    if (n > 1) {
      const player = (pool instanceof Map ? pool : new Map(pool.map(p => [p.id, p]))).get(id);
      errors.push(`${player.name} fills ${n} slots — each attribute must come from a different player`);
    }
  }
  return { ok: errors.length === 0, errors, ...priced };
}

// Turn stored picks into the shape the sim wants: ratings plus the source
// player behind each one, so the play-by-play can name names.
export function toFighter(build, pool) {
  const byId = pool instanceof Map ? pool : new Map(pool.map(p => [p.id, p]));
  const slots = {};
  const ratings = {};
  for (const slot of SLOTS) {
    const player = byId.get(build.picks[slot.key]);
    if (!player) throw new Error(`build "${build.id}" has no player in slot ${slot.key}`);
    ratings[slot.key] = player[slot.key];
    slots[slot.key] = { id: player.id, name: player.name, last: lastName(player.name), rating: player[slot.key] };
  }
  return { id: build.id, manager: build.manager, ratings, slots };
}

export function lastName(full) {
  const parts = String(full).split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : full;
}
