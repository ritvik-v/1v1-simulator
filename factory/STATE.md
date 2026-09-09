# State: 1v1 Simulator
updated: 2026-09-09

## Run
Gate 1 (SPEC) approved, gate 2 (PLAN) approved. Build in progress.

## Tasks
- S1 ratings + pool — VERIFIED (9 tests, AC-1..5, AC-20)
- S2 possession engine — VERIFIED (AC-6, AC-8, AC-11)
- S3 calibration — VERIFIED (AC-7, AC-9, AC-10) after 5 tuning passes
- S4 tournament — VERIFIED (7 tests, AC-12..15)
- S5 web app — in progress
- S6 publish + sync check — not started

## Deviations
- Shape-balance measurement initially compared builds of unequal cost (balanced
  spent 745, sniper 619), which made `balanced` look dominant. Harness now fits
  every shape to the cap before comparing. The original numbers were measuring
  budget, not shape.
- Added two mechanics not in the original model, both to stop size from being a
  blanket advantage: a drive blow-by when quickness beats the defender outright,
  and a clean-look jumper when release speed beats the closeout. Before these,
  `speedster` and `sniper` lost to `giant` 69% and 62% of the time.

## Failed approaches
- Uniformly scaling every coefficient down flattened the skill gradient but did
  not fix shape imbalance — the problem was which slots the coefficients were
  attached to, not their size.

## Parked
none
