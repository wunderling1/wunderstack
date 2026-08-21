#!/usr/bin/env bash
# Motion token checks — rules from docs/design/MOTION.md.
#
# Rule 1: no raw cubic-bezier() outside the token files.
# Rule 2: no transition/animation shorthand with a literal time value (e.g. 150ms) outside the token files.
# Rule 3: no transition of layout properties (height, width, top, left, right, bottom, margin, padding) anywhere.
# Rule 4: no Tailwind motion utilities (transition-*, animate-*) or @keyframes in apps/**.
#
# Allowlist: scripts/motion-allowlist.txt (one file path per line; # comments ignored).
# Add entries there when a violation must be grandfathered — include a TODO(fase-1) comment.
# Remove entries once the violation is fixed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ALLOWLIST_FILE="$ROOT/scripts/motion-allowlist.txt"

# is_allowlisted <filepath>: return 0 if the path is in the allowlist.
is_allowlisted() {
  local path="$1"
  if [[ ! -f "$ALLOWLIST_FILE" ]]; then return 1; fi
  # Strip leading ./ for comparison.
  path="${path#./}"
  grep -qxF "$path" "$ALLOWLIST_FILE" 2>/dev/null
}

# filter_allowlist: read lines from stdin; print those NOT in the allowlist.
filter_allowlist() {
  while IFS= read -r hit; do
    local filepath="${hit%%:*}"
    filepath="${filepath#./}"
    if is_allowlisted "$filepath"; then
      echo "  (allowlisted) $hit"
    else
      echo "VIOLATION: $hit"
    fi
  done
}

failures=0

# Rule 1: no raw cubic-bezier() outside token files.
echo "Rule 1: cubic-bezier() outside token files..."
RAW_BEZIER=$(rg --no-heading -n 'cubic-bezier\(' \
  --glob '*.{ts,tsx,css,scss}' \
  . 2>/dev/null \
  | grep -v 'packages/ui/src/tokens/' \
  || true)
if [[ -n "$RAW_BEZIER" ]]; then
  filtered=$(echo "$RAW_BEZIER" | filter_allowlist)
  violations=$(echo "$filtered" | grep -c '^VIOLATION:' || true)
  if [[ "$violations" -gt 0 ]]; then
    echo "FAIL: raw cubic-bezier() outside token files (Rule 1)"
    echo "$filtered"
    failures=$((failures + violations))
  else
    echo "$filtered"
    echo "  ok (all allowlisted)"
  fi
else
  echo "  ok"
fi

# Rule 2: transition/animation shorthand with a literal time value outside token files.
echo "Rule 2: literal time values in transition/animation outside token files..."
RAW_TIME=$(rg --no-heading -n '(transition|animation)[^;]*[0-9]+m?s' \
  --glob '*.{ts,tsx,css,scss}' \
  . 2>/dev/null \
  | grep -v 'packages/ui/src/tokens/' \
  || true)
if [[ -n "$RAW_TIME" ]]; then
  filtered=$(echo "$RAW_TIME" | filter_allowlist)
  violations=$(echo "$filtered" | grep -c '^VIOLATION:' || true)
  if [[ "$violations" -gt 0 ]]; then
    echo "FAIL: literal time value in transition/animation outside token files (Rule 2)"
    echo "$filtered"
    failures=$((failures + violations))
  else
    echo "$filtered"
    echo "  ok (all allowlisted)"
  fi
else
  echo "  ok"
fi

# Rule 3: transition of layout properties anywhere (no allowlist — hard ban).
echo "Rule 3: transitions of layout properties (height/width/top/left/right/bottom/margin/padding)..."
LAYOUT_TRANS=$(rg --no-heading -n \
  '^\s*transition[^;]*(height|width|\btop\b|\bleft\b|\bright\b|\bbottom\b|margin|padding)' \
  --glob '*.{ts,tsx,css,scss}' \
  . 2>/dev/null \
  || true)
if [[ -n "$LAYOUT_TRANS" ]]; then
  count=$(echo "$LAYOUT_TRANS" | wc -l | tr -d ' ')
  echo "FAIL: transition of layout property found (Rule 3)"
  echo "$LAYOUT_TRANS" | while IFS= read -r hit; do echo "  $hit"; done
  failures=$((failures + count))
else
  echo "  ok"
fi

# Rule 4: Tailwind motion utilities or @keyframes in apps/**.
echo "Rule 4: Tailwind motion utilities / @keyframes in apps/**..."
APP_MOTION=$(rg --no-heading -n \
  '(^|[ \t"'"'"'])(transition-|animate-)|\@keyframes' \
  --glob '*.{ts,tsx,css,scss}' \
  apps/ 2>/dev/null \
  || true)
if [[ -n "$APP_MOTION" ]]; then
  filtered=$(echo "$APP_MOTION" | filter_allowlist)
  violations=$(echo "$filtered" | grep -c '^VIOLATION:' || true)
  if [[ "$violations" -gt 0 ]]; then
    echo "FAIL: motion utilities found in apps/** (Rule 4)"
    echo "$filtered"
    failures=$((failures + violations))
  else
    echo "$filtered"
    echo "  ok (all allowlisted)"
  fi
else
  echo "  ok"
fi

if [[ "$failures" -gt 0 ]]; then
  echo ""
  echo "$failures motion check(s) failed."
  exit 1
fi

echo ""
echo "Motion checks passed."
