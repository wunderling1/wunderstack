#!/usr/bin/env bash
# Resolve EVAL_PATH_SCOPE from a git diff --name-only list on stdin.
# Prints comma-separated gate ids (or empty for no path filter / full registry).
# Echoes a human-readable explanation to stderr.
#
# Three collections:
#   grounded  → G2-retrieval,G2-multi-turn,G2-answer
#   roleplay  → G2-roleplay-persona,G2-roleplay-review
#   shared    → both (harness, gates, content-policy, …)
#
# packages/agents/src/evals/ matches grounded EXCEPT roleplay-* and fixtures/roleplay-*.
set -uo pipefail

GROUNDED_GATES="G2-retrieval,G2-multi-turn,G2-answer"
ROLEPLAY_GATES="G2-roleplay-persona,G2-roleplay-review"

need_grounded=0
need_roleplay=0
trigger_grounded=""
trigger_roleplay=""

is_roleplay_eval_path() {
  case "$1" in
    packages/agents/src/evals/roleplay-*) return 0 ;;
    packages/agents/src/evals/fixtures/roleplay-*) return 0 ;;
    *) return 1 ;;
  esac
}

is_shared_eval_path() {
  case "$1" in
    packages/agents/src/evals/harness.ts|\
    packages/agents/src/evals/gates.ts|\
    packages/agents/src/evals/report-writer.ts|\
    packages/agents/src/evals/judge.ts|\
    packages/agents/src/evals/content-policy.ts|\
    packages/agents/src/evals/retry.ts|\
    packages/agents/src/evals/eval-lock.ts|\
    turbo.json|\
    .github/workflows/ci.yml)
      return 0
      ;;
    *) return 1 ;;
  esac
}

is_grounded_path() {
  local f="$1"
  case "$f" in
    packages/agents/src/cao/*|packages/agents/src/arbo/*|packages/agents/src/runtime/*|\
    packages/rag/*|packages/ai/*|packages/shared/src/config/*)
      return 0
      ;;
    packages/agents/src/evals/*)
      if is_roleplay_eval_path "$f"; then
        return 1
      fi
      if is_shared_eval_path "$f"; then
        return 1
      fi
      return 0
      ;;
    *) return 1 ;;
  esac
}

is_roleplay_path() {
  local f="$1"
  case "$f" in
    packages/agents/src/roleplay/*|\
    packages/agents/src/evals/roleplay-*|\
    packages/agents/src/evals/fixtures/roleplay-golden-set.json|\
    apps/roleplay/*)
      return 0
      ;;
    *) return 1 ;;
  esac
}

while IFS= read -r file || [ -n "$file" ]; do
  [ -z "$file" ] && continue
  if is_shared_eval_path "$file"; then
    need_grounded=1
    need_roleplay=1
    trigger_grounded="${trigger_grounded:-$file}"
    trigger_roleplay="${trigger_roleplay:-$file}"
    continue
  fi
  if is_grounded_path "$file"; then
    need_grounded=1
    trigger_grounded="${trigger_grounded:-$file}"
  fi
  if is_roleplay_path "$file"; then
    need_roleplay=1
    trigger_roleplay="${trigger_roleplay:-$file}"
  fi
done

scope=""
explain=""

if [ "$need_grounded" -eq 1 ] && [ "$need_roleplay" -eq 1 ]; then
  scope="${GROUNDED_GATES},${ROLEPLAY_GATES}"
  explain="grounded+roleplay (${trigger_grounded}; ${trigger_roleplay})"
elif [ "$need_grounded" -eq 1 ]; then
  scope="$GROUNDED_GATES"
  explain="grounded (${trigger_grounded})"
elif [ "$need_roleplay" -eq 1 ]; then
  scope="$ROLEPLAY_GATES"
  explain="roleplay (${trigger_roleplay})"
else
  scope="none"
  explain="none — diff does not touch grounded or roleplay surfaces"
fi

if [ "$scope" = "none" ]; then
  echo "Path scope: none — G2 behavioural gates not-applicable; G1 still runs — ${explain}" >&2
else
  echo "Path scope: ${scope} — ${explain}" >&2
fi

printf '%s\n' "$scope"
