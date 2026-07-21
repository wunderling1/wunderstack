# Gate architecture — invariants the eval cannot police on its own

The CAO-agent eval (`packages/agents/src/evals/cao.eval.ts`) is the quality bar we sell to funds:
"green eval on `main` = the answer quality users actually get". That promise only holds if a set of
**invariants** hold — and the eval cannot check most of them from inside itself. This document is the
source of truth for those invariants and where each one is enforced.

Context: commit `c763ea0` ("share verified-answer path across answer() and stream") silently reverted
the eval to a hardcoded, cheaper generator (`mistral-small-2603`, single-shot, no repair loop) while
production shipped `mistral-large-2512` + `generateAnswerWithRepair`. The merge to `main` (`a35c13d`)
went **green** anyway. This document exists so that class of drift fails loudly next time.

---

## Invariant 1 — the eval scores the model production ships

**Rule.** The eval generator MUST equal the production generator (`DEFAULT_LLM_MODEL`), diverging ONLY
via an explicit `EVAL_GENERATION_MODEL` override. Never a hardcoded model literal.

```ts
// packages/agents/src/evals/cao.eval.ts
const EVAL_LLM_MODEL = env.EVAL_GENERATION_MODEL ?? DEFAULT_LLM_MODEL;
```

The eval must also run generation through the **same seam** production uses
(`generateAnswerWithRepair`, `maxAttempts: env.EVAL_GENERATION_SAMPLES ?? 2` = one generation + one
repair), not a bespoke single-shot `generateText` call. Scoring a different model or a different
generation path means Gate C validates something users never receive.

**Enforcement.**
- Offline unit test: `packages/agents/src/evals/eval-model-coupling.test.ts` (runs on `test:unit`, no
  API keys, so it fires on every PR even when Gate C skips). It fails if `EVAL_LLM_MODEL` is assigned
  anything other than `env.EVAL_GENERATION_MODEL ?? DEFAULT_LLM_MODEL`, or if it is pinned to a literal.
- The per-run artefact records `models.generator` (= `EVAL_LLM_MODEL`) so any drift is visible in
  `eval-report.json`.

**Corollary — `DEFAULT_LLM_MODEL` is a load-bearing choice, not a free rider.** Every consumer of
`DEFAULT_LLM_MODEL` (production generator, eval generator, and ancillary calls like query condensation)
inherits any bump. A change to `DEFAULT_LLM_MODEL` is a production-wide cost + behaviour change and
deserves a decision-log/ADR entry — not a side effect buried in a gate close-out. (The Small→Large bump
in `a9299a1` is the cautionary example: it moved condensation onto Large too, at ~3× input price for a
64-token rewrite.)

---

## Invariant 2 — skipped ≠ passed (a gate that can't run must go RED where it's required)

**Rule.** On the protected paths (`push` to `main`, `merge_group`, `schedule`, and same-repo PRs) a gate
that cannot run because a credential is missing MUST **fail**, not skip. `EVAL_REQUIRE_ALL=1` is what
turns a skip into a fail (`REQUIRE_ALL` / `reportUnavailable` in `cao.eval.ts`); `EVAL_REQUIRE_DB=1` does
the same for the nightly DB-backed integration gates.

**The subtle failure mode (this bit us).** The eval code already implemented skip-as-fail correctly.
The hole was upstream: **Turbo (v2, strict environment mode by default) filters out every env var not
declared for the task.** `ci.yml` set `EVAL_REQUIRE_ALL=1` on the *job*, but the `test` task only
declared `SCALEWAY_API_KEY` + `MISTRAL_API_KEY`, so `EVAL_REQUIRE_ALL` (and `DATABASE_URL`,
`EVAL_REQUIRE_DB`, `EVAL_JUDGE_SAMPLES`, `GITHUB_SHA`, …) never reached the eval process. Result:
`REQUIRE_ALL` evaluated to `false`, Gate B/C skipped-and-passed, and the merge went green. Evidence:
run `29767229051` (`push` @ `a35c13d`) = `success` with `EVAL_REQUIRE_ALL='1'` nominally set.

**Enforcement.**
- `turbo.json`: the `test` task declares **all** eval control + credential vars in `passThroughEnv`, and
  sets `"cache": false` (a live eval that hits the network/DB must never replay a cached "pass").
  Any new `EVAL_*`/credential the eval reads MUST be added there or it will be silently stripped in CI.
- `ci.yml`: `EVAL_REQUIRE_ALL` is `1` on `push`/`merge_group`/`schedule`/same-repo PRs; `0` on fork PRs
  (which legitimately have no secrets).
- Branch protection on `main` requires the `verify` check. **But a required check is only as strong as
  what runs inside it** — with Invariant 2 broken, `verify` was green while the gates were inert. Branch
  protection + this invariant are a pair; neither alone is a lock.

---

## Invariant 3 — one verified-answer seam, three consumers

The structural endgame implied by `c763ea0`'s own title: the verified-answer path
(`generateVerifiedAnswer` / `generateAnswerWithRepair`) has **three** consumers — `answer()`,
`answerStream()`, and the **eval**. When all three share the single exported seam, divergence requires a
deliberate code change instead of a merge accident. If you find yourself re-implementing generation
inside the eval, stop: import the seam instead.

---

## Change-control on `src/evals/` (prevention, since there is no second reviewer)

As a solo founder there is no second human reviewer; the merge itself is the only gate. Two habits:

1. **`.cursor/rules/700-evals.mdc`** — do not modify files under `packages/agents/src/evals/` (or the
   eval's production seams) outside an explicit instruction to do so. The eval is the measuring
   instrument; changing it as a side effect of unrelated work is how `c763ea0` happened.
2. **Diffstat merge habit** — before merging any branch, eyeball `git diff --stat <base>...HEAD`. A large
   unexplained delta on an eval/measurement file (c763ea0 was **−806 net** on `cao.eval.ts` in a commit
   scoped to `agent.ts`) is a stop sign: reconcile it before landing.

---

## Quick checklist when touching the eval or its config

- [ ] `EVAL_LLM_MODEL` still `env.EVAL_GENERATION_MODEL ?? DEFAULT_LLM_MODEL` (unit test green).
- [ ] Generation goes through `generateAnswerWithRepair` (the production seam), not a one-shot call.
- [ ] Any new `EVAL_*`/credential var is declared in `turbo.json` `passThroughEnv` AND `.env.example`.
- [ ] `turbo.json` `test` task still has `"cache": false`.
- [ ] A `DEFAULT_LLM_MODEL` change has a decision-log/ADR entry.
- [ ] Diffstat reviewed; no unexplained delta on `src/evals/`.
