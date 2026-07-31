# Branch protection check — `main` (Fase G0 / PLAN-v3 Fase 14 stap 1)

> Status: **APPLIED (partial)** — re-verified 2026-07-30 for P0.1 of
> `docs/plans/PLAN-gate-scalability-test.md`. Proof: `docs/audit/branch-protection-proof.json`.
>
> **Correction (2026-07-30): enforcement lives in a repository RULESET, not in classic
> branch protection.** Ruleset `main` (id `18689890`, created 2026-07-08, `enforcement: active`,
> `include: ~DEFAULT_BRANCH`) carries the required status check `verify`
> (`strict_required_status_checks_policy: true`), plus `deletion` and `non_fast_forward` rules,
> with **`bypass_actors: []`** — so there is no admin bypass. The classic protection object on
> the same branch is near-empty (`required_status_checks.enforcement_level: "off"`,
> `enforce_admins.enabled: false`). Both are captured in the proof JSON because they disagree.
>
> **Consequence: the verify command previously listed in this file reads the wrong object.**
> `gh api .../branches/main/protection` now returns no required checks and
> `enforce_admins: false`, which reads as "protection is off" while `verify` is in fact required.
> Anyone auditing via that endpoint alone draws the opposite of the true conclusion. Use the
> ruleset endpoint (below).
>
> **Remaining gaps:** no pull-request rule (so a direct push to `main` that passes `verify` is
> still allowed, and no review is required) and no merge-queue.
> **Caveat (see code-review-2026-07-20-2217.md, Post-review
> corrections #4):** a required check is only as strong as what runs inside it — the
> `verify` check was green while Gate B/C were inert (Turbo stripped `EVAL_REQUIRE_ALL`
> + secrets absent), so protection was guarding a hollow check on the quality axis.
> Branch protection + the "skipped ≠ passed" invariant are a pair.
>
> Context (exhibit A): a branch named `docs/organize-meta` rewrote the eval
> subsystem (36 files, deleted `report-writer.ts` / `baseline.ts`) and was
> checked out mid-eval-run, forcing a stash restore. Branch protection on
> `main` is what should have made a silent merge of that rewrite impossible.

## Intended settings vs. actual (2026-07-30)

| Setting | Intended | Actual | Where |
|---|---|---|---|
| Required status check `verify` | yes | **yes** | ruleset `main` |
| Require branches up to date before merge | yes | **yes** (`strict_required_status_checks_policy`) | ruleset `main` |
| Include administrators (no bypass) | yes | **yes** (`bypass_actors: []`) | ruleset `main` |
| Allow force pushes | no | **no** (`non_fast_forward`) | ruleset `main` |
| Allow deletions | no | **no** (`deletion`) | ruleset `main` |
| Require pull request before merging | yes | **yes** (added 2026-07-30) | ruleset `main` |
| Required approving reviews | 0 — see caveat | **0** (`dismiss_stale_reviews_on_push: true`) | ruleset `main` |
| Merge queue | optional | **NO — deliberate gap** | — |

### Caveat — a required approving review deadlocks a solo repo

GitHub does not let an author approve their own pull request. Setting
`required_approving_review_count: 1` on a single-maintainer repo makes `main` unmergeable rather
than protected. The defensible setting here is **require a pull request with
`required_approving_review_count: 0`**: it forces every change through a PR (so `verify` runs on
the merge ref and the history stays reviewable) without inventing a second reviewer who does not
exist. Raise the count when there is a second maintainer, not before. This is why the earlier
snippet in this file — which requested 1 approving review — was never safe to apply as written.

## Applied 2026-07-30 — pull-request rule on the existing ruleset

Do **not** re-apply classic branch protection: two overlapping mechanisms is how the confusion
above started. The rule was added to ruleset `18689890`, keeping `deletion`,
`non_fast_forward` and `required_status_checks` byte-identical and `bypass_actors` empty. Method:
read the ruleset, append the rule, PUT the merged object (a bare PUT **replaces** the rule list, so
never PUT only the new rule).

```json
{
  "type": "pull_request",
  "parameters": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews_on_push": true,
    "require_code_owner_review": false,
    "require_last_push_approval": false,
    "required_review_thread_resolution": false,
    "allowed_merge_methods": ["merge", "squash", "rebase"]
  }
}
```

**Still open — the enforcement demonstration.** The settings now say `main` is protected; that is not
the same as having *seen* it block. Next real PR: confirm that a failing `verify` blocks the merge
button, and record the run URL here. Until then this file documents configuration, not proof of
behaviour — exactly the distinction the caveat above is about.

## Verify + archive proof

The classic endpoint is misleading (see the banner). Capture **both** objects:

```bash
gh api "repos/${REPO}/rulesets/${RULESET}"            # the object that actually enforces
gh api "repos/${REPO}/branches/main/protection"       # near-empty; kept to show the disagreement
```

Current proof is committed as `docs/audit/branch-protection-proof.json` (both objects, timestamped).

## Related archival

Local rename applied: `docs/organize-meta` → `archive/docs-organize-meta`.
Remote rename (delete old remote branch + push the archive name) is **not**
done — needs an explicit go-ahead.
