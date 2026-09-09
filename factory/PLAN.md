# Plan: 1v1 Simulator
created: 2026-09-09
status: approved
spec: factory/SPEC.md

Dependency-ordered slices. Each names the criteria it serves.

## S1 — Ratings table and pricing
`data/players.json`, `src/ratings.js`
~120 players x 5 hand-authored 1v1 ratings; convex cost curve; build pricing
and validation.
Serves: AC-1, AC-2, AC-3, AC-4, AC-5, AC-20

## S2 — Possession engine
`src/sim.js`
Seeded RNG, turnover/shot-selection/make/rebound model, make-it-take-it to 11
win-by-2 cap 21, play-by-play emission.
Serves: AC-6, AC-8, AC-11

## S3 — Calibration
`test/balance.test.js`
Empirically tune S2 constants until no side bias, skill dominates without
killing upsets, and no build shape is degenerate.
Serves: AC-7, AC-9, AC-10

## S4 — Tournament
`src/tournament.js`
3 groups of 4 round robin, then championship + 5-8 + 9-12 placement brackets.
38 best-of-3 series, full 1..12 placement.
Serves: AC-12, AC-13, AC-14, AC-15

## S5 — Web app
`web/app.template.html`, `tools/build.js`, `app.html`
Setup / Build / League / Tournament / Draft-order screens. db-backed shared
state, slot claiming by lease, blind-until-lock, degrade cleanly with no db.
Serves: AC-16, AC-17, AC-18, AC-19

## S6 — Publish and verify
Publish the artifact; two-browser sync check.
Serves: AC-21
