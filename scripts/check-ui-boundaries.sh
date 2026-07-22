#!/usr/bin/env bash
# UI boundary checks — Hard rules A and B from ui-boundaries.mdc.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

failures=0

# Hard rule A: packages/ui must not import packages/agents
if rg -q '@wunderstack/agents|packages/agents' packages/ui --glob '*.{ts,tsx}' 2>/dev/null; then
  echo "FAIL: packages/ui imports packages/agents (Hard rule A)"
  rg '@wunderstack/agents|packages/agents' packages/ui --glob '*.{ts,tsx}' || true
  failures=$((failures + 1))
fi

# Hard rule B: no raw hex or primitive token references in component files
COMPONENT_DIRS=(
  "packages/ui/src/primitives"
  "packages/ui/src/trust-patterns"
)

for dir in "${COMPONENT_DIRS[@]}"; do
  if [ ! -d "$dir" ]; then
    continue
  fi
  if rg -q '#[0-9a-fA-F]{3,8}\b|--(indigo|neutral|verified|caution|refusal|danger)-' "$dir" --glob '*.{ts,tsx}' 2>/dev/null; then
    echo "FAIL: raw hex or primitive token in $dir (Hard rule B)"
    rg '#[0-9a-fA-F]{3,8}\b|--(indigo|neutral|verified|caution|refusal|danger)-' "$dir" --glob '*.{ts,tsx}' || true
    failures=$((failures + 1))
  fi
done

if [ "$failures" -gt 0 ]; then
  echo "$failures UI boundary check(s) failed."
  exit 1
fi

echo "UI boundary checks passed."
