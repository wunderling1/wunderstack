#!/usr/bin/env bash
# Unit tests for resolve-path-scope.sh — no network, no repo state.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/scripts/ci/resolve-path-scope.sh"
chmod +x "$SCRIPT"

fail=0
assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "PASS  $name"
  else
    echo "FAIL  $name — expected '$expected', got '$actual'"
    fail=1
  fi
}

assert_eq "dashboard-only → empty" "" \
  "$(printf 'apps/dashboard/app/page.tsx\n' | "$SCRIPT" 2>/dev/null)"

assert_eq "rag → grounded" "G2-retrieval,G2-multi-turn,G2-answer" \
  "$(printf 'packages/rag/src/retrieve.ts\n' | "$SCRIPT" 2>/dev/null)"

assert_eq "roleplay-judge only → roleplay, not G2-answer" \
  "G2-roleplay-persona,G2-roleplay-review" \
  "$(printf 'packages/agents/src/evals/roleplay-judge.ts\n' | "$SCRIPT" 2>/dev/null)"

assert_eq "harness.ts → both collections" \
  "G2-retrieval,G2-multi-turn,G2-answer,G2-roleplay-persona,G2-roleplay-review" \
  "$(printf 'packages/agents/src/evals/harness.ts\n' | "$SCRIPT" 2>/dev/null)"

assert_eq "roleplay agent → roleplay" \
  "G2-roleplay-persona,G2-roleplay-review" \
  "$(printf 'packages/agents/src/roleplay/agent.ts\n' | "$SCRIPT" 2>/dev/null)"

assert_eq "answer-floors → grounded" "G2-retrieval,G2-multi-turn,G2-answer" \
  "$(printf 'packages/agents/src/evals/answer-floors.ts\n' | "$SCRIPT" 2>/dev/null)"

if [ "$fail" -ne 0 ]; then
  echo "resolve-path-scope tests FAILED"
  exit 1
fi
echo "resolve-path-scope tests PASSED"
