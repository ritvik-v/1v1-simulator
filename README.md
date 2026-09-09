# Blacktop Draft

Fantasy basketball draft order, decided by a 1v1 tournament instead of a random
number generator.

Each of twelve managers builds one custom player by buying individual attributes
from real NBA players under a shared salary cap — the shot creation of one guy,
the handle of another, the frame of a third. Builds stay hidden until all twelve
lock in. Then the app simulates a full tournament, possession by possession, and
the final standings become the draft order. First place picks first.

## The build

Five slots, 750 points, five *different* source players:

| Slot | What it covers |
|---|---|
| Shot Creation | Getting a shot off against a set defender, and making it |
| Handles | Ball security under pressure, change of direction, beating a hand-check |
| Frame | Height, length and strength — post leverage, contest radius, rebounding |
| Defense | On-ball containment, active hands, contesting and blocking drives |
| Athleticism | First step, burst, vertical, lateral quickness, conditioning |

Cost rises steeply with rating (`max(r, round(250 · (r/100)^3.2))`), so a flat-85
build spends 745 of the 750 cap and a three-elites build spends about the same.
There is no build that is simply better than the others; there are only trades.

## The ratings

144 players at their peak season, from All-NBA / All-Star / All-Defense
selections 2005-2025 plus the pre-2005 legends, in `data/players.json`.

Ratings are **hand-authored for half-court 1v1**, not copied from 2K. 2K numbers
are tuned for five-on-five, where passing and help defense carry weight they do
not have here: in 1v1 playmaking is worth nothing, rim protection is worth less,
and on-ball defense is worth much more. The file is plain JSON with a note on
every player — argue with it and edit it, that is the point.

## The tournament

Three groups of four, round robin, then a placement bracket: play-in,
quarterfinals, semifinals, final, plus full 5-8 and 9-12 consolation brackets.
38 best-of-three series. Every one of the twelve draft slots is decided by a
series somebody played — no tiebreak formulas, and nobody's night ends after one
loss.

Games are first to 11, win by two, hard cap 21, make-it-take-it, 1s and 2s. Every
game is a pure function of its seed, so any result can be replayed possession by
possession and audited.

## Balance

The engine is calibrated against the acceptance criteria in `factory/SPEC.md`:

- identical builds win 49-52% of games (no side bias)
- a build 10 points better everywhere wins 86-88% of best-of-three series —
  skill dominates, upsets stay possible
- no build shape beats another more than 63% of the time once cost is held equal

Run `npm run calibrate` to see the numbers for yourself.

## Use

```bash
npm test        # 30 tests, no dependencies
npm run build   # regenerate app.html from src/ + data/ + web/
npm run calibrate
```

`app.html` is the whole app in one file — the ratings table, the simulator and
the tournament are all inlined. Published as a Claude Artifact it syncs the
league live across twelve devices. A shared artifact link only works for people
signed in to the same Claude organization, so managers outside it can build on
their own device and text the commissioner a **build code**
(`BD4-curry16.kyrie17.gobert21.bowen05.marion06`) to paste in.

## Layout

```
data/players.json   the ratings table
src/ratings.js      cost curve, pricing, build validation
src/sim.js          the possession engine
src/tournament.js   groups, bracket, placement
web/                page source
tools/build.js      inlines everything into app.html
factory/            SPEC (the contract), PLAN (the slices), STATE (the run)
```

Built with the [factory](https://github.com/ritvik-v/factory) workflow.
