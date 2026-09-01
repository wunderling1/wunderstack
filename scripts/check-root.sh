#!/usr/bin/env bash
#
# Allowlist guard for the repository root.
#
# The repo root is allowlist-only: it holds entry docs, tooling config and the
# top-level code/meta directories — nothing else. Plans belong under docs/plans/,
# audits under docs/audit/, and scratch/debug output under tmp/ (gitignored).
#
# Adding a new tracked root entry requires adding it to `allowed` below in the
# SAME pull request. See AGENTS.md ("Repo layout (enforced)").
#
# Only tracked top-level entries are checked; gitignored caches, dumps and
# node_modules are irrelevant to this guard. bash 3.2 compatible (macOS default).

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

allowed=" \
  .cursor \
  .dependency-cruiser.cjs \
  .env.example \
  .github \
  .gitignore \
  AGENTS.md \
  Procfile \
  README.md \
  apps \
  docs \
  eslint.config.mjs \
  package.json \
  packages \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  scripts \
  tsconfig.base.json \
  turbo.json \
"

violations=""
while IFS= read -r entry; do
  case " $allowed " in
    *" $entry "*) ;;
    *) violations="$violations $entry" ;;
  esac
done < <(git ls-files | sed 's#/.*##' | sort -u)

if [ -n "$violations" ]; then
  echo "check-root: disallowed entries in repo root:" >&2
  for v in $violations; do echo "  - $v" >&2; done
  echo "" >&2
  echo "Root is allowlist-only. Move plans under docs/plans/, audits under docs/audit/," >&2
  echo "and scratch/debug output under tmp/ (gitignored) — or, if the entry genuinely" >&2
  echo "belongs in root, add it to the allowlist in scripts/check-root.sh in the same PR." >&2
  exit 1
fi

echo "check-root: ok — all tracked root entries are allowlisted."
