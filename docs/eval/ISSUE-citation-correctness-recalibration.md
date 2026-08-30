# Issue — Re-calibrate `scoreCitationCorrectness` (deferred)

**Status:** open · **Created:** 2026-08-22 · **Blocked on:** baseline re-record after corpus v5  
**File:** `packages/agents/src/evals/judge.ts` (`scoreCitationCorrectness`)

> GitHub `gh issue create` was unavailable in this environment (API Forbidden). Track here until filed remotely.

## Context

From the 2026-08-22 eval/gates quality analysis (recovery plan, consciously deferred).

`scoreCitationCorrectness` is effectively non-failing:

1. **First branch always-1.0:** if the answer mentions the expected article number AND has any `[n]` marker (or a cited-article match), it returns `1` — regardless of whether that `[n]` points at the right passage.
2. **Dead slice:** `passage.content.slice(0, 40).toLowerCase().slice(0, 20)` — the first slice is a no-op.
3. The metric has sat at exactly `1.000` for months; the 0.75 floor is decorative.

## Why not fix in the recovery PRs

Tightening the scorer makes the gate stricter than the baseline it was admitted against. That is a **re-calibration**, not a quick fix.

## When to pick up

The corpus v5 baseline was recorded on 2026-08-29 (see GATE-ARCHITECTURE.md §4.4), so the relative layer is live again. Do not land a stricter citation scorer without re-recording a fresh green baseline under `EVAL_WRITE_BASELINE=1`.

## Acceptance

- Citation score requires the cited `[n]` passage to actually match `expectedArticle` (or non-vacuous content overlap).
- Remove the dead double-slice.
- Re-measure aggregates; update `ANSWER_THRESHOLDS.citationCorrectness` and baseline if the distribution shifts.
- Document the change in `docs/eval/GATE-ARCHITECTURE.md` §G2-answer.
