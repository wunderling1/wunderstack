# Branch protection check — `main` (Fase G0 / PLAN-v3 Fase 14 stap 1)

> Status: **not yet applied** — `gh` is not authenticated in this environment
> (`gh auth login` / `GH_TOKEN` required). This file is the checklist + intended
> API call so the setting can be applied deliberately.
>
> Context (exhibit A): a branch named `docs/organize-meta` rewrote the eval
> subsystem (36 files, deleted `report-writer.ts` / `baseline.ts`) and was
> checked out mid-eval-run, forcing a stash restore. Branch protection on
> `main` is what should have made a silent merge of that rewrite impossible.

## Intended settings

| Setting | Value |
|---|---|
| Required status check | `verify` |
| Require branches up to date before merge | yes |
| Require pull request before merging | yes (recommended) |
| Include administrators | yes (admin-bypass **off**) |
| Allow force pushes | no |
| Allow deletions | no |

## Apply (once `gh` is authenticated)

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

gh api -X PUT "repos/${REPO}/branches/main/protection" \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["verify"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

## Verify + archive proof

```bash
gh api "repos/${REPO}/branches/main/protection" > docs/audit/branch-protection-proof.json
```

Paste or commit the proof JSON next to this file once applied. Until then this
checklist documents intent only.

## Related archival

Local rename applied: `docs/organize-meta` → `archive/docs-organize-meta`.
Remote rename (delete old remote branch + push the archive name) is **not**
done — needs an explicit go-ahead.
