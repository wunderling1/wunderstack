#!/usr/bin/env bash
# Fail on GRANT/REVOKE/POLICY ... TO PUBLIC in new db DDL, except paths in
# scripts/grants-allowlist.txt (grandfathered history with a reason).
#
# Scanned: packages/db/migrations/ and packages/db/src/fund-ddl.ts
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ALLOWLIST_FILE="$ROOT/scripts/grants-allowlist.txt"

is_allowlisted() {
  local path="$1"
  path="${path#./}"
  if [[ ! -f "$ALLOWLIST_FILE" ]]; then return 1; fi
  grep -qxF "$path" "$ALLOWLIST_FILE" 2>/dev/null
}

echo "Checking for TO PUBLIC in packages/db/migrations and packages/db/src/fund-ddl.ts..."

HITS=$(rg --no-heading -n --glob '!**/meta/**' 'TO PUBLIC' \
  packages/db/migrations \
  packages/db/src/fund-ddl.ts \
  2>/dev/null || true)

failures=0
if [[ -n "$HITS" ]]; then
  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    filepath="${hit%%:*}"
    filepath="${filepath#./}"
    if is_allowlisted "$filepath"; then
      echo "  (allowlisted) $hit"
    else
      echo "VIOLATION: $hit"
      failures=$((failures + 1))
    fi
  done <<< "$HITS"
fi

if [[ "$failures" -gt 0 ]]; then
  echo "FAIL: $failures TO PUBLIC hit(s) not on the allowlist."
  echo "New grants must name a role (see scripts/db/grant-reader.ts). Do not GRANT TO PUBLIC."
  exit 1
fi

echo "  ok"
