# State: 1v1 Simulator
updated: 2026-09-09

## Run
Gate 1 (SPEC) approved, gate 2 (PLAN) approved. Build in progress.

## Tasks
- S1 ratings + pool — VERIFIED (9 tests, AC-1..5, AC-20)
- S2 possession engine — VERIFIED (AC-6, AC-8, AC-11)
- S3 calibration — VERIFIED (AC-7, AC-9, AC-10) after 5 tuning passes
- S4 tournament — VERIFIED (7 tests, AC-12..15)
- S5 web app — VERIFIED (5 tests, AC-16..19) plus a full Chromium walkthrough:
  setup, claim, build, lock, build-code export, 11-code import, tournament run,
  draft board, play-by-play, light and dark
- S6 publish — DONE: https://claude.ai/code/artifact/24d637c2-dba9-4cbc-b492-68edd5f77a84
  AC-21 (two-browser live sync) is UNVERIFIED — it needs two signed-in humans on
  the published page, which cannot be checked from here. Not claimed as passing.

## Round 2 — The Lab
- S7 scouting engine (`src/scout.js`) — VERIFIED (7 tests, AC-22..28)
- S8 Lab screen — VERIFIED in Chromium: lands with no league, "Surprise me"
  produces cap-legal builds (721-745 of 750), scout completes in ~600ms,
  all four report sections render, watch-a-game works, state survives reload,
  league creation still works afterwards.

## Deviations
- Shape-balance measurement initially compared builds of unequal cost (balanced
  spent 745, sniper 619), which made `balanced` look dominant. Harness now fits
  every shape to the cap before comparing. The original numbers were measuring
  budget, not shape.
- Added two mechanics not in the original model, both to stop size from being a
  blanket advantage: a drive blow-by when quickness beats the defender outright,
  and a clean-look jumper when release speed beats the closeout. Before these,
  `speedster` and `sniper` lost to `giant` 69% and 62% of the time.

## Discovered scope
- Nothing enforced that a build's five attributes came from five DIFFERENT
  players, so a generator happily produced "Shaq's frame and Shaq's
  athleticism". The user's own description of the format ("jump shot of one
  player, individual defense of another, frame of another") settles it. Rule
  added to validateBuild, enforced in the UI, covered by a test.
- Declaring the `db` capability makes an artifact organization-internal. A
  twelve-person friend league is not an org, so link-sharing alone would not
  have worked for most of them. Added build codes as a text-message path.
- The identity gate was blocking every tab, not just the build screen, so a
  spectator (or the demo) could never reach the tournament or draft board.

## Failed approaches (round 2)
- Generating preset opponents by filling every archetype to the cap homogenised
  them: The Sniper and The Iso Handler both converged on 99 shot creation /
  99 handle, because shot creation is the strongest buy. Fixed by scaling each
  archetype's SHAPE to the cap instead of greedily filling it.
- Uniform offset scaling then distorted the one low-variance shape (a pure
  shooter came out 99/82/84/72/80, which is not a pure shooter). That preset is
  hand-authored.
- The UI palette failed the categorical validator outright in both modes —
  chroma floor in light, lightness band in dark. Charts got their own tokens.

## Failed approaches
- Uniformly scaling every coefficient down flattened the skill gradient but did
  not fix shape imbalance — the problem was which slots the coefficients were
  attached to, not their size.

## Parked
none
