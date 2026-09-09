# Spec: 1v1 Simulator — Fantasy Draft Order
created: 2026-09-09
status: approved

## What we're building

A web app that decides fantasy basketball draft order for a 12-person league
through a 1v1 tournament. Each manager builds a custom player by buying
individual attributes from real NBA players under a shared salary cap — the
jump shot of one guy, the frame of another, the defense of a third. Builds are
hidden until all 12 lock in. Then the app simulates a full tournament,
possession by possession with live play-by-play, and the final standings become
the draft order: 1st place picks 1st.

The point is to put *skill* into a process that is normally a random number
generator, without making it a pure spreadsheet exercise.

## Who it's for and what they get

Twelve people in a fantasy basketball league, one of whom is the commissioner.
Managers get a link, a build screen, and a tournament to watch. The commissioner
gets a defensible 1-through-12 draft order that nobody can call rigged, because
every placement was decided by games and every game is reproducible from a seed.

## Not in this version

- No accounts, passwords, or real authentication. Managers claim a slot by name.
- No in-game decisions. Managers build, then watch; they do not call plays.
- No live head-to-head scheduling. The tournament is simulated, not played out
  in real time across 12 devices.
- No trading, no re-drafts, no multi-season history.
- No live data feed. The ratings table is static and versioned in the repo.
- Not mobile-native. It is a responsive web page, not an app store build.

## Facts (discovered, not asked)

- `ritvik-v/1v1-simulator` was an empty repo — `README.md` with one line, one
  commit (`6795d33`). No stack, no CI, no prior art to conform to.
- Working branch `claude/fantasy-basketball-draft-picker-8arl6f` already exists
  on origin.
- Node v22.22.2, npm 10.9.7, Python 3.11.15 available. Node 22 ships
  `node:test` and `node:assert`, so the test suite needs zero dependencies.
- The user's `ritvik-v/factory` skills repo defines this workflow
  (`factory-sharpen` → `factory-plan` → `factory-build` → `factory-judge`) and
  its working agreement in `AGENTS.md`.
- Artifact runtime contract 0.2.44. Capabilities available to this account:
  `artifact`, `db`, `downloads`, `mcp`, `room`, `sample`, `self`. The `user`
  capability is NOT available, which means `data/users/{self}` private subtrees
  are unavailable — see Risks.

## Decisions

1. **Salary cap, not exclusive drafting.** Every manager gets the same budget
   and the same full pool. Two managers may buy the same source player. Skill is
   expressed as optimization under a constraint, and building is asynchronous —
   no need to get 12 people online simultaneously.
2. **Budget is 750 points.** Attribute cost is `round(250 * (rating/100)^3.2)`,
   a convex curve so elite ratings are disproportionately expensive. Calibrated
   so a flat 85-across-the-board build costs 745 — right at the cap — and a
   three-elites-two-scrubs build costs about the same. Neither strategy is
   free money.
3. **Five attribute slots**, per the user's override of the recommended ten:
   Shot Creation, Handles, Frame, Defense, Athleticism.
4. **Shot Creation covers getting the shot off AND making it.** With five slots
   there is no separate jump-shot slot, so this one slot is the entire offensive
   scoring axis: separation, shot difficulty tolerance, and conversion.
5. **The other four slots are broad by design.** Handles = ball security under
   pressure and change of direction. Frame = height, length and strength
   together. Defense = on-ball containment, contest and shot-blocking.
   Athleticism = first step, burst, vertical and conditioning.
6. **Ratings are hand-authored for 1v1, not copied from 2K.** 2K ratings are
   tuned for 5-on-5, where passing and help defense matter. In 1v1 they do not.
   Playmaking is worth nothing, rim protection is worth less, and on-ball
   defense is worth more. 2K ratings and career/peak statistics are reference
   points, not the source.
7. **Pool is ~120 curated players at peak season**, drawn from All-NBA /
   All-Star / All-Defense selections 2005-2025, plus iconic pre-2005 legends
   tagged by era so a commissioner can exclude them.
8. **Matches are stochastic, from a seeded RNG.** First to 11, win by 2, hard
   cap at 21, make-it-take-it, 1s and 2s. Every match is reproducible from its
   seed — the same seed always produces the same game, which is what makes the
   result auditable rather than "the computer said so".
9. **Every series is best-of-3**, so a single unlucky game does not decide a
   draft slot.
10. **Format is three groups of four, round robin, then a full placement
    bracket.** Every one of the 12 positions is decided by a played series, not
    by a tiebreak formula. Nobody's night ends after one loss.
11. **Builds are blind until all 12 lock**, then reveal at once.
12. **Delivery is a published Artifact page backed by the `db` capability**, so
    all 12 managers share one link and one live state. The repo holds the
    source of truth: ratings data, engine, tests, and a build step that inlines
    everything into the page.
13. **No authentication.** A manager claims a slot, and the claim is held by a
    token in that browser's `localStorage`. Contested claims are resolved with
    a `db` lease so two people cannot claim one slot.

## Acceptance criteria

- [t1] AC-1: Given `data/players.json`, when the schema test runs, then every
  player has a unique id, a name, a season, an era tag, and five integer ratings
  in 1..99, and the file contains at least 110 players.
- [t1] AC-2: Given any rating r in 1..99, when `costOf(r)` runs, then it returns
  a positive integer, and `costOf(a) < costOf(b)` for every a < b (strictly
  monotonic — no two adjacent ratings cost the same).
- [t1] AC-3: Given a build with all five slots at rating 85, when it is priced,
  then the total is within 10 points of the 750 cap — proving the cap actually
  binds rather than being decorative.
- [t1] AC-4: Given a build whose cost exceeds 750, when it is validated, then
  validation fails naming the overage, and the build cannot be locked.
- [t1] AC-5: Given a build missing any of the five slots, when it is validated,
  then validation fails naming the empty slots, and the build cannot be locked.
- [t1] AC-6: Given two identical builds and the same seed, when a game is
  simulated twice, then both runs produce a byte-identical final score and
  play-by-play log.
- [t1] AC-7: Given two identical builds, when 2000 games are simulated across
  varied seeds, then each side wins between 45% and 55% of them — the engine has
  no side bias.
- [t1] AC-8: Given any simulated game, when it ends, then the winner has at
  least 11 points, leads by 2 or more OR has exactly the 21-point hard cap, and
  the loser's score is lower.
- [t1] AC-9: Given a build with every rating 10 points higher than its
  opponent's, when 500 best-of-3 series are simulated, then the stronger build
  wins between 70% and 92% of the series — skill dominates, but upsets remain
  possible.
- [t1] AC-10: Given two builds of equal total cost but opposite shapes (one
  balanced, one stars-and-scrubs), when 2000 games are simulated, then neither
  wins more than 65% — no single build shape is degenerate.
- [t1] AC-11: Given any simulated game, when the play-by-play is read, then
  every possession line names the acting player's build, the action taken, and
  the outcome, and the running score after a scoring play matches the final
  tally when replayed.
- [t1] AC-12: Given 12 locked builds, when the tournament runs, then it returns
  exactly 12 placements numbered 1..12 with no duplicates and no gaps.
- [t1] AC-13: Given 12 locked builds, when the tournament runs, then every one
  of the 12 placements is traceable to at least one series that team played, and
  the bracket contains 38 series in total (18 group + 20 bracket).
- [t1] AC-14: Given the same 12 builds and the same tournament seed, when the
  tournament runs twice, then both runs produce an identical placement order.
- [t1] AC-15: Given fewer than 12 locked builds, when the tournament is
  requested, then it refuses and names how many builds are still missing.
- [t1] AC-16: Given `tools/build.js`, when the build runs, then it emits
  `app.html` containing the full ratings table and engine inline, with no
  external script or stylesheet references except the CDN allowlist.
- [t1] AC-17: Given the generated `app.html`, when it is parsed, then it
  contains no `<!DOCTYPE>`, `<html>`, `<head>` or `<body>` tag, per the Artifact
  publishing contract.
- [t1] AC-18: Given `claude.use("db")` resolves null, when the page loads, then
  it still renders and explains that league sync is unavailable, rather than
  throwing or showing a blank screen.
- [t1] AC-19: Given a manager has locked a build, when another manager views the
  league screen before all 12 locks, then the locked build's attribute picks are
  not present anywhere in the rendered DOM.
- [t1] AC-20: Given the pool, when the balance report runs, then no single
  source player is the cheapest option at more than one attribute slot while
  also being top-10 in that slot — a crude check that no player is a strictly
  dominant buy.
- [t2] AC-21: Given the published artifact, when two browsers open it and one
  locks a build, then the other sees the lock count increase without a reload.

## Round 2 — The Lab (2026-09-09, requested after gate 1)

Scope added at the user's request: a solo sandbox for testing a build without
creating a league. Not an amendment — nothing above changed.

### Decisions
- The Lab lives in the same artifact, not a separate one, so there is one link.
- It is the landing tab when no league exists. Setup is no longer forced.
- Eight preset opponents, each cap-legal with five distinct sources, spread so
  the field averages 37%-60% against itself. A field that is all pushovers or
  all monsters would make the headline number meaningless.
- The headline is win rate across the whole field, not against one opponent —
  a single matchup says more about the matchup than about the build.
- Chart marks use their own validated tokens. The UI accent green (#1F5E4E)
  has chroma 0.069 and reads gray as a chart fill, so charts use #0E7A5C /
  #C4441F in light and #20A47C / #EA6134 in dark.
- Lab state is browser-local and never written to the league's shared store.

### Acceptance criteria
- [t1] AC-22: Given a build and an opponent, when the same head-to-head is run
  twice with the same seed, then both runs return identical aggregates.
- [t1] AC-23: Given a head-to-head result, when its shot mix is summed, then it
  totals 1, and shooting percentage, clean-look rate and blow-by rate are all
  between 0 and 1.
- [t1] AC-24: Given a flat-90 build and a flat-70 build, when both are run
  against the same field, then the stronger build's gauntlet score exceeds the
  weaker one's by at least 20 points.
- [t1] AC-25: Given a gauntlet result, when best and worst are read, then they
  are the maximum and minimum of the rows reported, and the overall score is the
  mean of those rows.
- [t1] AC-26: Given a five-slot build, when leverage runs, then it returns one
  row per slot sorted by impact, and every replacement it proposes leaves five
  distinct source players in the build.
- [t1] AC-27: Given any win rate from 0 to 100, when it is graded, then it falls
  into exactly one of Strong / Solid / Middling / Struggling with no gap.
- [t1] AC-28: Given a readout, when it is rendered, then its first line names
  the grade and the overall figure, and its second names the best and worst
  matchup by the names in the gauntlet rows.

## Appended

<empty — written only by factory-judge>

## Risks

- **No `user` capability.** True cryptographic blindness is impossible: builds
  live in shared `db` documents, so a manager who opens devtools could read a
  rival's build before reveal. Blindness is enforced in the UI, not by the
  platform. For a 12-person friend league this is an honor-system problem, not a
  security one, but it must be stated plainly rather than implied to be secure.
- **Hand-authored ratings are opinions.** 600 numbers reflect one view of how
  players translate to 1v1. Managers will argue about them. This is a feature as
  much as a bug, but the ratings file must be human-readable and easy to amend.
- **Sim calibration is the hardest part.** Constants that make basketball sense
  can still produce a game where one build shape always wins. AC-7, AC-9 and
  AC-10 exist to catch this, and the constants may need several tuning passes.
- **Make-it-take-it can produce runaways.** A large skill gap compounds. AC-8
  and the 21-point hard cap bound the damage; AC-9 bounds the fairness.
- **5,000-document db cap.** Storing full play-by-play for 38 series x 3 games
  would approach it. Store the tournament as one document with logs regenerated
  on demand from the seed.
